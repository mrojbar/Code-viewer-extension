/** Shared message contract between extension host and visualization webview runtime. */

/** App visualization settings. These should exist in the package.json */
export type ExtensionConfig = {
  editorFontFamily: string;
  normalizeTreemapWeight: boolean;
  sortNodesByDescendingWeight: boolean;
  setFileLinesAsWeight: boolean;
  normalizedTreemapMaxWeight: number;
  treemapPaddingPercent: number;
  dynamicTreemapPadding: boolean;
  capSiblingsWeightRatio: number;
};

export interface UpdateMessage {
  type: "updateGraph" | "updateSettings";
}

/** Payload posted when graph content changes. */
export interface UpdateGraphMessage extends UpdateMessage {
  type: "updateGraph";
  elements: unknown[];
}

/** Payload posted when rendering settings change. */
export interface UpdateSettingsMessage extends UpdateMessage {
  type: "updateSettings";
  settings: ExtensionConfig;
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

/** Payload posted from webview to host after each render pass. */
export interface UpdateDiagnosticsMessage {
  type: "updateDiagnostics";
  diagnostics?: LayoutDiagnostics;
}

/** Payload posted from host to webview to show the warning popup. */
export interface ShowWarningPopupMessage {
  type: "showWarningPopup";
  html: string;
}

/** Payload posted from host to webview to hide the warning button and popup. */
export interface HideWarningPopupMessage {
  type: "hideWarningPopup";
}
