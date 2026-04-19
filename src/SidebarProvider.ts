import * as vscode from "vscode";
import * as fs from "fs";
import { CallGraphData } from "./types/call_graph";
import { PixiVisualizer } from "./visualization/PixiVisualizer";

/** Hosts the sidebar webview and pushes graph payloads into the webview runtime. */
export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  public visualizer?: PixiVisualizer;
  public graphData?: CallGraphData;
  private readonly _extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  /** Initializes webview options and injects HTML shell content. */
  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    if (this.visualizer) {
      this.updateWebview();
    }
  }

  /** Converts graph data to Pixi payload and posts it to the webview. */
  public updateWebview() {
    if (!this._view || !this.visualizer || !this.graphData) {
      return;
    }

    const elements = this.visualizer.buildElementsFromData(this.graphData);
    this._view.webview.postMessage({ type: "updateGraph", elements: elements });
  }

  /** Builds template HTML and injects webview-safe module URLs. */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const pixiImportUrl = webview
      .asWebviewUri(
        vscode.Uri.joinPath(
          this._extensionUri,
          "node_modules",
          "pixi.js",
          "dist",
          "pixi.min.mjs",
        ),
      )
      .toString();
    const pixiViewportImportUrl = webview
      .asWebviewUri(
        vscode.Uri.joinPath(
          this._extensionUri,
          "node_modules",
          "pixi-viewport",
          "dist",
          "pixi_viewport.js",
        ),
      )
      .toString();
    const scriptUri = webview
      .asWebviewUri(
        vscode.Uri.joinPath(
          this._extensionUri,
          "runtime",
          "webview",
          "pixiView.js",
        ),
      )
      .toString();

    const templatePath = vscode.Uri.joinPath(
      this._extensionUri,
      "src",
      "visualization",
      "graphTemplate.html",
    );
    let htmlContent = fs.readFileSync(templatePath.fsPath, "utf8");

    htmlContent = htmlContent.replace("${pixiImportUrl}", pixiImportUrl);
    htmlContent = htmlContent.replace(
      "${pixiViewportImportUrl}",
      pixiViewportImportUrl,
    );
    htmlContent = htmlContent.replace("${scriptUri}", scriptUri);

    return htmlContent;
  }
}
