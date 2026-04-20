import { CallGraphData, DirectoryNode, FileNode } from "../../interfaces/callGraph";
import { LayoutNode } from "./contracts";

function isDirectoryNode(
  node: DirectoryNode | FileNode,
): node is DirectoryNode {
  return node.type === "directory";
}

/**
 * Converts a call-graph tree into a layout tree.
 * //TODO: Change Baseline policy: every directory gets weight = 1.
 */
export function buildLayoutTree(data: CallGraphData): LayoutNode {
  const walk = (
    node: DirectoryNode,
    name: string,
    id: string,
    parentId?: string,
  ): LayoutNode => {
    const children: LayoutNode[] = [];

    for (const [childName, childNode] of Object.entries(node.children)) {
      if (!isDirectoryNode(childNode)) {
        continue;
      }

      const childId = id === "root" ? childName : `${id}/${childName}`;
      children.push(walk(childNode, childName, childId, id));
    }

    return {
      id,
      label: name,
      kind: "directory",
      weight: 1,
      parentId,
      children,
    };
  };

  return walk(data, "root", "root");
}

/**
 * Flattens a layout tree into a stable pre-order list (root first).
 */
export function flattenLayoutTree(root: LayoutNode): LayoutNode[] {
  const result: LayoutNode[] = [];

  const visit = (node: LayoutNode) => {
    result.push(node);
    for (const child of node.children) {
      visit(child);
    }
  };

  visit(root);
  return result;
}
