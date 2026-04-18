/**
 * Reads asset/debug values injected as data attributes on the webview body.
 */
import { DATASET_KEYS } from "../constants.js";
import type { IconUris } from "../types.js";

export function getIconUrisFromBody(): IconUris {
  const plus = document.body?.dataset?.[DATASET_KEYS.NODE_PLUS_URI] ?? "";
  const minus = document.body?.dataset?.[DATASET_KEYS.NODE_MINUS_URI] ?? "";

  return {
    plus,
    minus,
  };
}

export function getDebugFlagValueFromBody(): string | undefined {
  return document.body?.dataset?.[DATASET_KEYS.CYTOSCAPE_DEBUG];
}
