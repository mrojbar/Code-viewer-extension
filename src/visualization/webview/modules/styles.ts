/**
 * Builds the Cytoscape stylesheet for nodes, edges, labels, and icons.
 */
import { COLORS, LAYOUT, NODE_STYLE, SELECTORS } from "../constants.js";
import type { IconUris } from "../types.js";

function hasNodeIcon(node: any): boolean {
  return node.hasClass("collapsed") || node.isParent();
}

export function createGraphStyles(
  iconUris: IconUris,
): Record<string, unknown>[] {
  return [
    {
      selector: SELECTORS.NODE,
      style: {
        "background-color": COLORS.NODE_BACKGROUND,
        label: "data(id)",
      },
    },
    {
      selector: SELECTORS.BOX_NODE,
      style: {
        shape: "round-rectangle",
        "min-width": `${NODE_STYLE.MIN_HEIGHT_PX}px`,
        "min-height": `${NODE_STYLE.MIN_HEIGHT_PX}px`,
        "background-color": COLORS.BOX_BACKGROUND,
        "border-width": `${NODE_STYLE.BORDER_WIDTH_PX}px`,
        "border-style": "solid",
        "border-color": COLORS.BOX_BORDER,
        "font-size": `${NODE_STYLE.FONT_SIZE_PX}px`,
        "font-weight": NODE_STYLE.FONT_WEIGHT,
        label: "data(label)",
        "text-valign": "bottom",
        "text-halign": "right",
        "text-margin-y": (node: any) =>
          -Math.max(
            node.outerHeight() || NODE_STYLE.MIN_HEIGHT_PX,
            NODE_STYLE.MIN_HEIGHT_PX,
          ) + NODE_STYLE.LABEL_OFFSET_Y_PX,
        "text-margin-x": (node: any) => {
          const hasIcon = hasNodeIcon(node);
          return (
            -Math.max(
              node.outerWidth() || NODE_STYLE.MIN_WIDTH_PX,
              NODE_STYLE.MIN_WIDTH_PX,
            ) +
            (hasIcon
              ? NODE_STYLE.LABEL_OFFSET_X_WITH_ICON_PX
              : NODE_STYLE.LABEL_OFFSET_X_PX)
          );
        },
        "text-wrap": "ellipsis",
        "text-max-width": (node: any) => {
          const hasIcon = hasNodeIcon(node);
          return node.outerWidth && typeof node.outerWidth === "function"
            ? `${
                Math.max(
                  node.outerWidth() || NODE_STYLE.MIN_WIDTH_PX,
                  NODE_STYLE.MIN_WIDTH_PX,
                ) -
                (hasIcon
                  ? NODE_STYLE.LABEL_MAX_WIDTH_WITH_ICON_OFFSET_PX
                  : NODE_STYLE.LABEL_MAX_WIDTH_OFFSET_PX)
              }px`
            : "76px";
        },
        padding: `${NODE_STYLE.PADDING_PX}px`,
        "padding-top": `${NODE_STYLE.TOP_PADDING_PX}px`,
        "padding-bottom": `${NODE_STYLE.BOTTOM_PADDING_PX}px`,
        "background-image": (node: any) => {
          if (node.hasClass("collapsed")) {
            return iconUris.plus;
          }
          if (node.isParent()) {
            return iconUris.minus;
          }
          return null;
        },
        "background-position-x": `${NODE_STYLE.ICON_OFFSET_PX}px`,
        "background-position-y": `${NODE_STYLE.ICON_OFFSET_PX}px`,
        "background-width": `${NODE_STYLE.ICON_SIZE_PX}px`,
        "background-height": `${NODE_STYLE.ICON_SIZE_PX}px`,
        "background-fit": "none",
        "background-clip": "none",
      },
    },
    {
      selector: SELECTORS.BOX_NODE_CHILDLESS,
      style: {
        width: `${NODE_STYLE.MIN_HEIGHT_PX}px`,
        "max-width": `${NODE_STYLE.MIN_HEIGHT_PX}px`,
        height: `${NODE_STYLE.MIN_HEIGHT_PX}px`,
        "max-height": `${NODE_STYLE.MIN_HEIGHT_PX}px`,
      },
    },
    {
      selector: SELECTORS.BOX_NODE_COLLAPSED,
      style: {
        width: `${NODE_STYLE.MIN_HEIGHT_PX}px`,
        "max-width": `${NODE_STYLE.MIN_HEIGHT_PX}px`,
        height: `${NODE_STYLE.MIN_HEIGHT_PX}px`,
        "max-height": `${NODE_STYLE.MIN_HEIGHT_PX}px`,
      },
    },
    {
      selector: SELECTORS.BOX_NODE_ACTIVE,
      style: {
        "border-color": COLORS.ACTIVE_BORDER,
        "background-color": COLORS.ACTIVE_BACKGROUND,
        "border-style": "solid",
        "border-opacity": 1,
        "overlay-opacity": 0,
      },
    },
    {
      selector: SELECTORS.EDGE,
      style: {
        width: 2,
        "line-color": COLORS.EDGE,
        "target-arrow-color": COLORS.EDGE,
        "target-arrow-shape": "triangle",
        "curve-style": "taxi",
        "taxi-direction": "downward",
        "taxi-turn": LAYOUT.NODE_SPACING_PX,
        "taxi-turn-min-distance": 5,
      },
    },
    {
      selector: SELECTORS.ORDER_EDGE,
      style: {
        width: 0,
        "line-opacity": 0,
        "target-arrow-shape": "none",
        "source-arrow-shape": "none",
      },
    },
  ];
}
