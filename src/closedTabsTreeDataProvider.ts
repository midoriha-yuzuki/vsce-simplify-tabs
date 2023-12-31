import * as vscode from "vscode";
import { Config } from "./common";

export class FileItem extends vscode.TreeItem {
  constructor(
    uri: vscode.Uri,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.command = {
      command: "vscode.open",
      title: "",
      arguments: [uri],
    };
    this.resourceUri = uri;
    this.id = uri.path;
  }
}

export class ClosedTabsTreeDataProvider
  implements vscode.TreeDataProvider<FileItem>
{
  private maximumDisplayCount: number;
  private fileItems: FileItem[];
  private _onDidChangeTreeData: vscode.EventEmitter<
    FileItem | undefined | void
  > = new vscode.EventEmitter<FileItem | undefined | void>();
  onDidChangeTreeData: vscode.Event<FileItem | undefined | void> =
    this._onDidChangeTreeData.event;

  constructor(props: Config) {
    this.fileItems = [];
    this.maximumDisplayCount = props.maximumDisplayCount;
  }

  refresh(fileItem?: FileItem): void {
    if (fileItem) {
      this.fileItems = this.fileItems.filter(
        (fItem) => fItem.id !== fileItem.id
      );
      this.fileItems.unshift(fileItem);
    }

    if (
      this.maximumDisplayCount > 0 &&
      this.fileItems.length > this.maximumDisplayCount
    ) {
      this.fileItems = this.fileItems.slice(0, this.maximumDisplayCount);
    }

    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    return element;
  }
  getChildren(_?: FileItem): vscode.ProviderResult<FileItem[]> {
    return this.fileItems;
  }
}
