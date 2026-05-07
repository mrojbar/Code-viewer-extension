import * as vscode from "vscode";
import { GraphHost } from "./GraphHost";
import { GraphViewCoordinator } from "./GraphViewCoordinator";

/** Thin wrapper around a regular VS Code editor tab (WebviewPanel) for the Pixi graph. */
export class GraphPanel {
  public readonly panel: vscode.WebviewPanel;
  private readonly _host: GraphHost;

  public get controller(): import("./webview/PixiWebviewController").PixiWebviewController {
    return this._host.controller;
  }

  constructor(
    extensionUri: vscode.Uri,
    additionalLocalResourceRoots: readonly vscode.Uri[],
    coordinator: GraphViewCoordinator,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "testextension.graphView",
      "Test Extension View",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri, ...additionalLocalResourceRoots],
      },
    );

    this._host = new GraphHost(this.panel.webview, extensionUri, coordinator);

    this.panel.onDidDispose(() => {
      this._host.dispose(coordinator);
    });
  }
}
