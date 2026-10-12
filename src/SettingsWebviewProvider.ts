import * as vscode from "vscode";
import { SettingsWebviewBridge } from "./SettingsWebviewBridge";
import { buildSettingsHtml } from "./SettingsHtmlBuilder";

export class SettingsWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private readonly _bridge = new SettingsWebviewBridge();
  private _bridgeDisposable?: vscode.Disposable;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    this._bridgeDisposable?.dispose();
    this._bridgeDisposable = this._bridge.attach(webviewView.webview);
    webviewView.onDidDispose(() => {
      this._bridgeDisposable?.dispose();
      this._bridgeDisposable = undefined;
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
    );
  }

  dispose() {
    this._bridgeDisposable?.dispose();
  }
}
