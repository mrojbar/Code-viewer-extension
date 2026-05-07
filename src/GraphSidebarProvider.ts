import * as vscode from "vscode";
import { GraphHost } from "./GraphHost";
import { GraphViewCoordinator } from "./GraphViewCoordinator";

/**
 * Thin sidebar shell that hosts the graph via a shared GraphHost.
 * The coordinator guarantees that only one graph instance is active at a time.
 */
export class GraphSidebarProvider implements vscode.WebviewViewProvider {
  private _host?: GraphHost;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _coordinator: GraphViewCoordinator,
    private readonly _additionalLocalResourceRoots: readonly vscode.Uri[],
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this.disposeLocal();

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri,
        ...this._additionalLocalResourceRoots,
      ],
    };

    this._host = new GraphHost(
      webviewView.webview,
      this._extensionUri,
      this._coordinator,
    );

    webviewView.onDidDispose(() => {
      this.disposeLocal();
    });
  }

  private disposeLocal(): void {
    if (this._host) {
      this._host.dispose(this._coordinator);
      this._host = undefined;
    }
  }
}
