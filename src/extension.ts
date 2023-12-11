// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { ClosedTabsTreeDataProvider } from "./closedTabsTreeDataProvider";
import { TabCloser } from "./tabCloser";
import { TabLeftAligner } from "./tabLeftAligner";
import {
  type Config,
  OverridingTab,
  logOutputChannel,
  throwError,
} from "./common";

let closingTabs: TabCloser;
let alignLeftTabs: TabLeftAligner;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  outputChanel = vscode.window.createOutputChannel("Simplify Tabs");
  logOutputChannel("Activate extension. Starting...");

  function initialize() {
    resettingTimersDisposable?.dispose();
    movingTimersDisposable?.dispose();
    const config = getConfig();

    closingTabsProvider = new ClosedTabsTreeDataProvider(config);
    vscode.window.registerTreeDataProvider(
      "simplifyTabs.closingTabsView",
      closingTabsProvider
    );

    closingTabs?.dispose();
    closingTabs = new TabCloser({
      closingTabsProvider,
      ...config,
    });
    alignLeftTabs = new TabLeftAligner(config);

    ({ disposable: resettingTimersDisposable } = closingTabs.start());
    ({ disposable: movingTimersDisposable } = alignLeftTabs.start());
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

let closingTabsProvider: ClosedTabsTreeDataProvider;

function getConfig(): Config {
  const base: Config = {
    enableClosing: true,
    tabRetentionCount: 8,
    waitingTime: 600,
    isShiftByPinned: true,
    maximumDisplayCount: 20,
    enableLeftAlignment: true,
    delayTime: 5,
    isAlignPinned: false,
    overridingTabList: [],
    /* not vscode configure option */
    isDirtyTabRemovalAllowed: false,
    isActiveTabRemovalAllowed: false,
    position: 1,
  };

  const vsConfig = vscode.workspace.getConfiguration();
  const config = {
    enableClosing:
      vsConfig.get<boolean>("simplifyTabs.closeTabs.enabled") ??
      base.enableClosing,
    tabRetentionCount:
      vsConfig.get<number>("simplifyTabs.closeTabs.retentionNumber") ??
      base.tabRetentionCount,
    waitingTime:
      vsConfig.get<number>("simplifyTabs.closeTabs.delay") ?? base.waitingTime,
    isShiftByPinned:
      vsConfig.get<boolean>("simplifyTabs.closeTabs.shiftByPinnedTab") ??
      base.isShiftByPinned,
    maximumDisplayCount:
      vsConfig.get<number>("simplifyTabs.closedTabsHistory.maxListItems") ??
      base.maximumDisplayCount,
    enableLeftAlignment:
      vsConfig.get<boolean>("simplifyTabs.alignLeftTabs.enabled") ??
      base.enableLeftAlignment,
    delayTime:
      vsConfig.get<number>("simplifyTabs.alignLeftTabs.delay") ??
      base.delayTime,
    canMovePinnedTab:
      vsConfig.get<boolean>("simplifyTabs.alignLeftTabs.movePinnedTab") ??
      base.isAlignPinned,
    overridingList:
      transformOverrideGlobList(
        vsConfig.get<{
          [glob: string]: string;
        }>("simplifyTabs.closeTabs.overrideGlobList") ?? {}
      ) ?? [],
  };

  return {
    ...base,
    ...config,
  } satisfies Config;

  function transformOverrideGlobList(obj: { [glob: string]: string }) {
    const overrideGlobList = obj;
    const overrideGlobListArray = Object.entries(overrideGlobList).reduce<
      OverridingTab[]
    >((acc, [glob, retainAndWaitingTime]) => {
      try {
        const [retain, waitingTime] = retainAndWaitingTime.split(",");
        const item = {
          glob,
          tabRetentionCount: parseIntWithThrow(retain),
          waitingTime: parseIntWithThrow(waitingTime),
        } satisfies OverridingTab;
        acc.push(item);
      } catch (error) {
        // Exclude errors
        logOutputChannel(`Parse error: [${glob}, ${retainAndWaitingTime}]`);
      }
      return acc;

      function parseIntWithThrow(numString: string) {
        const num = parseInt(numString);
        isNaN(num) && throwError("Parse error");
        return num;
      }
    }, []);
    return overrideGlobListArray;
  }
}
