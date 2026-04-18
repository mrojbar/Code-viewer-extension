/**
 * Keeps box labels visually anchored after zoom and layout updates.
 */
import { NODE_STYLE, SELECTORS } from "../constants.js";
import { applyCyStyles } from "./cy.js";

export function stabilizeBoxLabels(cy: any): void {
  cy.nodes(SELECTORS.BOX_NODE).forEach((node: any) => {
    const width = Math.max(
      node.outerWidth() || NODE_STYLE.MIN_WIDTH_PX,
      NODE_STYLE.MIN_WIDTH_PX,
    );
    const height = Math.max(
      node.outerHeight() || NODE_STYLE.MIN_HEIGHT_PX,
      NODE_STYLE.MIN_HEIGHT_PX,
    );
    const hasIcon = node.hasClass("collapsed") || node.isParent();

    applyCyStyles(node, {
      "text-margin-y": -height + NODE_STYLE.LABEL_OFFSET_Y_PX,
      "text-margin-x":
        -width +
        (hasIcon
          ? NODE_STYLE.LABEL_OFFSET_X_WITH_ICON_PX
          : NODE_STYLE.LABEL_OFFSET_X_PX),
    });
  });
}
