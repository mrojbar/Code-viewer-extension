/** Webview runtime: boot Pixi, receive data messages, and render treemap content. */
import { Application, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { LayoutRect } from "../layout/contracts";
import { TreemapRenderManager } from "./render/treemap.js";
/** Flat element payload consumed by the webview renderer. */
export interface PixiElement {
  id: string;
  label: string;
  type: "directory" | "file" | "function";
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
  parentId?: string;
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

/** Minimal VS Code webview API surface used by this runtime. */
export interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare const acquireVsCodeApi: (() => VsCodeApi) | undefined;

/** Runtime drawable box object paired with Pixi graphics instance. */
export interface RenderedBox {
  graphics: Graphics;
  boxData: Box;
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

const RESIZE_DEBOUNCE_MS = 250;

const vscodeApi =
  typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;
const manager = new TreemapRenderManager(vscodeApi);
/** Debounce handle for resize-triggered layout rerenders. */
let resizeDebounceTimer: number | undefined;

manager.bootstrap();

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

window.addEventListener("resize", () => {
  manager.scheduleResizeViewportUpdate();
  if (resizeDebounceTimer !== undefined) {
    window.clearTimeout(resizeDebounceTimer);
  }

  resizeDebounceTimer = window.setTimeout(() => {
    resizeDebounceTimer = undefined;
    void manager.renderElements();
  }, RESIZE_DEBOUNCE_MS);
});
