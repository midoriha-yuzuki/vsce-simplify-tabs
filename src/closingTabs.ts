import * as vscode from "vscode";
import { ClosingTabsProvider } from "./closingTabsView";
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
  OverrideGlob,
} from "./common";
import { log } from "console";

type TabInfoTimer = [TabInfo, NodeJS.Timeout];

export class ClosingTabs {
  private closingTabsProvider: ClosingTabsProvider;

  private enableAutoClose: boolean;
  private retainingTabCount: number = 10;
  private waitingTime: number = 10;
  private isDirtyTabRemovalAllowed: boolean = false;
  private isActiveTabRemovalAllowed: boolean = false;
  private isShiftByPinnedTab: boolean = true;

  private tabInfoTimers: Map<string, TabInfoTimer> = new Map();
  private intervalId?: NodeJS.Timeout;

  private overrideGlobList: {
    glob: string;
    retain: number;
    waitingTime: number;
  }[] = [];

  constructor(
    props: Config & {
      closingTabsProvider: ClosingTabsProvider;
    }
  ) {
    function transformOverrideGlobList(obj: { [glob: string]: string }) {
      const overrideGlobList = obj;
      const overrideGlobListArray = Object.entries(overrideGlobList).reduce<
        OverrideGlob[]
      >((acc, [glob, retainAndWaitingTime]) => {
        try {
          const [retain, waitingTime] = retainAndWaitingTime.split(",");
          const item = {
            glob,
            retain: parseInt(retain),
            waitingTime: parseInt(waitingTime),
          };
          acc.push(item);
        } catch (error) {
          // Exclude errors
          logOutputChannel(`Parse error: [${glob}, ${retainAndWaitingTime}]`);
        }
        return acc;
      }, []);
      return overrideGlobListArray;
    }

    this.closingTabsProvider = props.closingTabsProvider;
    this.enableAutoClose = props.enableAutoClose;
    this.retainingTabCount = props.retainingTabCount;
    this.waitingTime = props.waitingTime;
    this.isShiftByPinnedTab = props.isShiftByPinnedTab;
    this.isDirtyTabRemovalAllowed = props.isActiveTabRemovalAllowed;
    this.isActiveTabRemovalAllowed = props.isActiveTabRemovalAllowed;
    this.overrideGlobList = transformOverrideGlobList(props.overrideGlobList);

    // this.intervalId = setInterval(() => {
    //   this.debugLog();
    // }, 10000);
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
    const tabInfoArray = tabs.map((tab) =>
      transformTabIntoTabInfo(tab, this.overrideGlobList)
    );
    tabInfoArray.map(this.resetTimer);
  };

  private setResettingTimers = (e: vscode.TabChangeEvent) => {
    e.changed.forEach((tab) =>
      this.resetTimer(transformTabIntoTabInfo(tab, this.overrideGlobList))
    );
    e.opened.forEach((tab) =>
      this.resetTimer(transformTabIntoTabInfo(tab, this.overrideGlobList))
    );
    e.closed.forEach((tab) => {
      const tabInfoTimer = this.findTabInfoTimer(
        transformTabIntoTabInfo(tab, this.overrideGlobList)
      );
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
    }, (tabInfo.waitingTime ?? this.waitingTime) * 1000);
    this.tabInfoTimers.set(tabInfo.key, [tabInfo, timer]);
  };

  private findTabInfoTimer = (tabInfo: TabInfo) => {
    const tabInfoTimer = this.tabInfoTimers.get(tabInfo.key);
    return tabInfoTimer;
  };

  private removeTabIfApplicable = (tabInfo: TabInfo) => {
    const [tab, index, tabs] = this.findTab(tabInfo);
    const shiftRetains = this.isShiftByPinnedTab
      ? filterTabs(tabs, "isPinned").length
      : 0;

    if (
      tab &&
      this.shouldRemoveTab(tab) &&
      !this.isIndexWithinRetainingRange(index, shiftRetains, tabInfo.retain)
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

  private isIndexWithinRetainingRange = (
    index: number, // zero based
    shift: number,
    overrideRetain?: number
  ) => {
    const retain = (overrideRetain ?? this.retainingTabCount) + shift;
    logOutputChannel(`isIndexWithinRetainingRange: ${index}  ${retain}`);
    return index < (retain > 0 ? retain : 1);
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
