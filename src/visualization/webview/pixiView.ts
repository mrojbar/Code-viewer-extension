/** Webview runtime: boot Pixi, receive data messages, and render treemap content. */
import { Application, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { LayoutRect } from "../interfaces/layout.js";
import { TreemapRenderManager } from "./render/treemap.js";
import {
  UpdateMessage,
  UpdateGraphMessage,
  UpdateSettingsMessage,
} from "../interfaces/messages.js";
import { vscodeApi } from "./vscodeApi.js";
import { initSettingsControls } from "./settingsControls.js";
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

/** Layout validation diagnostics surfaced to the UI. */
export interface LayoutDiagnostics {
  totalNodes: number;
  collapsedCount: number;
  extremeCount: number;
  avgArea: number;
  collapsedSamples: Array<{ path: string; w: number; h: number }>;
  extremeSamples: Array<{ path: string; w: number; h: number }>;
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

const manager = new TreemapRenderManager(vscodeApi);
/** Debounce handle for resize-triggered layout rerenders. */
let resizeDebounceTimer: number | undefined;

manager.bootstrap();

const centerBtn = document.getElementById("btn-center");
const settingsBtn = document.getElementById("btn-settings");
const settingsPopup = document.getElementById("settings-popup");
const warningBtn = document.getElementById(
  "btn-warning",
) as HTMLButtonElement | null;
const warningPopup = document.getElementById("warning-popup");

centerBtn?.addEventListener("click", () => {
  manager.centerView();
});

// click handler for settings button in the toolbar
settingsBtn?.addEventListener("click", () => {
  if (settingsPopup?.classList.contains("visible")) {
    settingsPopup.classList.remove("visible");
    return;
  }
  vscodeApi?.postMessage({ type: "getSettingsHtml" });
});

warningBtn?.addEventListener("click", () => {
  warningPopup?.classList.toggle("visible");
});

// Global click handler to close popups when clicking outside of them
document.addEventListener("click", (e) => {
  if (
    settingsPopup?.classList.contains("visible") &&
    !settingsPopup.contains(e.target as Node) &&
    !settingsBtn?.contains(e.target as Node)
  ) {
    settingsPopup.classList.remove("visible");
  }
  if (
    warningPopup?.classList.contains("visible") &&
    !warningPopup.contains(e.target as Node) &&
    !warningBtn?.contains(e.target as Node)
  ) {
    warningPopup.classList.remove("visible");
  }
});

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Warning diagnostics popup update
function updateWarningPopup(diagnostics: LayoutDiagnostics | undefined): void {
  if (!warningBtn || !warningPopup) {
    return;
  }

  const hasProblems =
    diagnostics &&
    (diagnostics.collapsedCount > 0 || diagnostics.extremeCount > 0);

  if (!hasProblems) {
    warningBtn.style.display = "none";
    warningPopup.classList.remove("visible");
    return;
  }

  warningBtn.style.display = "flex";

  let html =
    "<h3>Graph tree could not be validated with the current settings.</h3>";

  if (diagnostics.collapsedCount > 0) {
    html += `<div><strong>Collapsed nodes: ${diagnostics.collapsedCount}</strong></div><ol>`;
    for (const sample of diagnostics.collapsedSamples) {
      html += `<li>${escapeHtml(sample.path)} (${sample.w.toFixed(1)} x ${sample.h.toFixed(1)})</li>`;
    }
    html += "</ol>";
  }

  if (diagnostics.extremeCount > 0) {
    html += `<div><strong>Extreme aspect ratio nodes: ${diagnostics.extremeCount}</strong></div><ol>`;
    for (const sample of diagnostics.extremeSamples) {
      html += `<li>${escapeHtml(sample.path)} (${sample.w.toFixed(1)} x ${sample.h.toFixed(1)})</li>`;
    }
    html += "</ol>";
  }

  warningPopup.innerHTML = html;
}

manager.onRenderComplete = (diagnostics) => {
  updateWarningPopup(diagnostics);
};

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

  const msg = event.data as any;
  if (msg?.type === "updateSettingsPopupHtml") {
    if (
      settingsPopup &&
      settingsPopup.classList.contains("visible") &&
      typeof msg.html === "string"
    ) {
      settingsPopup.innerHTML = msg.html;
      initSettingsControls(settingsPopup);
    }
    return;
  }
  if (msg?.type === "showSettingsPopup") {
    if (settingsPopup && typeof msg.html === "string") {
      settingsPopup.innerHTML = msg.html;
      settingsPopup.classList.add("visible");
      initSettingsControls(settingsPopup);
    }
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
