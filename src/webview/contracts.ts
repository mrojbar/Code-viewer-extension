import { CallGraphData } from "../visualization/interfaces/callGraph";
import { ExtensionConfig } from "../visualization/interfaces/messages";

/** Host contract that any webview container adapter can implement. */
export interface WebviewHost {
  setHtml(html: string): void;
  postMessage(message: unknown): void | PromiseLike<unknown>;
  resolveResourceUri(pathSegments: string[]): string;
  resolveAbsoluteUri(filePath: string): string;
}

/** Immutable module paths required by the Pixi webview runtime. */
export interface PixiWebviewResourcePaths {
  pixiModulePath: string[];
  pixiViewportModulePath: string[];
  d3HierarchyModulePath: string[];
  runtimeScriptPath: string[];
}

/** Runtime-ready resource URIs consumed by graphTemplate.html placeholders. */
export interface PixiWebviewResourceUris {
  pixiImportUrl: string;
  pixiViewportImportUrl: string;
  d3HierarchyImportUrl: string;
  scriptUri: string;
}

/** Lifecycle contract used by host adapters (sidebar, panel, etc.). */
export interface PixiWebviewLifecycle {
  attachHost(host: WebviewHost): void;
  setGraphData(graphData: CallGraphData): void;
  setRenderingConfig(config: ExtensionConfig): void;
  refresh(): void;
  dispose(): void;
}
