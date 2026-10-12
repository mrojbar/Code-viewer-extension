import * as vscode from "vscode";
import { PixiWebviewController } from "./webview/PixiWebviewController";
import { GraphViewCoordinator } from "./GraphViewCoordinator";
import { ExtensionSettings, SettingsKey } from "./settings";
import { buildSettingsViewData } from "./SettingsViewDataBuilder";
import { WebviewHost } from "./webview/contracts";

/**
 * Shared host for a Pixi graph webview, used by both sidebar views
 * and regular editor tabs.  Manages settings data wiring and
 * controller lifecycle.
 */
export class GraphHost {
  public readonly controller: PixiWebviewController;
  private readonly _settingsChangeDisposable?: vscode.Disposable;
  private _disposed = false;

  constructor(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    coordinator: GraphViewCoordinator,
  ) {
    this.controller = coordinator.createController();

    webview.onDidReceiveMessage((message: any) => {
      if (this._disposed) {
        return;
      }
      if (message.type === "webviewReady") {
        this.postSettingsViewData(webview);
        this.controller.refresh();
        return;
      }

      if (message.command === "resetSettings") {
        void ExtensionSettings.getInstance()
          .resetAll()
          .then(() => {
            const settings = ExtensionSettings.getInstance();
            settings.forceRefresh();
            this.postSettingsViewData(webview);
          });
        return;
      }

      if (message.command === "updateSetting") {
        const settings = ExtensionSettings.getInstance();
        void settings.update(message.key as SettingsKey, message.value);
        return;
      }
    });

    this._settingsChangeDisposable =
      ExtensionSettings.getInstance().onDidChange(() => {
        if (this._disposed) {
          return;
        }
        this.postSettingsViewData(webview);
      });

    const host = this.createHostAdapter(webview, extensionUri);
    this.controller.attachHost(host);
    coordinator.registerController(this.controller);
  }

  public dispose(coordinator: GraphViewCoordinator): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._settingsChangeDisposable?.dispose();
    coordinator.unregisterController(this.controller);
  }

  private postSettingsViewData(webview: vscode.Webview): void {
    const settings = ExtensionSettings.getInstance();
    webview.postMessage({
      type: "settingsViewData",
      settings: buildSettingsViewData(settings),
    });
  }

  private createHostAdapter(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
  ): WebviewHost {
    return {
      setHtml: (html: string) => {
        webview.html = html;
      },
      postMessage: (message: unknown) => webview.postMessage(message),
      resolveResourceUri: (pathSegments: string[]) =>
        webview
          .asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathSegments))
          .toString(),
      resolveAbsoluteUri: (filePath: string) =>
        webview.asWebviewUri(vscode.Uri.file(filePath)).toString(),
    };
  }
}
