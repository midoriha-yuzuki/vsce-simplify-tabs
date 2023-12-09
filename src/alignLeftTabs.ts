import * as vscode from "vscode";
import { filterTabs, getTabs, logOutputChannel, type Config } from "./common";

export class leftAlignmentTabs {
  enableAutoMove: boolean;
  movingPosition: number;
  delayTime: number;
  canMovePinnedTab: boolean;

  constructor(config: Config) {
    this.enableAutoMove = config.enableAutoMove;
    this.movingPosition = config.movingPosition;
    this.delayTime = config.delayTime;
    this.canMovePinnedTab = config.canMovePinnedTab;
  }

  initializeAutoMove() {
    let disposable: vscode.Disposable | null = null;
    if (this.enableAutoMove) {
      disposable = vscode.window.onDidChangeActiveTextEditor(
        this.setMovingTimer
      );
    }
    return { disposable };
  }

  private setMovingTimer = (e: vscode.TextEditor | undefined) => {
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
        if (nextActiveTab.isPinned && this.canMovePinnedTab) {
          position =
            pinned >= this.movingPosition ? this.movingPosition : pinned;
          moveActiveEditor(position);
          logOutputChannel(
            `Move tab. position: ${position} label: ${nextActiveTab.label}`
          );
        } else if (!nextActiveTab.isPinned) {
          position = pinned > 0 ? pinned + 1 : this.movingPosition;
          moveActiveEditor(position);
          logOutputChannel(
            `Move tab. position: ${position} label: ${nextActiveTab.label}`
          );
        }
      }
    }, this.delayTime * 1000);

    function moveActiveEditor(position: number) {
      vscode.commands.executeCommand("moveActiveEditor", {
        by: "tab",
        to: "position",
        value: position,
      });
    }
  };
}
