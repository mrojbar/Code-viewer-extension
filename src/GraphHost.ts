import * as vscode from "vscode";
import { PixiWebviewController } from "./webview/PixiWebviewController";
import { GraphViewCoordinator } from "./GraphViewCoordinator";
import { SettingsWebviewBridge } from "./SettingsWebviewBridge";
import { WebviewHost } from "./webview/contracts";

/**
 * Shared host for a Pixi graph webview, used by both sidebar views
 * and regular editor tabs.  Manages settings wiring and
 * controller lifecycle.
 */
export class GraphHost {
  public readonly controller: PixiWebviewController;
  private readonly _settingsBridge = new SettingsWebviewBridge();
  private readonly _bridgeDisposable: vscode.Disposable;
  private _disposed = false;

  constructor(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    coordinator: GraphViewCoordinator,
  ) {
    this.controller = coordinator.createController();

    this._bridgeDisposable = this._settingsBridge.attach(webview);

    webview.onDidReceiveMessage((message: any) => {
      if (this._disposed) {
        return;
      }
      if (message.type === "webviewReady") {
        this.controller.refresh();
      }
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
    this._bridgeDisposable.dispose();
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
