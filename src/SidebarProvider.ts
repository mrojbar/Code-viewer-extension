import * as vscode from "vscode";
import { CallGraphData } from "./visualization/interfaces/callGraph";
import { PixiVisualizer } from "./visualization/PixiVisualizer";
import { PixiWebviewController } from "./webview/PixiWebviewController";
import { WebviewHost } from "./webview/contracts";
import { ExtensionConfig } from "./visualization/interfaces/messages";

/** Hosts the sidebar webview and pushes graph payloads into the webview runtime. */
export class SidebarProvider implements vscode.WebviewViewProvider {
  private readonly _extensionUri: vscode.Uri;
  private readonly _controller: PixiWebviewController;
  private readonly _additionalLocalResourceRoots: readonly vscode.Uri[];

  private constructor(
    extensionUri: vscode.Uri,
    controller: PixiWebviewController,
    additionalLocalResourceRoots: readonly vscode.Uri[],
  ) {
    this._extensionUri = extensionUri;
    this._controller = controller;
    this._additionalLocalResourceRoots = additionalLocalResourceRoots;
  }

  /** Factory for sidebar host wiring. */
  public static create(
    extensionUri: vscode.Uri,
    visualizer: PixiVisualizer,
    additionalLocalResourceRoots: readonly vscode.Uri[] = [],
  ): SidebarProvider {
    const templatePath = vscode.Uri.joinPath(
      extensionUri,
      "src",
      "visualization",
      "graphTemplate.html",
    ).fsPath;

    const controller = PixiWebviewController.create({
      visualizer,
      templatePath,
      resourcePaths: {
        pixiModulePath: ["node_modules", "pixi.js", "dist", "pixi.min.mjs"],
        pixiViewportModulePath: [
          "node_modules",
          "pixi-viewport",
          "dist",
          "pixi_viewport.js",
        ],
        d3HierarchyModulePath: [
          "node_modules",
          "d3-hierarchy",
          "src",
          "index.js",
        ],
        runtimeScriptPath: ["runtime", "webview", "pixiView.js"],
      },
    });

    return new SidebarProvider(
      extensionUri,
      controller,
      additionalLocalResourceRoots,
    );
  }

  /** Initializes webview options and injects HTML shell content. */
  public resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri,
        ...this._additionalLocalResourceRoots,
      ],
    };

    /** Handles messages received from the webview. */
    webviewView.webview.onDidReceiveMessage((message: Event) => {
      if (message.type !== "webviewReady") {
        return;
      }

      this._controller.refresh();
    });

    this._controller.attachHost(this.createHostAdapter(webviewView.webview));
  }

  /** Updates rendering options that are forwarded to the webview runtime. */
  public setRenderingConfig(config: ExtensionConfig): void {
    this._controller.setRenderingConfig(config);
  }

  /** Lifecycle entrypoint for graph updates from activation/runtime flows. */
  public setGraphData(graphData: CallGraphData): void {
    this._controller.setGraphData(graphData);
  }

  /** Lifecycle hook for explicit refresh triggers when needed. */
  public refresh(): void {
    this._controller.refresh();
  }

  /** Lifecycle cleanup for controller-host association. */
  public dispose(): void {
    this._controller.dispose();
  }

  private createHostAdapter(webview: vscode.Webview): WebviewHost {
    return {
      setHtml: (html: string) => {
        webview.html = html;
      },
      postMessage: (message: unknown) => webview.postMessage(message),
      resolveResourceUri: (pathSegments: string[]) =>
        webview
          .asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, ...pathSegments),
          )
          .toString(),
      resolveAbsoluteUri: (filePath: string) =>
        webview.asWebviewUri(vscode.Uri.file(filePath)).toString(),
    };
  }
}
