import * as vscode from "vscode";
import { filterTabs, getTabs, logOutputChannel, type Config } from "./common";

export class TabLeftAligner {
  enableLeftAlignment: boolean;
  position: number; // start from 1
  delayTime: number;
  isAlignPinned: boolean;

  constructor(config: Config) {
    this.enableLeftAlignment = config.enableLeftAlignment;
    this.position = config.position;
    this.delayTime = config.delayTime;
    this.isAlignPinned = config.isAlignPinned;
  }

  start() {
    let disposable: vscode.Disposable | null = null;
    if (this.enableLeftAlignment) {
      disposable = vscode.window.onDidChangeActiveTextEditor(
        this.setLeftAlignTimer
      );
    }
    return { disposable };
  }

  private setLeftAlignTimer = (e: vscode.TextEditor | undefined) => {
    if (!e) {
      return;
    }

    const tabs$1 = getTabs({ isOnlyActiveGroup: true });
    const prevActiveTab = filterTabs(tabs$1, "isActive")[0];
    setTimeout(() => {
      const tabs$2 = getTabs({ isOnlyActiveGroup: true });
      const nextActiveTab = filterTabs(tabs$2, "isActive")[0];
      if (prevActiveTab === nextActiveTab) {
        const pinnedLength = filterTabs(tabs$2, "isPinned").length;
        if (nextActiveTab.isPinned && this.isAlignPinned) {
          const position =
            pinnedLength >= this.position ? this.position : pinnedLength;
          moveActiveEditor(position);
          logOutputChannel(
            `Move tab. position: ${position} label: ${nextActiveTab.label}`
          );
        } else if (!nextActiveTab.isPinned) {
          const position = pinnedLength > 0 ? pinnedLength + 1 : this.position;
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
