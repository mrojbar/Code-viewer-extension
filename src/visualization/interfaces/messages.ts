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

/** One settings entry rendered by the webview settings popup. */
export interface SettingsViewDatum {
  key: string;
  label: string;
  description: string | null;
  valueType: "boolean" | "number" | "string";
  defaultValue: boolean | number | string;
  value: boolean | number | string;
  minimum: number | null;
  maximum: number | null;
  enumValues: string[] | null;
  configurationPath: string;
}

/** Payload posted from host to webview to render the settings popup rows. */
export interface SettingsViewDataMessage {
  type: "settingsViewData";
  settings: SettingsViewDatum[];
}

/** Payload posted from webview to host to write one setting. */
export interface UpdateSettingMessage {
  command: "updateSetting";
  key: string;
  value: boolean | number | string;
}

/** Payload posted from webview to host to restore all defaults. */
export interface ResetSettingsMessage {
  command: "resetSettings";
}
