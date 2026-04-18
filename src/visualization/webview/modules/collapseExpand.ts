/**
 * Handles expand/collapse taps and triggers relayout after hierarchy changes.
 */
import { BUTTON, SELECTORS } from "../constants.js";

interface CollapseExpandOptions {
  cy: any;
  relayoutAfterHierarchyChange: () => void;
}

export function setupCollapseExpand(options: CollapseExpandOptions): void {
  const { cy, relayoutAfterHierarchyChange } = options;

  cy.on("tap", SELECTORS.BOX_NODE, (e: any) => {
    const node = e.target;
    const isCollapsed = node.hasClass("collapsed");

    if (!node.isParent() && !isCollapsed) {
      return;
    }

    const pos = e.position;
    const bb = node.boundingBox();
    const buttonX = bb.x1 + BUTTON.OFFSET_X_PX;
    const buttonY = bb.y1 + BUTTON.OFFSET_Y_PX;

    if (
      pos.x >= buttonX &&
      pos.x <= buttonX + BUTTON.HITBOX_SIZE_PX &&
      pos.y >= buttonY &&
      pos.y <= buttonY + BUTTON.HITBOX_SIZE_PX
    ) {
      if (isCollapsed) {
        const children = node.data("collapsedChildren");
        if (children && children.length > 0) {
          children.restore();
          node.removeClass("collapsed");
          relayoutAfterHierarchyChange();
        }
      } else {
        const descendants = node.descendants();
        const edges = descendants.connectedEdges();
        const elementsToRemove = descendants.union(edges);

        node.data("collapsedChildren", elementsToRemove);
        cy.remove(elementsToRemove);
        node.addClass("collapsed");

        relayoutAfterHierarchyChange();
      }
    }
  });
}
