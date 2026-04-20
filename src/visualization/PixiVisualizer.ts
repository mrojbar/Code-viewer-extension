import {
  CallGraphData,
  DirectoryNode,
  FileNode,
} from "../interfaces/callGraph";

export interface PixiElement {
  id: string;
  label: string;
  type: "directory" | "file";
  parentId?: string;
  lineCount?: number;
}

/**
 * Converts call-graph data into a flat tree payload suitable for a Pixi renderer.
 */
export class PixiVisualizer {
  /** Flattens call-graph tree data into Pixi-friendly render elements. */
  public buildElementsFromData(data: CallGraphData): PixiElement[] {
    const elements: PixiElement[] = [];

    const walk = (
      node: DirectoryNode | FileNode,
      name: string,
      path: string,
      parentId?: string,
    ) => {
      const currentId = path || "root";

      if (node.type === "directory") {
        elements.push({
          id: currentId,
          label: name || "root",
          type: "directory",
          parentId,
        });

        for (const [childName, childNode] of Object.entries(node.children)) {
          const childPath = path ? `${path}/${childName}` : childName;
          walk(childNode, childName, childPath, currentId);
        }
        return;
      }

      elements.push({
        id: currentId,
        label: name,
        type: "file",
        parentId,
        lineCount: node.lineCount,
      });
    };

    walk(data, "root", "");
    return elements;
  }
}
