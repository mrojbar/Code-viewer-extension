import * as vscode from "vscode";
import * as fs from "fs";
import { CallGraphVisualizer } from "./visualization/CallGraphVisualizer";
import { CallGraphData } from "./types/call_graph";
import { getEnvBoolean, readEnvVariables } from "./utils/env";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  public visualizer?: CallGraphVisualizer;
  public graphData?: CallGraphData;
  private readonly _extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

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

  public updateWebview() {
    if (!this._view || !this.visualizer || !this.graphData) {
      return;
    }

    const elements = this.visualizer.buildElementsFromData(this.graphData);
    this._view.webview.postMessage({ type: "updateGraph", elements: elements });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const cytoscapeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "node_modules",
        "cytoscape",
        "dist",
        "cytoscape.min.js",
      ),
    );
    const elkjsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "node_modules",
        "elkjs",
        "lib",
        "elk.bundled.js",
      ),
    );
    const cytoscapeElkUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "node_modules",
        "cytoscape-elk",
        "dist",
        "cytoscape-elk.js",
      ),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "runtime",
        "webview",
        "cytoscapeView.js",
      ),
    );
    const nodePlusUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "src",
        "visualization",
        "assets",
        "node-plus.svg",
      ),
    );
    const nodeMinusUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "src",
        "visualization",
        "assets",
        "node-minus.svg",
      ),
    );
    const envPath = vscode.Uri.joinPath(this._extensionUri, ".env").fsPath;
    const envVars = readEnvVariables(envPath);
    const cytoscapeDebug = getEnvBoolean(envVars, "CYTOSCAPE_DEBUG");

    const templatePath = vscode.Uri.joinPath(
      this._extensionUri,
      "src",
      "visualization",
      "graphTemplate.html",
    );
    let htmlContent = fs.readFileSync(templatePath.fsPath, "utf8");

    htmlContent = htmlContent.replace(
      "${cytoscapeUri}",
      cytoscapeUri.toString(),
    );
    htmlContent = htmlContent.replace("${elkjsUri}", elkjsUri.toString());
    htmlContent = htmlContent.replace(
      "${cytoscapeElkUri}",
      cytoscapeElkUri.toString(),
    );
    htmlContent = htmlContent.replace("${scriptUri}", scriptUri.toString());
    htmlContent = htmlContent.replace(
      "__CYTOSCAPE_DEBUG__",
      String(cytoscapeDebug),
    );
    htmlContent = htmlContent.replace(
      "__NODE_PLUS_URI__",
      nodePlusUri.toString(),
    );
    htmlContent = htmlContent.replace(
      "__NODE_MINUS_URI__",
      nodeMinusUri.toString(),
    );

    return htmlContent;
  }
}
