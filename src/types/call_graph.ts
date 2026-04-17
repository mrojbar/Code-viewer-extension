/** Generated call graph interface */

export interface CallOrigin {
  scope: "project" | "external" | "unknown";
  library: string | null;
  file: string | null;
  symbol: string | null;
}

export interface CallEntry {
  type: "call";
  method: string;
  receiverExpression: string | null;
  receiverType: string | null;
  origin: CallOrigin;
}

export interface FunctionNode {
  type: "function";
  lines: string;
  calls: CallEntry[];
}

export interface FileNode {
  type: "file";
  lineCount: number;
  children: Record<string, FunctionNode>;
}

export interface DirectoryNode {
  type: "directory";
  children: Record<string, DirectoryNode | FileNode>;
}

export type CallGraphData = DirectoryNode;
