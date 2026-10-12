import * as vscode from "vscode";
import { ExtensionSettings, SettingsKey } from "./settings";
import { buildSettingsViewData } from "./SettingsViewDataBuilder";

/**
 * Wires a settings webview to extension settings: routes
 * updateSetting/resetSettings commands and pushes settings view data
 * on webviewReady and on every settings change.
 */
export class SettingsWebviewBridge {
  private readonly settings = ExtensionSettings.getInstance();

  /** Attaches the settings protocol to a webview. Dispose to detach. */
  public attach(webview: vscode.Webview): vscode.Disposable {
    const messageDisposable = webview.onDidReceiveMessage((message: any) => {
      if (message.command === "resetSettings") {
        void this.settings.resetAll().then(() => {
          this.settings.forceRefresh();
          this.push(webview);
        });
        return;
      }

      if (message.command === "updateSetting") {
        void this.settings.update(message.key as SettingsKey, message.value);
        return;
      }

      if (message.type === "webviewReady") {
        this.push(webview);
      }
    });

    const changeDisposable = this.settings.onDidChange(() => {
      this.push(webview);
    });

    return new vscode.Disposable(() => {
      messageDisposable.dispose();
      changeDisposable.dispose();
    });
  }

  private push(webview: vscode.Webview): void {
    webview.postMessage({
      type: "settingsViewData",
      settings: buildSettingsViewData(this.settings),
    });
  }
}
