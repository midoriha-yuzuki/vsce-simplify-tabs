import * as vscode from "vscode";
import { FileItem } from "./closingTabsView";
import { outputChanel } from "./extension";

export type Config = {
  enableAutoClose: boolean;
  retainingTabCount: number;
  waitingTime: number;
  isShiftByPinnedTab: boolean;
  isDirtyTabRemovalAllowed: boolean;
  isActiveTabRemovalAllowed: boolean;

  maximumDisplayCount: number;

  enableAutoMove: boolean;
  movingPosition: number; // not config option
  delayTime: number;
  canMovePinnedTab: boolean;
};

export type TabInfo = {
  key: string;
  tab: vscode.Tab;
  tabGroup: vscode.TabGroup;
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

// key must be boolean key of Tab
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

export function transformTabIntoTabInfo(tab: vscode.Tab): TabInfo {
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

const PREF = "Simplify-Tabs: ";
