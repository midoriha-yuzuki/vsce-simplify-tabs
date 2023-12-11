import * as vscode from "vscode";
import { ClosedTabsTreeDataProvider } from "./closedTabsTreeDataProvider";
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
  OverridingTab,
} from "./common";

type TabInfoTimer = [TabInfo, NodeJS.Timeout];

export class TabCloser {
  private tabCloserProvider: ClosedTabsTreeDataProvider;

  private enableClosing: boolean;
  private tabRetentionCount: number = 10;
  private waitingTime: number = 10;
  private isDirtyTabRemovalAllowed: boolean = false;
  private isActiveTabRemovalAllowed: boolean = false;
  private isShiftByPinned: boolean = true;

  private tabInfoTimers: Map<string, TabInfoTimer> = new Map();
  private overridingList: OverridingTab[] = [];
  private intervalId?: NodeJS.Timeout;
  private isDebug: boolean = false;

  constructor(
    props: Config & {
      closingTabsProvider: ClosedTabsTreeDataProvider;
    }
  ) {
    this.tabCloserProvider = props.closingTabsProvider;
    this.enableClosing = props.enableClosing;
    this.tabRetentionCount = props.tabRetentionCount;
    this.waitingTime = props.waitingTime;
    this.isShiftByPinned = props.isShiftByPinned;
    this.isDirtyTabRemovalAllowed = props.isActiveTabRemovalAllowed;
    this.isActiveTabRemovalAllowed = props.isActiveTabRemovalAllowed;
    this.overridingList = props.overridingTabList;

    if (this.isDebug) {
      this.intervalId = setInterval(() => {
        this.debugLog({ isLength: true });
      }, 10000);
    }
  }

  dispose() {
    this.tabInfoTimers.forEach(([_, timer]) => clearTimeout(timer));
    this.tabInfoTimers.clear();
    clearInterval(this.intervalId);
  }

  start() {
    let disposable: vscode.Disposable | null = null;
    if (this.enableClosing) {
      disposable = vscode.window.tabGroups.onDidChangeTabs(
        this.refreshTabResettingTimers
      );
      this.initializeTabResettingTimers();
    }
    return { disposable };
  }

  private initializeTabResettingTimers = () => {
    const tabs = getTabs();
    const tabInfoArray = tabs.map((tab) =>
      transformTabIntoTabInfo(tab, this.overridingList)
    );
    tabInfoArray.map(this.refreshTabResettingTimer);
  };

  private refreshTabResettingTimers = (e: vscode.TabChangeEvent) => {
    e.changed.forEach((tab) =>
      this.refreshTabResettingTimer(
        transformTabIntoTabInfo(tab, this.overridingList)
      )
    );
    e.opened.forEach((tab) =>
      this.refreshTabResettingTimer(
        transformTabIntoTabInfo(tab, this.overridingList)
      )
    );
    e.closed.forEach((tab) => {
      const tabInfoTimer = this.findTabInfoTimer(
        transformTabIntoTabInfo(tab, this.overridingList)
      );
      if (tabInfoTimer) {
        clearTimeout(tabInfoTimer[1]);
        this.tabInfoTimers.delete(tabInfoTimer[0].key);
      }
    });
  };

  private refreshTabResettingTimer = (tabInfo: TabInfo) => {
    const tabInfoTimer = this.findTabInfoTimer(tabInfo);
    if (tabInfoTimer) {
      clearTimeout(tabInfoTimer[1]);
    }
    const timer = setInterval(() => {
      if (this.closeTabIfApplicable(tabInfo)) {
        clearInterval(timer);
        this.tabInfoTimers.delete(tabInfo.key);
      }
    }, (tabInfo.waitingTime ?? this.waitingTime) * 1000);
    this.tabInfoTimers.set(tabInfo.key, [tabInfo, timer]);
  };

  private closeTabIfApplicable = (tabInfo: TabInfo) => {
    const self = this;
    const [tab, index, tabs] = this.findTab(tabInfo);
    const shiftRetains = this.isShiftByPinned
      ? filterTabs(tabs, "isPinned").length
      : 0;

    if (
      tab &&
      shouldRemoveTab(tab) &&
      !isIndexWithinRetainingRange(index, shiftRetains, tabInfo.retain)
    ) {
      closeTab(tab);
      this.tabCloserProvider.refresh(transformTabInfoIntoFileItem(tabInfo));
      logOutputChannel(`Close: ${tabInfo.key}`);
      return true;
    } else if (!tab) {
      return true;
    }
    return false;

    function closeTab(tab: vscode.Tab) {
      vscode.window.tabGroups.close(tab);
    }

    function shouldRemoveTab(tab: vscode.Tab) {
      if (tab.isDirty && !self.isDirtyTabRemovalAllowed) {
        return false;
      } else if (tab.isActive && !self.isActiveTabRemovalAllowed) {
        return false;
      }
      return true;
    }

    function isIndexWithinRetainingRange(
      index: number, // zero based
      shift: number,
      overrideRetain?: number
    ) {
      const retain = (overrideRetain ?? self.tabRetentionCount) + shift;
      return index < (retain > 0 ? retain : 1);
    }
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

  private findTabInfoTimer = (tabInfo: TabInfo) => {
    const tabInfoTimer = this.tabInfoTimers.get(tabInfo.key);
    return tabInfoTimer;
  };

  private debugLog = (props: { isLength?: boolean }) => {
    const { isLength = false } = props ?? {};

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
