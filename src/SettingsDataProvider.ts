import * as vscode from "vscode";
import { ExtensionSettings, SettingsKey } from "./settings";
import {
  GENERATED_SETTINGS_SCHEMA,
  GeneratedSetting,
} from "./generated/settingsSchema";

export class SettingsDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  > = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    vscode.TreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private settings: ExtensionSettings;
  private disposable?: vscode.Disposable;

  constructor() {
    this.settings = ExtensionSettings.getInstance();

    // Refresh tree whenever a setting changes
    this.disposable = this.settings.onDidChange(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: vscode.TreeItem,
  ): vscode.ProviderResult<vscode.TreeItem[]> {
    if (element) {
      // We only have a flat list of settings for now
      return [];
    }

    const items: vscode.TreeItem[] = [];

    // Iterate over settings schema
    for (const [key, schema] of Object.entries(GENERATED_SETTINGS_SCHEMA)) {
      const settingSchema = schema as GeneratedSetting;
      const currentVal = this.settings.get(key as SettingsKey);

      const label = this.formatCamelCase(key);

      if (settingSchema.valueType === "boolean") {
        const item = new vscode.TreeItem(
          label,
          vscode.TreeItemCollapsibleState.None,
        );
        item.checkboxState = currentVal
          ? vscode.TreeItemCheckboxState.Checked
          : vscode.TreeItemCheckboxState.Unchecked;

        // Let the spacebar or mouse-click on the row toggle it
        item.command = {
          command: "testextension.toggleSetting",
          title: "Toggle",
          arguments: [key],
        };
        items.push(item);
      } else if (settingSchema.valueType === "number") {
        const item = new vscode.TreeItem(
          label,
          vscode.TreeItemCollapsibleState.None,
        );
        item.description = `${currentVal}`;
        item.contextValue = "numberSetting";
        item.tooltip = `Value: ${currentVal}`;
        items.push(item);
      } else if (settingSchema.valueType === "string") {
        const item = new vscode.TreeItem(
          label,
          vscode.TreeItemCollapsibleState.None,
        );
        item.description = `${currentVal}`;
        item.contextValue = "stringSetting"; // fallback
        items.push(item);
      }
    }

    return items;
  }

  public formatCamelCase(text: string): string {
    const result = text.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  dispose() {
    this.disposable?.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
