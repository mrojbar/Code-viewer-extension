import * as vscode from "vscode";
import { GraphViewCoordinator } from "./GraphViewCoordinator";

/** Hosts the Main sidebar webview with a single "Launch Graph View" button. */
export class MainViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _coordinator: GraphViewCoordinator,
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    const nonce = this.getNonce();
    webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    button {
      padding: 12px 24px;
      font-size: 14px;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <button id="launchBtn">Launch Graph View</button>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('launchBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'launchGraph' });
    });
  </script>
</body>
</html>`;

    webviewView.webview.onDidReceiveMessage((message: any) => {
      if (message.command === "launchGraph") {
        this._coordinator.launch();
      }
    });
  }

  private getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
