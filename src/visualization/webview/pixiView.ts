/** Webview runtime: boot Pixi, receive data messages, and render treemap content. */
import { Application, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { LayoutRect } from "../interfaces/layout.js";
import { TreemapRenderManager } from "./render/treemap.js";
import {
  UpdateMessage,
  UpdateGraphMessage,
  UpdateSettingsMessage,
  LayoutDiagnostics,
} from "../interfaces/messages.js";
import { vscodeApi } from "./vscodeApi.js";
import { isSettingsViewDataMessage } from "./utils.js";
import { initDevLogsBridge } from "./devlogs.js";
import { initSettingsPopup, updateSettingsData } from "./settingsPopup.js";
import { initWarningPopup, renderWarning } from "./warningPopup.js";
/** Flat element payload consumed by the webview renderer. */
export interface PixiElement {
  id: string;
  label: string;
  type: "directory" | "file" | "function";
  parentId?: string;
  lineCount?: number;
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

/** Configuration for rendering different box types. */
export type BoxRenderProps = Record<
  string,
  {
    backgroundColor: number;
    backgroundAlpha: number;
    strokeColor: number;
    strokeAlpha: number;
    strokeWidth: number;
  }
>;

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
  maxDepth: number;
  round: boolean;
}

/** Result object for bounded layout validation/retry workflow. */
export interface ValidatedLayoutResult {
  layoutRects: LayoutRect[];
  settings: VirtualLayoutSettings;
  attempts: number;
  diagnostics?: LayoutDiagnostics;
}

declare global {
  interface Window {
    __pixiApp?: Application;
    __pixiViewport?: Viewport;
    __pixiLastElements?: PixiElement[];
  }
}

const RESIZE_DEBOUNCE_MS = 250;

initDevLogsBridge("graph-webview");

const manager = new TreemapRenderManager(vscodeApi, renderWarning);
/** Debounce handle for resize-triggered layout rerenders. */
let resizeDebounceTimer: number | undefined;

manager.bootstrap();

initSettingsPopup();
initWarningPopup();

const centerBtn = document.getElementById("btn-center");

centerBtn?.addEventListener("click", () => {
  manager.centerView();
});

/** Guards extension -> webview message payload shape. */
function isUpdateMessageType(
  value: unknown,
  type: UpdateMessage["type"],
): value is UpdateMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<UpdateMessage>;
  return message.type === type;
}

/** Receives graph updates posted from the extension host. */
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (isUpdateMessageType(event.data, "updateSettings")) {
    manager.handleSettingsUpdate(event.data as UpdateSettingsMessage);
    return;
  }
  if (isUpdateMessageType(event.data, "updateGraph")) {
    manager.handleGraphUpdate(event.data as UpdateGraphMessage);
    return;
  }
  if (isSettingsViewDataMessage(event.data)) {
    updateSettingsData(event.data.settings);
    return;
  }
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
