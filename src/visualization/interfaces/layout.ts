export type LayoutNodeKind = "directory" | "file" | "function";

/**
 * Renderer-agnostic hierarchical node used as input for layout algorithms.
 */
export interface LayoutNode {
  id: string;
  label: string;
  kind: LayoutNodeKind;
  weight: number;
  parentId?: string;
  children: LayoutNode[];
}

/**
 * Shared configuration accepted by all 2D layout algorithms.
 */
export interface LayoutConfig {
  width: number;
  height: number;
  round?: boolean;
}

/**
 * Geometry output contract. Consumers can render this
 */
export interface LayoutRect {
  id: string;
  label: string;
  kind: LayoutNodeKind;
  parentId?: string;
  depth: number;
  weight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Interface every layout algorithm must implement.
 */
export interface LayoutAlgorithm<TConfig extends LayoutConfig = LayoutConfig> {
  readonly id: string;
  compute(root: LayoutNode, config: TConfig): LayoutRect[];
}

/**
 * D3 treemap-specific options extending generic layout settings.
 */
export interface TreemapLayoutConfig extends LayoutConfig {
  includeRoot?: boolean;
  sortDescending?: boolean;
  maxDepth?: number;
  topPaddingPerc?: number;
  paddingOuterOverrides?: Map<string, number>;
}
