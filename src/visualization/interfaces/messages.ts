/** Shared message contract between extension host and visualization webview runtime. */

/** App visualization settings. These should exist in the package.json */
export type ExtensionConfig = {
  editorFontFamily: string;
  normalizeTreemapWeight: boolean;
  sortNodesByDescendingWeight: boolean;
  setFileLinesAsWeight: boolean;
  normalizedTreemapMaxWeight: number;
  treemapOuterPaddingPercent: number;
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
