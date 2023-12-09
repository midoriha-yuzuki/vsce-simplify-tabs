import * as vscode from "vscode";
import { ClosingTabsProvider, FileItem } from "./closingTabsView";
import {
  TabInfo,
  compareTabAndTabInfo,
  filterTabs,
  getTabs,
  logInfo,
  transformTabInfoIntoFileItem,
  transformTabIntoTabInfo,
  logOutputChannel,
  type Config,
  logOutputChannels,
} from "./common";

type TabInfoTimer = [TabInfo, NodeJS.Timeout];

export class ClosingTabs {
  closingTabsProvider: ClosingTabsProvider;

  enableAutoClose: boolean;
  retainingTabCount: number = 10;
  waitingTime: number = 10;
  isDirtyTabRemovalAllowed: boolean = false;
  isActiveTabRemovalAllowed: boolean = false;
  isShiftByPinnedTab: boolean = true;

  tabInfoTimers: Map<string, TabInfoTimer> = new Map();
  intervalId?: NodeJS.Timeout;

  constructor(
    props: Config & {
      closingTabsProvider: ClosingTabsProvider;
    }
  ) {
    this.closingTabsProvider = props.closingTabsProvider;
    this.enableAutoClose = props.enableAutoClose;
    this.retainingTabCount = props.retainingTabCount;
    this.waitingTime = props.waitingTime;
    this.isShiftByPinnedTab = props.isShiftByPinnedTab;
    this.isDirtyTabRemovalAllowed = props.isActiveTabRemovalAllowed;
    this.isActiveTabRemovalAllowed = props.isActiveTabRemovalAllowed;

    this.intervalId = setInterval(() => {
      this.debugLog();
    }, 10000);
  }

  initializeAutoClose() {
    let disposable: vscode.Disposable | null = null;
    if (this.enableAutoClose) {
      disposable = vscode.window.tabGroups.onDidChangeTabs(
        this.setResettingTimers
      );
      this.initializeRemovingTabs();
    }
    return { disposable };
  }

  dispose() {
    this.tabInfoTimers.forEach(([_, timer]) => clearTimeout(timer));
    this.tabInfoTimers.clear();
    clearInterval(this.intervalId);
  }

  private initializeRemovingTabs = () => {
    const tabs = getTabs();
    const tabInfoArray = tabs.map(transformTabIntoTabInfo);
    tabInfoArray.map(this.resetTimer);
  };

  private setResettingTimers = (e: vscode.TabChangeEvent) => {
    e.changed.forEach((tab) => this.resetTimer(transformTabIntoTabInfo(tab)));
    e.opened.forEach((tab) => this.resetTimer(transformTabIntoTabInfo(tab)));
    e.closed.forEach((tab) => {
      const tabInfoTimer = this.findTabInfoTimer(transformTabIntoTabInfo(tab));
      if (tabInfoTimer) {
        clearTimeout(tabInfoTimer[1]);
        this.tabInfoTimers.delete(tabInfoTimer[0].key);
      }
    });
  };

  private resetTimer = (tabInfo: TabInfo) => {
    const tabInfoTimer = this.findTabInfoTimer(tabInfo);
    if (tabInfoTimer) {
      clearTimeout(tabInfoTimer[1]);
    }
    const timer = setInterval(() => {
      if (this.removeTabIfApplicable(tabInfo)) {
        clearInterval(timer);
        this.tabInfoTimers.delete(tabInfo.key);
      }
    }, this.waitingTime * 1000);
    this.tabInfoTimers.set(tabInfo.key, [tabInfo, timer]);
  };

  private findTabInfoTimer = (tabInfo: TabInfo) => {
    const tabInfoTimer = this.tabInfoTimers.get(tabInfo.key);
    return tabInfoTimer;
  };

  private removeTabIfApplicable = (tabInfo: TabInfo) => {
    const [tab, index, tabs] = this.findTab(tabInfo);
    const shiftRemains = this.isShiftByPinnedTab
      ? filterTabs(tabs, "isPinned").length
      : 0;

    if (
      tab &&
      this.shouldRemoveTab(tab) &&
      !this.isTabIndexLessThanRetainingTabCount(index, shiftRemains)
    ) {
      this.closeTab(tab);
      this.closingTabsProvider.refresh(transformTabInfoIntoFileItem(tabInfo));
      logOutputChannel(`Close: ${tabInfo.key}`);
      return true;
    } else if (!tab) {
      return true;
    }
    return false;
  };

  private closeTab = (tab: vscode.Tab) => {
    vscode.window.tabGroups.close(tab);
  };

  private isTabIndexLessThanRetainingTabCount = (
    index: number,
    shift: number
  ) => {
    return index < this.retainingTabCount + 0;
  };

  private shouldRemoveTab = (tab: vscode.Tab) => {
    if (tab.isDirty && !this.isDirtyTabRemovalAllowed) {
      return false;
    } else if (tab.isActive && !this.isActiveTabRemovalAllowed) {
      return false;
    }

    return true;
  };

  private findTab = (tabInfo: TabInfo) => {
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

  private debugLog = (isLength: boolean = true) => {
    if (isLength) {
      logOutputChannel("tabInfoTimers: " + "-------------------");
      logOutputChannel("tabInfoTimers: " + this.tabInfoTimers.size);

      logInfo("tabInfoTimers: ", this.tabInfoTimers.size);
    } else {
      const displayTab = (tab: vscode.Tab) => ({
        ...tab,
        input: { ...(typeof tab.input === "object" ? tab.input : {}) },
      });

      logOutputChannel("tabInfoTimers: " + "-------------------");
      const keys = Array.from(this.tabInfoTimers.keys());
      logOutputChannels(keys.map((key) => "tabInfoTimers: " + key));

      const entries = Array.from(this.tabInfoTimers.entries());
      logInfo(
        "tabInfoTimers: ",
        ...entries.map(([_, tabInfoTimer]) => displayTab(tabInfoTimer[0].tab))
      );
    }
  };
}
