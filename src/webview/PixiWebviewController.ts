import { CallGraphData } from "../visualization/interfaces/callGraph";
import { PixiVisualizer } from "../visualization/PixiVisualizer";
import {
  PixiWebviewLifecycle,
  PixiWebviewResourcePaths,
  PixiWebviewResourceUris,
  WebviewHost,
} from "./contracts";
import {
  ExtensionConfig,
  UpdateGraphMessage,
  UpdateSettingsMessage,
} from "../visualization/interfaces/messages.js";
import { PixiWebviewHtmlBuilder } from "./PixiWebviewHtmlBuilder";

/** Shared lifecycle/controller for Pixi webviews. */
export class PixiWebviewController implements PixiWebviewLifecycle {
  private host?: WebviewHost;
  private graphData?: CallGraphData;
  private extensionConfig: ExtensionConfig = {} as ExtensionConfig;

  private constructor(
    private readonly visualizer: PixiVisualizer,
    private readonly templatePath: string,
    private readonly resourcePaths: PixiWebviewResourcePaths,
    private readonly htmlBuilder: PixiWebviewHtmlBuilder,
  ) {}

  /** Factory with immutable dependencies configured once at creation time. */
  public static create(params: {
    visualizer: PixiVisualizer;
    templatePath: string;
    resourcePaths: PixiWebviewResourcePaths;
    htmlBuilder?: PixiWebviewHtmlBuilder;
  }): PixiWebviewController {
    return new PixiWebviewController(
      params.visualizer,
      params.templatePath,
      params.resourcePaths,
      params.htmlBuilder ?? new PixiWebviewHtmlBuilder(),
    );
  }

  /** Attaches a host and initializes its HTML shell immediately. */
  public attachHost(host: WebviewHost): void {
    this.host = host;

    const resources = this.resolveResources(host);
    const html = this.htmlBuilder.buildFromTemplate(
      this.templatePath,
      resources,
    );
    host.setHtml(html);
  }

  /** Updates rendering options */
  public setRenderingConfig(config: ExtensionConfig): void {
    this.extensionConfig = {
      ...this.extensionConfig,
      ...config,
    };
  }

  /** Updates internal graph state */
  public setGraphData(graphData: CallGraphData): void {
    this.graphData = graphData;
  }

  /** Rebuilds payload from current state and posts it to the attached host. */
  public refresh(): void {
    if (this.extensionConfig) {
      const message: UpdateSettingsMessage = {
        type: "updateSettings",
        settings: this.extensionConfig,
      };
      void this.host?.postMessage(message);
    }
    if (this.graphData) {
      const elements = this.visualizer.buildElementsFromGraph(this.graphData);
      const message: UpdateGraphMessage = {
        type: "updateGraph",
        elements,
      };
      void this.host?.postMessage(message);
    }
  }

  /** Releases host reference while preserving immutable dependencies. */
  public dispose(): void {
    this.host = undefined;
  }

  private resolveResources(host: WebviewHost): PixiWebviewResourceUris {
    return {
      pixiImportUrl: host.resolveResourceUri(this.resourcePaths.pixiModulePath),
      pixiViewportImportUrl: host.resolveResourceUri(
        this.resourcePaths.pixiViewportModulePath,
      ),
      d3HierarchyImportUrl: host.resolveResourceUri(
        this.resourcePaths.d3HierarchyModulePath,
      ),
      scriptUri: host.resolveResourceUri(this.resourcePaths.runtimeScriptPath),
    };
  }
}
