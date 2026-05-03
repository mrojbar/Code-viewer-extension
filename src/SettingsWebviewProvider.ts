import * as vscode from "vscode";
import { ExtensionSettings, SettingsKey } from "./settings";
import { buildSettingsHtml } from "./SettingsHtmlBuilder";

export class SettingsWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private settings: ExtensionSettings;
  private disposable?: vscode.Disposable;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.settings = ExtensionSettings.getInstance();

    this.disposable = this.settings.onDidChange(() => {
      // Re-trigger a full re-render on settings changes
      if (this._view) {
        this.updateWebview();
      }
    });
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      if (data.command === "updateSetting") {
        await ExtensionSettings.getInstance().update(
          data.key as SettingsKey,
          data.value,
        );
      }

      if (data.command === "resetSettings") {
        await ExtensionSettings.getInstance().resetAll();
      }
    });

    this.updateWebview();
  }

  private updateWebview() {
    if (!this._view) {
      return;
    }

    this._view.webview.html = buildSettingsHtml(
      this._view.webview,
      this._extensionUri,
      this.settings,
    );
  }

  dispose() {
    this.disposable?.dispose();
  }
}
