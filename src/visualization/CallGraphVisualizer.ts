import cytoscape from "cytoscape";

import { CallGraphData, DirectoryNode, FileNode } from "../types/call_graph";

export interface Box extends cytoscape.NodeDefinition {
  data: {
    id: string;
    label: string;
    [key: string]: any;
  };
  style?: Record<string, any>;
  classes?: string;
}

export interface DirectoryBox extends Box {
  data: {
    id: string;
    label: string;
    type: "directory";
    parent?: string;
  };
}

/** Cytoscape call graph visualizer */

export class CallGraphVisualizer {
  /**
   * Builds a call graph array format suitable for Cytoscape elements.
   * @param _data call graph source for the graph builder
   */
  public buildElementsFromData(
    data: CallGraphData,
  ): cytoscape.ElementDefinition[] {
    const elements: cytoscape.ElementDefinition[] = [];

    const processNode = (
      node: DirectoryNode | FileNode,
      path: string,
      parentId?: string,
    ) => {
      const currentId = path || "root";
      if (node.type === "directory") {
        const dirElement: DirectoryBox = {
          data: {
            id: currentId,
            label: currentId,
            type: "directory",
          },
          classes: "box-node directory-node",
        };

        if (parentId) {
          dirElement.data.parent = parentId;
        }

        elements.push(dirElement);

        for (const [name, childNode] of Object.entries(
          (node as DirectoryNode).children,
        )) {
          const childPath = path ? `${path}/${name}` : `${name}`;
          processNode(childNode, childPath, currentId);
        }
      }
    };

    processNode(data, "");

    return elements;
  }
}
