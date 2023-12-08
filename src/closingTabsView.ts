import * as vscode from "vscode";

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

export class ClosingTabsProvider implements vscode.TreeDataProvider<FileItem> {
  fileItems: FileItem[];
  private _onDidChangeTreeData: vscode.EventEmitter<
    FileItem | undefined | void
  > = new vscode.EventEmitter<FileItem | undefined | void>();
  onDidChangeTreeData: vscode.Event<FileItem | undefined | void> =
    this._onDidChangeTreeData.event;

  maximumDisplayCount: number;

  constructor(maximumDisplayCount: number) {
    this.fileItems = [];
    this.maximumDisplayCount = maximumDisplayCount;
  }

  refresh(fileItem?: FileItem): void {
    if (fileItem) {
      this.fileItems = this.fileItems.filter((item) => item.id !== fileItem.id);
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

const logInfo = (...args: any[]) => {
  console.log(PREF, ...args);
};
const PREF = "Simplify-Tabs: ";
