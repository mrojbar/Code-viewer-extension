/**
 * Converts flat PixiElements into a hierarchical LayoutNode tree for the treemap layout algorithm.
 * Handles parent-child linking, bottom-up weight aggregation, and optional weight normalization.
 */
import { LayoutNode } from "../../interfaces/layout.js";
import type { PixiElement } from "../pixiView.js";

const DEFAULT_MAX_NORMALIZED_WEIGHT = 1;

/** Node type constants used across the treemap rendering pipeline. */
export const BOX_TYPES = {
  DIR: "directory",
  FILE: "file",
  FUNC: "function",
} as const;

/** Flattens PixiElements into a LayoutNode hierarchy with weights and parent links. */
export function buildLayoutTree(
  elements: PixiElement[],
  setFileLinesAsWeight: boolean,
  normalizeTreemapWeight: boolean,
  normalizedTreemapMaxWeight: number | undefined,
): LayoutNode | undefined {
  const validElements = elements.filter((element) =>
    [BOX_TYPES.DIR, BOX_TYPES.FILE, BOX_TYPES.FUNC].includes(element.type),
  );

  if (validElements.length === 0) {
    return undefined;
  }

  const nodesById = new Map<string, LayoutNode>();
  let maxWeight = 1;

  for (const element of validElements) {
    const rawWeight = Math.max(0, element.lineCount ?? 0);

    const node: LayoutNode = {
      id: element.id,
      label: element.label,
      kind: element.type,
      weight: setFileLinesAsWeight ? Math.max(1, rawWeight) : 0,
      parentId: element.parentId,
      children: [],
    };

    if (rawWeight > maxWeight) {
      maxWeight = rawWeight;
    }
    nodesById.set(element.id, node);
  }

  const roots: LayoutNode[] = [];

  for (const node of nodesById.values()) {
    if (!node) {
      continue;
    }
    const parent = nodesById.get(node.parentId || "");
    if (!parent) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  const rootNode: LayoutNode =
    roots.length === 1
      ? roots[0]
      : {
          id: "__layout_root__",
          label: "root",
          kind: BOX_TYPES.DIR,
          weight: 0,
          children: roots,
        };

  function aggregateWeights(node: LayoutNode): number {
    if (!node.children || node.children.length === 0) {
      return node.weight;
    }
    let sum = 0;
    for (const c of node.children) {
      sum += aggregateWeights(c);
    }
    node.weight = Math.max(node.weight, sum);
    return node.weight;
  }

  aggregateWeights(rootNode);

  if (normalizeTreemapWeight) {
    const configuredMax =
      normalizedTreemapMaxWeight ?? DEFAULT_MAX_NORMALIZED_WEIGHT;

    let globalMax = 1;
    for (const n of nodesById.values()) {
      if (n.weight > globalMax) {
        globalMax = n.weight;
      }
    }
    globalMax = Math.max(globalMax, rootNode.weight || 1);

    for (const n of nodesById.values()) {
      n.weight = (n.weight / Math.max(1, globalMax)) * configuredMax;
    }
    rootNode.weight =
      (rootNode.weight / Math.max(1, globalMax)) * configuredMax;
  }

  return rootNode;
}
