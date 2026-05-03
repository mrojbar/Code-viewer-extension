import {
  hierarchy,
  treemap,
  treemapResquarify,
  HierarchyRectangularNode,
} from "d3-hierarchy";
import {
  LayoutAlgorithm,
  LayoutNode,
  LayoutRect,
  TreemapLayoutConfig,
} from "../interfaces/layout";

const MIN_PADDIN_PERC = 0.02;

/**
 * D3 treemap implementation returning geometry only.
 */

export class TreemapLayout implements LayoutAlgorithm<TreemapLayoutConfig> {
  public readonly id = "d3-treemap";

  public compute(root: LayoutNode, config: TreemapLayoutConfig): LayoutRect[] {
    const width = Math.max(1, Math.floor(config.width));
    const height = Math.max(1, Math.floor(config.height));

    config.topPaddingPerc = config.topPaddingPerc ?? MIN_PADDIN_PERC;
    const maxDepth = config.maxDepth ?? 0;

    const overrides = config.paddingOuterOverrides;
    const pInner = (node: HierarchyRectangularNode<LayoutNode>) =>
      dynamicPadding(node, config.topPaddingPerc, MIN_PADDIN_PERC, maxDepth);
    const pOuter = (node: HierarchyRectangularNode<LayoutNode>) => {
      const base = dynamicPadding(
        node,
        config.topPaddingPerc,
        MIN_PADDIN_PERC,
        maxDepth,
      );
      const factor = overrides?.get(node.data.id);
      if (factor === undefined) {
        return base;
      }
      const nodeW = node.x1 - node.x0;
      const nodeH = node.y1 - node.y0;
      const avgSide = Math.sqrt(nodeW * nodeH);
      const minPadding = avgSide * MIN_PADDIN_PERC;
      return Math.max(minPadding, base * factor);
    };
    const startTime = performance.now();

    const rootHierarchy = hierarchy<LayoutNode>(
      root,
      (node) => node.children,
    ).sum((node) => Math.max(0.1, node.weight));

    if (config.sortDescending ?? true) {
      rootHierarchy.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    }

    let treemapLayout = treemap<LayoutNode>()
      .tile(treemapResquarify)
      .size([width, height])
      .round(config.round ?? true);

    treemapLayout = treemapLayout
      .paddingOuter((node) => pOuter(node))
      .paddingInner((node) => pInner(node));

    const laidOutRoot = treemapLayout(rootHierarchy);
    const includeRoot = config.includeRoot ?? false;
    const endTime = performance.now();

    const paddingsByDepth: Record<number, number> = {};
    for (let d = 0; d <= maxDepth; d++) {
      paddingsByDepth[d] = dynamicPadding(
        {
          x0: 0,
          y0: 0,
          x1: width,
          y1: height,
          depth: d,
        } as HierarchyRectangularNode<LayoutNode>,
        config.topPaddingPerc,
        MIN_PADDIN_PERC,
        maxDepth,
      );
    }

    console.log(
      `Computing treemap layout with ${root.children.length} top-level nodes and config:`,
      {
        width,
        height,
        paddingsByDepth,
      },
      `In ${(endTime - startTime).toFixed(2)} ms`,
    );

    return laidOutRoot
      .descendants()
      .filter((node) => (includeRoot ? true : node.depth > 0))
      .map((node) => ({
        id: node.data.id,
        label: node.data.label,
        kind: node.data.kind,
        parentId: node.data.parentId,
        depth: node.depth,
        weight: node.data.weight,
        x: Math.max(0, node.x0),
        y: Math.max(0, node.y0),
        width: Math.max(0, node.x1 - node.x0),
        height: Math.max(0, node.y1 - node.y0),
      }));
  }
}

/**
 * Dynamically computes padding based on node depth, with exponential decay from Padmax at the root to Padmin at maxDepth.
 */
function dynamicPadding(
  node: HierarchyRectangularNode<LayoutNode>,
  padmaxPerc: number | undefined,
  padminPerc: number | undefined,
  maxDepth: number,
): number {
  const nodeW = node.x1 - node.x0;
  const nodeH = node.y1 - node.y0;
  const avgSide = Math.sqrt(nodeW * nodeH);

  // TODO: test
  const padmax = padmaxPerc !== undefined ? avgSide * padmaxPerc : 0;
  const padmin = padminPerc !== undefined ? avgSide * padminPerc : 0;

  const depth = Math.min(node.depth ?? 0, maxDepth);
  // Exponential decay: Padmax at depth=0, Padmin at depth=maxDepth
  const expPadding = padmin * Math.pow(padmax / padmin, 1 - depth / maxDepth);
  const padding = Math.min(avgSide / 2, expPadding);
  return padding;
}
