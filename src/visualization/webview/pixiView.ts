/** Webview runtime: boot Pixi, receive data messages, and render treemap content. */
import { Application, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { LayoutRect } from "../layout/contracts";
import { TreemapRenderManager } from "./treemapRender.js";
/** Flat element payload consumed by the webview renderer. */
export interface PixiElement {
  id: string;
  label: string;
  type: "directory" | "file";
  parentId?: string;
  lineCount?: number;
}

/** Message contract sent by the extension host to refresh graph data. */
export interface GraphUpdateMessage {
  type: "updateGraph";
  elements: PixiElement[];
  editorFontFamily: string;
}

/** Renderable rectangle style+geometry descriptor used in Pixi drawing. */
export interface Box {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: number;
  backgroundAlpha: number;
  strokeColor: number;
  strokeAlpha: number;
  strokeWidth: number;
}

/** Directory rectangle with an optional parent link for hierarchy grouping. */
export interface Directory extends Box {
  parentId?: string;
}

/** Minimal VS Code webview API surface used by this runtime. */
export interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare const acquireVsCodeApi: (() => VsCodeApi) | undefined;

/** Runtime drawable directory object paired with Pixi graphics instance. */
export interface RenderedDirectory {
  graphics: Graphics;
  boxData: Directory;
}

/** Complexity summary used to tune layout settings before treemap compute. */
export interface LayoutComplexity {
  nodeCount: number;
  maxDepth: number;
}

/** Virtual treemap size and spacing knobs passed to layout compute. */
export interface VirtualLayoutSettings {
  width: number;
  height: number;
  paddingInner: number;
  paddingOuter: number;
  round: boolean;
}

/** Result object for bounded layout validation/retry workflow. */
export interface ValidatedLayoutResult {
  layoutRects: LayoutRect[];
  settings: VirtualLayoutSettings;
  attempts: number;
}

declare global {
  interface Window {
    __pixiApp?: Application;
    __pixiViewport?: Viewport;
    __pixiLastElements?: PixiElement[];
  }
}

const vscodeApi =
  typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;

/** Guards extension -> webview message payload shape. */
function isGraphUpdateMessage(value: unknown): value is GraphUpdateMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<GraphUpdateMessage>;
  return (
    message.type === "updateGraph" &&
    Array.isArray(message.elements) &&
    typeof message.editorFontFamily === "string"
  );
}

/** Receives graph updates posted from the extension host. */
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isGraphUpdateMessage(event.data)) {
    return;
  }

  manager.handleGraphUpdate(event.data);
});

const manager = new TreemapRenderManager(vscodeApi);
void manager.bootstrap();
