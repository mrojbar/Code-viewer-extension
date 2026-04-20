import { hierarchy, treemap } from "d3-hierarchy";
import {
  LayoutAlgorithm,
  LayoutNode,
  LayoutRect,
  TreemapLayoutConfig,
} from "./contracts";

/**
 * D3 treemap implementation returning geometry only.
 */
export class TreemapLayout implements LayoutAlgorithm<TreemapLayoutConfig> {
  public readonly id = "d3-treemap";

  public compute(root: LayoutNode, config: TreemapLayoutConfig): LayoutRect[] {
    const width = Math.max(1, Math.floor(config.width));
    const height = Math.max(1, Math.floor(config.height));
    const paddingInner = config.paddingInner ?? 10;
    const paddingOuter = config.paddingOuter ?? 10;

    const rootHierarchy = hierarchy<LayoutNode>(
      root,
      (node) => node.children,
    ).sum((node) => Math.max(0.1, node.weight));

    if (config.sortDescending ?? true) {
      rootHierarchy.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    }

    const treemapLayout = treemap<LayoutNode>()
      .size([width, height])
      .paddingOuter(paddingOuter)
      .paddingInner(paddingInner)
      .round(config.round ?? true);

    const laidOutRoot = treemapLayout(rootHierarchy);
    const includeRoot = config.includeRoot ?? false;

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
