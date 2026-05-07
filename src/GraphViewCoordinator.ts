import * as vscode from "vscode";
import { CallGraphData } from "./visualization/interfaces/callGraph";
import { PixiVisualizer } from "./visualization/PixiVisualizer";
import { PixiWebviewController } from "./webview/PixiWebviewController";
import { ExtensionConfig } from "./visualization/interfaces/messages";
import { ExtensionSettings } from "./settings";
import { GraphPanel } from "./GraphPanel";
import { GraphSidebarProvider } from "./GraphSidebarProvider";

/** Central coordinator that ensures one graph view exists at a time,
 *  either in a sidebar webview view or in a regular editor tab. */
export class GraphViewCoordinator {
  private graphData?: CallGraphData;
  private extensionConfig: ExtensionConfig = {} as ExtensionConfig;
  private activeController?: PixiWebviewController;
  private activePanel?: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly visualizer: PixiVisualizer;
  private readonly additionalLocalResourceRoots: readonly vscode.Uri[];
  private _locationDisposable?: vscode.Disposable;
  private _graphViewLaunched = false;

  constructor(
    extensionUri: vscode.Uri,
    visualizer: PixiVisualizer,
    additionalLocalResourceRoots: readonly vscode.Uri[],
  ) {
    this.extensionUri = extensionUri;
    this.visualizer = visualizer;
    this.additionalLocalResourceRoots = additionalLocalResourceRoots;
  }

  public initialize(context: vscode.ExtensionContext): void {
    void vscode.commands.executeCommand(
      "setContext",
      "testextension.graphViewLaunched",
      false,
    );
    this.updateLocationContext();

    const graphSidebarProvider = new GraphSidebarProvider(
      this.extensionUri,
      this,
      this.additionalLocalResourceRoots,
    );
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "testextension-graph-view",
        graphSidebarProvider,
      ),
    );

    this._locationDisposable = ExtensionSettings.getInstance().onDidChange(
      (changedKeys) => {
        if (changedKeys.has("graphViewLocation")) {
          const wasOpen = this._graphViewLaunched;
          this.updateLocationContext();
          this.disposeActive();
          if (wasOpen) {
            this.launch();
          }
        }
      },
    );

    context.subscriptions.push({
      dispose: () => {
        this._locationDisposable?.dispose();
        this.disposeActive();
      },
    });
  }

  /** Factory for PixiWebviewController instances used by sidebar or tab hosts. */
  public createController(): PixiWebviewController {
    const templatePath = vscode.Uri.joinPath(
      this.extensionUri,
      "src",
      "visualization",
      "graphTemplate.html",
    ).fsPath;

    return PixiWebviewController.create({
      visualizer: this.visualizer,
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
        toolkitPath: [
          "node_modules",
          "@vscode",
          "webview-ui-toolkit",
          "dist",
          "toolkit.min.js",
        ],
        codiconPath: [
          "node_modules",
          "@vscode",
          "codicons",
          "dist",
          "codicon.css",
        ],
      },
    });
  }

  public setGraphData(data: CallGraphData): void {
    this.graphData = data;
    this.activeController?.setGraphData(data);
    this.activeController?.refresh();
  }

  public setRenderingConfig(config: ExtensionConfig): void {
    this.extensionConfig = { ...this.extensionConfig, ...config };
    this.activeController?.setRenderingConfig(this.extensionConfig);
    this.activeController?.refresh();
  }

  public refresh(): void {
    this.activeController?.refresh();
  }

  /** Opens the graph in the configured location (sidebar or tab). */
  public launch(): void {
    const location = ExtensionSettings.getInstance().get("graphViewLocation");
    this.disposeActive();

    if (location === "sidebar") {
      this._graphViewLaunched = true;
      void vscode.commands.executeCommand(
        "setContext",
        "testextension.graphViewLaunched",
        true,
      );
      void vscode.commands.executeCommand("testextension-graph-view.focus");
    } else {
      const panel = new GraphPanel(
        this.extensionUri,
        this.additionalLocalResourceRoots,
        this,
      );
      this.activePanel = panel.panel;
      this.activeController = panel.controller;
      panel.panel.onDidDispose(() => {
        if (this.activePanel === panel.panel) {
          this.activePanel = undefined;
          this.activeController = undefined;
          this._graphViewLaunched = false;
          void vscode.commands.executeCommand(
            "setContext",
            "testextension.graphViewLaunched",
            false,
          );
        }
      });
      this._graphViewLaunched = true;
      void vscode.commands.executeCommand(
        "setContext",
        "testextension.graphViewLaunched",
        true,
      );
    }
  }

  /** Called by a sidebar or tab host when it creates a controller. */
  public registerController(controller: PixiWebviewController): void {
    if (this.activeController && this.activeController !== controller) {
      this.activeController.dispose();
    }
    this.activeController = controller;
    this.pushStateToController(controller);
  }

  /** Called by a host when its controller is being disposed.
   *  Does NOT reset the launched state so the view can be recreated. */
  public unregisterController(controller: PixiWebviewController): void {
    if (this.activeController === controller) {
      this.activeController = undefined;
    }
    controller.dispose();
  }

  /** Disposes whichever view is currently active and resets state. */
  public disposeActive(): void {
    this._graphViewLaunched = false;
    this.activePanel?.dispose();
    this.activeController?.dispose();
    this.activePanel = undefined;
    this.activeController = undefined;
    void vscode.commands.executeCommand(
      "setContext",
      "testextension.graphViewLaunched",
      false,
    );
  }

  private pushStateToController(controller: PixiWebviewController): void {
    if (this.graphData) {
      controller.setGraphData(this.graphData);
    }
    if (this.extensionConfig) {
      controller.setRenderingConfig(this.extensionConfig);
    }
    controller.refresh();
  }

  private updateLocationContext(): void {
    const location = ExtensionSettings.getInstance().get("graphViewLocation");
    void vscode.commands.executeCommand(
      "setContext",
      "testextension.showGraphInSidebar",
      location === "sidebar",
    );
  }
}
