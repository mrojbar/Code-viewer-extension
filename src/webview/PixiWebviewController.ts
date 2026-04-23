import { CallGraphData } from "../interfaces/callGraph";
import { PixiVisualizer } from "../visualization/PixiVisualizer";
import {
  PixiWebviewLifecycle,
  PixiWebviewResourcePaths,
  PixiWebviewResourceUris,
  TextRenderingConfig,
  UpdateGraphMessage,
  WebviewHost,
} from "./contracts";
import { PixiWebviewHtmlBuilder } from "./PixiWebviewHtmlBuilder";

/** Shared lifecycle/controller for Pixi webviews. */
export class PixiWebviewController implements PixiWebviewLifecycle {
  private host?: WebviewHost;
  private graphData?: CallGraphData;
  private textRenderingConfig: TextRenderingConfig = {
    editorFontFamily: "Segoe UI",
  };

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

    this.refresh();
  }

  /** Updates internal graph state and pushes a new payload when host is ready. */
  public setGraphData(graphData: CallGraphData): void {
    this.graphData = graphData;
    this.refresh();
  }

  /** Updates text rendering options and pushes them to the webview runtime. */
  public setTextRenderingConfig(config: TextRenderingConfig): void {
    this.textRenderingConfig = {
      ...this.textRenderingConfig,
      ...config,
    };
    this.refresh();
  }

  /** Rebuilds payload from current state and posts it to the attached host. */
  public refresh(): void {
    if (!this.host || !this.graphData) {
      return;
    }

    const elements = this.visualizer.buildElementsFromData(this.graphData);
    const message: UpdateGraphMessage = {
      type: "updateGraph",
      elements,
      editorFontFamily: this.textRenderingConfig.editorFontFamily,
    };

    void this.host.postMessage(message);
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
