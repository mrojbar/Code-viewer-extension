import {
  CallGraphData,
  DirectoryNode,
  FileNode,
  FunctionNode,
} from "../interfaces/callGraph";

export interface PixiElement {
  id: string;
  label: string;
  type: "directory" | "file" | "function";
  parentId?: string;
  lineCount?: number;
}

/**
 * Converts call-graph data into a flat tree payload suitable for a Pixi renderer.
 */
export class PixiVisualizer {
  /** Flattens call-graph tree data into Pixi-friendly render elements. */
  public buildElementsFromGraph(data: CallGraphData): PixiElement[] {
    const elements: PixiElement[] = [];

    const walk = (
      node: DirectoryNode | FileNode | FunctionNode,
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
      } else if (node.type === "file") {
        elements.push({
          id: currentId,
          label: name,
          type: "file",
          parentId,
          lineCount: node.lineCount,
        });

        // TODO: unificar esta lógica con la del directorio
        for (const [childName, childNode] of Object.entries(node.children)) {
          const childPath = `${path}/${childName}`;
          walk(childNode, childName, childPath, currentId);
        }
      } else if (node.type === "function") {
        elements.push({
          id: currentId,
          label: name,
          type: "function",
          parentId,
          // TODO: linecount
        });
      }
    };

    walk(data, "root", "");
    return elements;
  }
}
