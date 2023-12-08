// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { ClosingTabsProvider, FileItem } from "./closingTabsView";
// import { ClosingTabsView } from "./closingTabsView";

// let closingTabsView: ClosingTabsView;
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  outputChanel = vscode.window.createOutputChannel("Simplify-Tabs");
  logOutputChannel("Activate extension. Starting...");

  // closingTabsView = new ClosingTabsView(context);

  function initializeAutoClose() {
    let disposable: vscode.Disposable | null = null;
    if (enableAutoClose) {
      disposable = vscode.window.tabGroups.onDidChangeTabs(setResettingTimers);
      initializeRemovingTabs();
    }
    return { disposable };
  }
  function initializeAutoMove() {
    let disposable: vscode.Disposable | null = null;
    if (enableAutoMove) {
      disposable = vscode.window.onDidChangeActiveTextEditor(setMovingTimer);
    }
    return { disposable };
  }

  function initialize() {
    resettingTimersDisposable?.dispose();
    movingTimersDisposable?.dispose();
    ({
      enableAutoClose,
      retainingTabCount,
      waitingTime,
      isShiftByPinnedTab,
      isDirtyTabRemovalAllowed,
      isActiveTabRemovalAllowed,
      maximumDisplayCount,
      enableAutoMove,
      delayTime,
      canMovePinnedTab,
    } = getConfig());
    ({ disposable: resettingTimersDisposable } = initializeAutoClose());
    ({ disposable: movingTimersDisposable } = initializeAutoMove());
    closingTabsProvider = new ClosingTabsProvider(maximumDisplayCount);
    vscode.window.registerTreeDataProvider(
      "simplifyTabs.closingTabsView",
      closingTabsProvider
    );
  }

  initialize();
  logOutputChannel("Extension is activated.");

  const onDidChangeConfigurationDisposable =
    vscode.workspace.onDidChangeConfiguration(() => {
      logOutputChannel("Change configuration. Restarting...");
      initialize();
    });

  context.subscriptions.push(onDidChangeConfigurationDisposable);
  movingTimersDisposable && context.subscriptions.push(movingTimersDisposable);
  resettingTimersDisposable &&
    context.subscriptions.push(resettingTimersDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {
  logOutputChannel("Deactivate");
  movingTimersDisposable?.dispose();
  resettingTimersDisposable?.dispose();
  tabInfoTimers.forEach((tabInfoTimer) => clearTimeout(tabInfoTimer[1]));
}

let resettingTimersDisposable: vscode.Disposable | null;
let movingTimersDisposable: vscode.Disposable | null;

//Create output channel
let outputChanel: vscode.OutputChannel;

type TabInfo = {
  key: string;
  tab: vscode.Tab;
  tabGroup: vscode.TabGroup;
};
type TabInfoTimer = [TabInfo, NodeJS.Timeout];
export let tabInfoTimers: Map<string, TabInfoTimer> = new Map();

let closingTabsProvider: ClosingTabsProvider;

let enableAutoClose = true;
let retainingTabCount = 10;
let waitingTime = 10;
let isShiftByPinnedTab = true;
let isDirtyTabRemovalAllowed = false;
let isActiveTabRemovalAllowed = false;

let maximumDisplayCount: number = 5;

let enableAutoMove = false;
let movingPosition = 1; // not config option
let delayTime = 5;
let canMovePinnedTab = true;

const setMovingTimer = (e: vscode.TextEditor | undefined) => {
  if (!e) {
    return;
  }

  const tabs$1 = getTabs({ isOnlyActiveGroup: true });
  const prevActiveTab = filterTabs(tabs$1, "isActive")[0];
  setTimeout(() => {
    const tabs$2 = getTabs({ isOnlyActiveGroup: true });
    const nextActiveTab = filterTabs(tabs$2, "isActive")[0];
    if (prevActiveTab === nextActiveTab) {
      const pinned = filterTabs(tabs$2, "isPinned").length;
      let position = 1;
      if (nextActiveTab.isPinned && canMovePinnedTab) {
        position = pinned >= movingPosition ? movingPosition : pinned;
        moveActiveEditor(position);
        logOutputChannel(
          `Move tab. position: ${position} label: ${nextActiveTab.label}`
        );
      } else if (!nextActiveTab.isPinned) {
        position = pinned > 0 ? pinned + 1 : movingPosition;
        moveActiveEditor(position);
        logOutputChannel(
          `Move tab. position: ${position} label: ${nextActiveTab.label}`
        );
      }
    }
  }, delayTime * 1000);

  function moveActiveEditor(position: number) {
    vscode.commands.executeCommand("moveActiveEditor", {
      by: "tab",
      to: "position",
      value: position,
    });
  }
};

const initializeRemovingTabs = () => {
  const tabs = getTabs();
  const tabInfoArray = tabs.map(transformTabIntoTabInfo);
  tabInfoArray.map(resetTimer);
};

const setResettingTimers = (e: vscode.TabChangeEvent) => {
  e.changed.map((tab) => resetTimer(transformTabIntoTabInfo(tab)));
  e.opened.map((tab) => resetTimer(transformTabIntoTabInfo(tab)));
  e.closed.map((tab) => {
    const tabInfoTimer = findTabInfoTimer(transformTabIntoTabInfo(tab));
    if (tabInfoTimer) {
      clearTimeout(tabInfoTimer[1]);
    }
  });
};

const resetTimer = (tabInfo: TabInfo) => {
  const tabInfoTimer = findTabInfoTimer(tabInfo);
  if (tabInfoTimer) {
    clearTimeout(tabInfoTimer[1]);
  }
  const timer = setTimeout(() => {
    removeTabIfApplicable(tabInfo);
  }, waitingTime * 1000);
  tabInfoTimers.set(tabInfo.key, [tabInfo, timer]);
};

const removeTabIfApplicable = (tabInfo: TabInfo) => {
  const [tab, index, tabs] = findTab(tabInfo);
  const shiftRemains = isShiftByPinnedTab
    ? filterTabs(tabs, "isPinned").length
    : 0;

  if (
    tab &&
    shouldRemoveTab(tab) &&
    !isTabIndexLessThanRetainingTabCount(index, shiftRemains)
  ) {
    tabInfoTimers.delete(tabInfo.key);
    closeTab(tab);
    closingTabsProvider.refresh(transformTabInfoIntoFileItem(tabInfo));
  } else {
    const timer = setTimeout(() => {
      removeTabIfApplicable(tabInfo);
    }, waitingTime * 1000);
    tabInfoTimers.set(tabInfo.key, [tabInfo, timer]);
  }
};

const shouldRemoveTab = (tab: vscode.Tab) => {
  if (tab.isDirty && !isDirtyTabRemovalAllowed) {
    return false;
  } else if (tab.isActive && !isActiveTabRemovalAllowed) {
    return false;
  }

  return true;
};

const closeTab = (tab: vscode.Tab) => {
  vscode.window.tabGroups.close(tab);
};

const isTabIndexLessThanRetainingTabCount = (index: number, shift: number) => {
  return index < retainingTabCount + 0;
};

const getTabs = ({ isOnlyActiveGroup = false as boolean } = {}) => {
  const groups = vscode.window.tabGroups;
  const tabs = (
    isOnlyActiveGroup ? [groups.activeTabGroup] : groups.all
  ).reduce((acc, group) => {
    const tabs = group.tabs;
    return acc.concat(tabs);
  }, [] as vscode.Tab[]);
  return tabs;
};

// key must be boolean key of Tab
const filterTabs = (tabs: vscode.Tab[], key: keyof vscode.Tab) => {
  return tabs.filter((tab) => tab[key]);
};

const findTab = (tabInfo: TabInfo) => {
  let index = -1;
  let viewColumn = -1;
  let shiftIndex = 0;
  const tabs = getTabs();
  const tab = tabs.find((tab: vscode.Tab, idx) => {
    if (tab.group.viewColumn !== viewColumn) {
      viewColumn = tab.group.viewColumn;
      shiftIndex = idx;
    }
    if (compareTabAndTabInfo(tab, tabInfo)) {
      index = idx - shiftIndex;
      return true;
    } else {
      return false;
    }
  });
  return [tab, index, tabs] as const;
};

const findTabInfoTimer = (tabInfo: TabInfo) => {
  const tabInfoTimer = tabInfoTimers.get(tabInfo.key);
  return tabInfoTimer;
};

const transformTabIntoTabInfo = (tab: vscode.Tab): TabInfo => ({
  key: createTabInfoTimerKey(tab),
  tab,
  tabGroup: tab.group,
});

const compareTabAndTabInfo = (tab: vscode.Tab, tabInfo: TabInfo) => {
  const tabKey = createTabInfoTimerKey(tab);
  return tabKey === tabInfo.key;
};

const createTabInfoTimerKey = (tab: vscode.Tab) => {
  let name: string;
  try {
    if (tab.input instanceof vscode.TabInputCustom) {
      name = `[${tab.input.viewType}]:[${tab.input.uri.toString()}]`;
    } else if (tab.input instanceof vscode.TabInputNotebook) {
      name = `[${tab.input.notebookType}]:[${tab.input.uri.toString()}]`;
    } else if (tab.input instanceof vscode.TabInputNotebookDiff) {
      name = `[${
        tab.input.notebookType
      }]:[${tab.input.modified.toString()}]:[${tab.input.original.toString()}]`;
    } else if (tab.input instanceof vscode.TabInputTextDiff) {
      name = `[${tab.input.modified.toString()}]:[${tab.input.original.toString()}]`;
    } else if (tab.input instanceof vscode.TabInputWebview) {
      name = `[${tab.label}]:[${tab.input.viewType}]`;
    } else {
      // @ts-ignore
      name = `[${tab.input.uri.toString() ?? "__UNDEFINED__"}]`;
    }
  } catch {
    name = `${tab.label}`;
  }
  return `[${tab.group.viewColumn}]:${name}`;
};

const transformTabInfoIntoFileItem = (tabItem: TabInfo) => {
  try {
    // @ts-ignore
    const uri = tabItem.tab.input.uri as vscode.Uri;
    return new FileItem(uri, tabItem.tab.label, 0);
  } catch {
    return undefined;
  }
};

function getConfig() {
  const config = vscode.workspace.getConfiguration();
  return {
    enableAutoClose:
      config.get<boolean>("simplifyTabs.closeTabs.enableAuto") ??
      enableAutoClose,
    retainingTabCount:
      config.get<number>("simplifyTabs.closeTabs.retainingTabCount") ??
      retainingTabCount,
    waitingTime:
      config.get<number>("simplifyTabs.closeTabs.waitingTime") ?? waitingTime,
    isShiftByPinnedTab:
      config.get<boolean>("simplifyTabs.closeTabs.shiftByPinnedTab") ??
      isShiftByPinnedTab,
    isDirtyTabRemovalAllowed:
      config.get<boolean>("simplifyTabs.closeTabs.isDirtyTabRemovalAllowed") ??
      isDirtyTabRemovalAllowed,
    isActiveTabRemovalAllowed:
      config.get<boolean>("simplifyTabs.closeTabs.isActiveTabRemovalAllowed") ??
      isActiveTabRemovalAllowed,
    maximumDisplayCount:
      config.get<number>(
        "simplifyTabs.closeTabsHistory.maximumDisplayCountInHistory"
      ) ?? maximumDisplayCount,
    enableAutoMove:
      config.get<boolean>("simplifyTabs.alignTabs.enableAuto") ??
      enableAutoMove,
    delayTime:
      config.get<number>("simplifyTabs.alignTabs.delayTime") ?? delayTime,
    canMovePinnedTab:
      config.get<boolean>("simplifyTabs.alignTabs.canMovePinnedTab") ??
      canMovePinnedTab,
  };
}

const logInfo = (...args: any[]) => {
  console.log(PREF, ...args);
};
const logOutputChannel = (...args: string[]) => {
  outputChanel.appendLine("[info] " + args.join(" "));
};

const debugLog = () => {
  logOutputChannel("tabInfoTimer: " + "-------------------");
  tabInfoTimers.forEach((tabInfoTimer, key) => {
    logOutputChannel("tabInfoTimer: " + key);
  });
  logOutputChannel("tabInfoTimer: " + "-------------------\n");

  const tabs = getTabs();
  logInfo(
    "tabs: ",
    ...tabs.map((tab) => ({
      ...tab,
      input: { ...(typeof tab.input === "object" ? tab.input : {}) },
    }))
  );
};

const PREF = "Simplify-Tabs: ";
