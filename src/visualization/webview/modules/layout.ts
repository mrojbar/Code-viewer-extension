/**
 * Computes ordering and widths, runs ELK, and schedules relayout work.
 */
import { LAYOUT, NODE_STYLE, SELECTORS } from "../constants.js";
import { applyCyStyles } from "./cy.js";

const TOTAL_PADDING = LAYOUT.CYTOSCAPE_PADDING_PX + LAYOUT.ELK_PADDING_PX;

export function assignOrderIndexes(cy: any): void {
  cy.nodes().forEach((node: any, index: number) => {
    node.data("orderIndex", index);
  });
}

export function rebuildSiblingOrderEdges(cy: any): void {
  cy.edges(SELECTORS.ORDER_EDGE).remove();

  const orderEdges: Array<Record<string, unknown>> = [];

  const pushOrderEdgesForSiblings = (siblings: any, groupId: string) => {
    const ordered = siblings
      .toArray()
      .sort(
        (a: any, b: any) =>
          (a.data("orderIndex") || 0) - (b.data("orderIndex") || 0),
      );

    for (let i = 0; i < ordered.length - 1; i += 1) {
      const source = ordered[i];
      const target = ordered[i + 1];
      orderEdges.push({
        data: {
          id: `order-edge-${groupId}-${i}`,
          source: source.id(),
          target: target.id(),
        },
        classes: "layout-order-edge",
      });
    }
  };

  const rootNodes = cy
    .nodes()
    .filter((node: any) => node.parent().length === 0);
  pushOrderEdgesForSiblings(rootNodes, "root");

  cy.nodes().forEach((parentNode: any) => {
    if (!parentNode.isParent()) {
      return;
    }
    pushOrderEdgesForSiblings(
      parentNode.children(),
      `parent-${parentNode.id()}`,
    );
  });

  if (orderEdges.length > 0) {
    cy.add(orderEdges);
  }
}

export function calculateStretchedWidths(cy: any): void {
  applyCyStyles(cy.nodes(), {
    width: null,
    height: null,
  });

  const nodes = cy
    .nodes()
    .toArray()
    .sort((a: any, b: any) => b.ancestors().length - a.ancestors().length);

  nodes.forEach((node: any) => {
    let maxChildWidth = 0;
    node.children().forEach((child: any) => {
      const childWidth = child.data("naturalWidth") || NODE_STYLE.MIN_WIDTH_PX;
      if (childWidth > maxChildWidth) {
        maxChildWidth = childWidth;
      }
    });

    let naturalWidth: number = NODE_STYLE.MIN_WIDTH_PX;
    if (node.isParent()) {
      naturalWidth = Math.max(naturalWidth, maxChildWidth + TOTAL_PADDING);
    }
    node.data("naturalWidth", Math.max(naturalWidth, NODE_STYLE.MIN_WIDTH_PX));
  });

  const rootNodes = cy
    .nodes()
    .filter((node: any) => node.parent().length === 0);

  const applyStretchedWidth = (node: any, parentLayoutWidth?: number) => {
    let finalWidth = node.data("naturalWidth");
    if (parentLayoutWidth !== undefined && parentLayoutWidth > 0) {
      const stretched = parentLayoutWidth - TOTAL_PADDING;
      finalWidth = Math.max(finalWidth, stretched);
    }

    applyCyStyles(node, {
      width: `${finalWidth}px`,
      "min-width": `${finalWidth}px`,
    });

    node.children().forEach((child: any) => {
      applyStretchedWidth(child, finalWidth);
    });
  };

  const containerWidth =
    cy.width() || cy.container().clientWidth || window.innerWidth;

  let maxRootInnerWidth = containerWidth - LAYOUT.CYTOSCAPE_PADDING_PX;

  rootNodes.forEach((root: any) => {
    if (root.data("naturalWidth") > maxRootInnerWidth) {
      maxRootInnerWidth = root.data("naturalWidth");
    }
  });

  const virtualParentWidth = maxRootInnerWidth + TOTAL_PADDING;
  rootNodes.forEach((root: any) => {
    applyStretchedWidth(root, virtualParentWidth);
  });
}

export function createApplyElkLayout(
  cy: any,
  onLayoutStop: () => void,
): () => void {
  return () => {
    rebuildSiblingOrderEdges(cy);
    calculateStretchedWidths(cy);

    const layout = cy.layout({
      name: "elk",
      animate: true,
      animationDuration: LAYOUT.ANIMATION_DURATION_MS,
      nodeLayoutOptions: function (node: any) {
        if (node.isParent()) {
          return {
            "elk.algorithm": "layered",
            "elk.direction": "DOWN",
            "elk.layered.spacing.nodeNodeBetweenLayers": LAYOUT.NODE_SPACING_PX,
            "elk.spacing.nodeNode": LAYOUT.NODE_SPACING_PX,
            "elk.padding": LAYOUT.ELK_NODE_PADDING,
          };
        }
        return {};
      },
      elk: {
        algorithm: "layered",
        "elk.direction": "DOWN",
        nodeDimensionsIncludeLabels: true,
        "elk.padding": LAYOUT.ELK_NODE_PADDING,
        "elk.spacing.nodeNode": LAYOUT.NODE_SPACING_PX,
        "elk.layered.spacing.nodeNodeBetweenLayers": LAYOUT.NODE_SPACING_PX,
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
        "elk.separateConnectedComponents": false,
      },
    });

    layout.on("layoutstop", () => {
      onLayoutStop();
    });
    layout.run();
  };
}

export function createRelayoutAfterHierarchyChange(
  applyElkLayout: () => void,
): () => void {
  return () => {
    window.requestAnimationFrame(() => {
      applyElkLayout();
    });
  };
}
