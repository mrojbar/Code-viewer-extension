import * as vscode from "vscode";
import { PixiWebviewController } from "./webview/PixiWebviewController";
import { GraphViewCoordinator } from "./GraphViewCoordinator";
import { ExtensionSettings, SettingsKey } from "./settings";
import { buildSettingsControlsHtml } from "./SettingsHtmlBuilder";
import { buildWarningHtml } from "./WarningHtmlBuilder";
import { LayoutDiagnostics } from "./visualization/interfaces/messages";
import { WebviewHost } from "./webview/contracts";

/**
 * Shared host for a Pixi graph webview, used by both sidebar views
 * and regular editor tabs.  Manages settings-popup wiring and
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
        this.controller.refresh();
        return;
      }

      if (message.type === "getSettingsHtml") {
        const settings = ExtensionSettings.getInstance();
        const html = buildSettingsControlsHtml(settings, { tooltip: true });
        webview.postMessage({ type: "showSettingsPopup", html });
        return;
      }

      if (message.command === "resetSettings") {
        void ExtensionSettings.getInstance()
          .resetAll()
          .then(() => {
            const settings = ExtensionSettings.getInstance();
            settings.forceRefresh();
            const html = buildSettingsControlsHtml(settings, { tooltip: true });
            webview.postMessage({ type: "showSettingsPopup", html });
          });
        return;
      }

      if (message.command === "updateSetting") {
        const settings = ExtensionSettings.getInstance();
        void settings.update(message.key as SettingsKey, message.value);
        return;
      }

      if (message.type === "updateDiagnostics") {
        const diagnostics = message.diagnostics as
          | LayoutDiagnostics
          | undefined;
        const html = buildWarningHtml(diagnostics);
        if (html) {
          webview.postMessage({ type: "showWarningPopup", html });
        } else {
          webview.postMessage({ type: "hideWarningPopup" });
        }
        return;
      }
    });

    this._settingsChangeDisposable =
      ExtensionSettings.getInstance().onDidChange(() => {
        if (this._disposed) {
          return;
        }
        const settings = ExtensionSettings.getInstance();
        const html = buildSettingsControlsHtml(settings, { tooltip: true });
        webview.postMessage({ type: "updateSettingsPopupHtml", html });
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
