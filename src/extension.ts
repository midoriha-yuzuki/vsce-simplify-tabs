// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { ClosingTabsProvider } from "./closingTabsView";
import { ClosingTabs } from "./closingTabs";
import { leftAlignmentTabs } from "./alignLeftTabs";
import { Config, logOutputChannel } from "./common";

let closingTabs: ClosingTabs;
let alignLeftTabs: leftAlignmentTabs;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  outputChanel = vscode.window.createOutputChannel("Simplify-Tabs");
  logOutputChannel("Activate extension. Starting...");

  function initialize() {
    resettingTimersDisposable?.dispose();
    movingTimersDisposable?.dispose();
    const config = getConfig();

    closingTabsProvider = new ClosingTabsProvider(config);
    vscode.window.registerTreeDataProvider(
      "simplifyTabs.closingTabsView",
      closingTabsProvider
    );

    closingTabs && closingTabs.dispose();
    closingTabs = new ClosingTabs({
      closingTabsProvider,
      ...config,
    });
    alignLeftTabs = new leftAlignmentTabs(config);

    ({ disposable: resettingTimersDisposable } =
      closingTabs.initializeAutoClose());
    ({ disposable: movingTimersDisposable } =
      alignLeftTabs.initializeAutoMove());
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
export let outputChanel: vscode.OutputChannel;

type TabInfo = {
  key: string;
  tab: vscode.Tab;
  tabGroup: vscode.TabGroup;
};
type TabInfoTimer = [TabInfo, NodeJS.Timeout];
let tabInfoTimers: Map<string, TabInfoTimer> = new Map();

let closingTabsProvider: ClosingTabsProvider;

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

function getConfig(): Config {
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

  let workspaceFolder = vscode.workspace.workspaceFolders
    ? vscode.workspace.workspaceFolders[0].uri
    : null;
  if (!workspaceFolder) {
    throw new Error("No workspace folder found.");
  }

  const vsConfig = vscode.workspace.getConfiguration();

  const config = {
    enableAutoClose:
      vsConfig.get<boolean>("simplifyTabs.closeTabs.enabled") ??
      enableAutoClose,
    retainingTabCount:
      vsConfig.get<number>("simplifyTabs.closeTabs.retentionNumber") ??
      retainingTabCount,
    waitingTime:
      vsConfig.get<number>("simplifyTabs.closeTabs.delay") ?? waitingTime,
    isShiftByPinnedTab:
      vsConfig.get<boolean>("simplifyTabs.closeTabs.shiftByPinnedTab") ??
      isShiftByPinnedTab,
    overrideGlobList:
      vsConfig.get<boolean>("simplifyTabs.closeTabs.overrideGlobList") ?? {},
    isDirtyTabRemovalAllowed: isDirtyTabRemovalAllowed,
    // config.get<boolean>("simplifyTabs.closeTabs.isDirtyTabRemovalAllowed") ?? isDirtyTabRemovalAllowed,
    isActiveTabRemovalAllowed: isActiveTabRemovalAllowed,
    // config.get<boolean>("simplifyTabs.closeTabs.isActiveTabRemovalAllowed") ?? isActiveTabRemovalAllowed,
    maximumDisplayCount:
      vsConfig.get<number>("simplifyTabs.closedTabsHistory.maxListItems") ??
      maximumDisplayCount,
    enableAutoMove:
      vsConfig.get<boolean>("simplifyTabs.alignLeftTabs.enabled") ??
      enableAutoMove,
    delayTime:
      vsConfig.get<number>("simplifyTabs.alignLeftTabs.delay") ?? delayTime,
    canMovePinnedTab:
      vsConfig.get<boolean>("simplifyTabs.alignLeftTabs.movePinnedTab") ??
      canMovePinnedTab,
    movingPosition: 1,
  };

  return config;
}
