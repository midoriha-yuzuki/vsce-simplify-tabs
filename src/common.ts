import * as vscode from "vscode";
import { FileItem } from "./closedTabsTreeDataProvider";
import { outputChanel } from "./extension";
import { minimatch } from "minimatch";

export type TabInfo = {
  key: string;
  tab: vscode.Tab;
  tabGroup: vscode.TabGroup;
  retain?: number;
  waitingTime?: number;
};

export type OverridingTab = {
  glob: string;
  tabRetentionCount: number;
  waitingTime: number;
};

export type Config = {
  enableClosing: boolean;
  tabRetentionCount: number;
  waitingTime: number;
  isShiftByPinned: boolean;
  isDirtyTabRemovalAllowed: boolean;
  isActiveTabRemovalAllowed: boolean;
  overridingTabList: OverridingTab[];
  maximumDisplayCount: number;
  enableLeftAlignment: boolean;
  /* not vscode configure option */
  position: number;
  delayTime: number;
  isAlignPinned: boolean;
};

export function getTabs({ isOnlyActiveGroup = false as boolean } = {}) {
  const groups = vscode.window.tabGroups;
  const tabs = (
    isOnlyActiveGroup ? [groups.activeTabGroup] : groups.all
  ).reduce((acc, group) => {
    const tabs = group.tabs;
    return acc.concat(tabs);
  }, [] as vscode.Tab[]);
  return tabs;
}

// key must be boolean type key of Tab
export function filterTabs(tabs: vscode.Tab[], key: keyof vscode.Tab) {
  return tabs.filter((tab) => tab[key]);
}

export function transformTabInfoIntoFileItem(tabItem: TabInfo) {
  try {
    // @ts-ignore
    const uri = tabItem.tab.input.uri as vscode.Uri;
    return new FileItem(uri, tabItem.tab.label, 0);
  } catch {
    return undefined;
  }
}

export function compareTabAndTabInfo(tab: vscode.Tab, tabInfo: TabInfo) {
  const tabKey = createTabInfoTimerKey(tab);
  return tabKey === tabInfo.key;
}

export function transformTabIntoTabInfo(
  tab: vscode.Tab,
  overrideGlops?: OverridingTab[]
): TabInfo {
  if (overrideGlops) {
    const match = overrideGlops.find((overrideGlob) => {
      try {
        // prettier-ignore
        // @ts-ignore
        return minimatch(tab.input.uri.fsPath as string, overrideGlob.glob);
      } catch {
        return false;
      }
    });
    if (match) {
      return {
        key: createTabInfoTimerKey(tab),
        tab,
        tabGroup: tab.group,
        retain: match.tabRetentionCount,
        waitingTime: match.waitingTime,
      };
    }
  }

  return {
    key: createTabInfoTimerKey(tab),
    tab,
    tabGroup: tab.group,
  };
}

function createTabInfoTimerKey(tab: vscode.Tab) {
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
}

const PREF = "Simplify-Tabs: ";
export function logInfo(...args: any[]) {
  console.log(PREF, ...args);
}
export function logOutputChannel(...args: string[]) {
  outputChanel.appendLine("[info] " + args.join(" "));
}

export const logOutputChannels = (args: string[]) => {
  args.forEach((arg) => {
    logOutputChannel(arg);
  });
};

export function throwError(message: string = "") {
  throw new Error(message);
}
