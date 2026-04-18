/**
 * Shared constants for selectors, style values, layout tuning, and debug keys.
 */
export const MESSAGE_TYPES = {
  UPDATE_GRAPH: "updateGraph",
} as const;

export const SELECTORS = {
  BOX_NODE: ".box-node",
  BOX_NODE_CHILDLESS: ".box-node:childless",
  BOX_NODE_COLLAPSED: ".box-node.collapsed",
  BOX_NODE_ACTIVE: ".box-node:active",
  NODE: "node",
  EDGE: "edge",
  ORDER_EDGE: ".layout-order-edge",
  CY_CONTAINER: "cy",
  ZOOM_INDICATOR: "cy-zoom-indicator",
  TOOLTIP: "cy-tooltip",
} as const;

export const NODE_STYLE = {
  FONT_SIZE_PX: 12,
  FONT_WEIGHT: "bold",
  MIN_WIDTH_PX: 100,
  MIN_HEIGHT_PX: 100,
  BORDER_WIDTH_PX: 4,
  PADDING_PX: 20,
  TOP_PADDING_PX: 40,
  BOTTOM_PADDING_PX: 20,
  ICON_SIZE_PX: 16,
  ICON_OFFSET_PX: 12,
  LABEL_OFFSET_Y_PX: 12,
  LABEL_OFFSET_X_PX: 12,
  LABEL_OFFSET_X_WITH_ICON_PX: 36,
  LABEL_MAX_WIDTH_OFFSET_PX: 24,
  LABEL_MAX_WIDTH_WITH_ICON_OFFSET_PX: 48,
} as const;

export const LAYOUT = {
  ANIMATION_DURATION_MS: 300,
  NODE_SPACING_PX: 20,
  CYTOSCAPE_PADDING_PX: 48,
  ELK_PADDING_PX: 40,
  ELK_NODE_PADDING: "[top=40,bottom=20,left=20,right=20]",
} as const;

export const BUTTON = {
  HITBOX_SIZE_PX: 16,
  OFFSET_X_PX: 12,
  OFFSET_Y_PX: 12,
} as const;

export const ZOOM = {
  BASE_FONT_SIZE_PX: 12,
  MIN_FONT_SIZE_PX: 8,
  LABEL_HIDE_THRESHOLD: 0.3,
  INDICATOR_OFFSET_TOP_PX: 8,
  INDICATOR_OFFSET_LEFT_PX: 8,
} as const;

export const TOOLTIP = {
  SHOW_DELAY_MS: 500,
  OFFSET_X_PX: 10,
  OFFSET_Y_PX: 10,
} as const;

export const COLORS = {
  NODE_BACKGROUND: "#666",
  BOX_BACKGROUND: "white",
  BOX_BORDER: "rgba(162, 162, 162, 0.5)",
  ACTIVE_BORDER: "rgb(25, 151, 197)",
  ACTIVE_BACKGROUND: "rgb(183, 222, 236)",
  EDGE: "#ccc",
} as const;

export const UI = {
  ZOOM_INDICATOR_Z_INDEX: "1001",
  TOOLTIP_Z_INDEX: "1000",
  FONT_SIZE_SMALL: "12px",
  BORDER_RADIUS: "4px",
  PADDING_SMALL: "4px 8px",
  POINTER_CURSOR: "pointer",
  DEFAULT_CURSOR: "default",
} as const;

export const DATASET_KEYS = {
  CYTOSCAPE_DEBUG: "cytoscapeDebug",
  NODE_PLUS_URI: "nodePlusUri",
  NODE_MINUS_URI: "nodeMinusUri",
} as const;

export const DEBUG_MESSAGES = {
  NOT_READY:
    "[cytoscape-debug] Cytoscape instance is not ready yet. Use: await window.cyReadyPromise",
  READY: "[cytoscape-debug] window.__cy is available",
  READY_WITHOUT_FLAG:
    "[cytoscape-debug] window.__cy exposed; CYTOSCAPE_DEBUG is not true",
  MISSING_CONTAINER: "[cytoscape-debug] #cy container not found",
} as const;
