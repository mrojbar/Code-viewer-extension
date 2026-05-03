/**
 * Validates D3 treemap layouts with automatic retry and weight boosting.
 * Uses a two-phase approach: exponential bracketing to find ANY solution,
 * then binary search refinement to find the minimum effective boost.
 */
import { TreemapLayout } from "../../layout/treemapLayout.js";
import { LayoutNode, LayoutRect } from "../../interfaces/layout.js";
import type {
  LayoutDiagnostics,
  ValidatedLayoutResult,
  VirtualLayoutSettings,
} from "../pixiView.js";

/** Phase 1 attempts: exponential search for a passing layout. */
const PHASE1_ATTEMPTS = 8;
/** Phase 2 attempts: binary search between last-failed and first-passing multiplier. */
const PHASE2_ATTEMPTS = 3;
/** Aspect ratio threshold above which a rectangle is considered extreme. */
const EXTREME_ASPECT_RATIO_THRESHOLD = 50;
/** Maximum number of collapsed/extreme samples included in diagnostics logs. */
const DIAGNOSTICS_SAMPLE_LIMIT = 10;
/** Base multiplier applied on the first retry (doubled each subsequent Phase 1 attempt). */
const BOOST_BASE_MULTIPLIER = 0.5;
/** How much stronger parent boosts are relative to leaf boosts. */
const PARENT_BOOST_FACTOR = 2;

/** Per-attempt data tracked during bracketing and refinement. */
interface AttemptRecord {
  phase: 1 | 2;
  attempt: number;
  multiplier: number;
  problemCount: number;
  layoutRects: LayoutRect[];
  settings: VirtualLayoutSettings;
  problemIds: string[];
  problemParentIds: string[];
}

/** Snapshots original weights and builds an ID index for revert/retry logic. */
function snapshotTree(root: LayoutNode): {
  originalWeights: Map<string, number>;
  nodeById: Map<string, LayoutNode>;
} {
  const originalWeights = new Map<string, number>();
  const nodeById = new Map<string, LayoutNode>();
  const stack: LayoutNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    originalWeights.set(node.id, node.weight);
    nodeById.set(node.id, node);
    for (const child of node.children) {
      stack.push(child);
    }
  }
  return { originalWeights, nodeById };
}

/** Computes median weight from a snapshot for consistent boost scaling. */
function computeMedianWeight(originalWeights: Map<string, number>): number {
  const weights = Array.from(originalWeights.values())
    .filter((w) => w > 0)
    .sort((a, b) => a - b);
  return weights.length > 0 ? weights[Math.floor(weights.length / 2)] : 1;
}

/** Builds a "/" delimited path from a node up to the root for diagnostics. */
function buildNodePath(
  nodeId: string,
  rectById: Map<string, LayoutRect>,
): string {
  const parts: string[] = [];
  let currentId: string | undefined = nodeId;
  while (currentId) {
    const rect = rectById.get(currentId);
    if (!rect) {
      break;
    }
    if (rect.id === "__layout_root__") {
      break;
    }
    parts.unshift(rect.label);
    currentId = rect.parentId;
  }
  return parts.join("/") || nodeId;
}

/** Scans layout results for collapsed or extreme rectangles. */
function findProblemNodes(layoutRects: LayoutRect[]): {
  problemIds: string[];
  problemParentIds: string[];
  problemCount: number;
} {
  const problemIds: string[] = [];
  const problemParentIds = new Set<string>();
  let problemCount = 0;

  for (const rect of layoutRects) {
    const isCollapsed = rect.width <= 0 || rect.height <= 0;
    const isExtreme =
      rect.width > 0 &&
      rect.height > 0 &&
      (rect.width / rect.height > EXTREME_ASPECT_RATIO_THRESHOLD ||
        rect.height / rect.width > EXTREME_ASPECT_RATIO_THRESHOLD);

    if (isCollapsed || isExtreme) {
      problemCount++;
      if (!problemIds.includes(rect.id)) {
        problemIds.push(rect.id);
      }
      if (rect.parentId) {
        problemParentIds.add(rect.parentId);
      }
    }
  }

  return {
    problemIds,
    problemParentIds: Array.from(problemParentIds),
    problemCount,
  };
}

/** Builds a diagnostics payload with problem counts, average area, and sample paths. */
function buildDiagnostics(layoutRects: LayoutRect[]): {
  totalNodes: number;
  collapsedCount: number;
  extremeCount: number;
  avgArea: number;
  collapsedSamples: Array<{ path: string; w: number; h: number }>;
  extremeSamples: Array<{ path: string; w: number; h: number }>;
} {
  let collapsedCount = 0;
  let extremeCount = 0;
  const collapsedSamples: Array<{ path: string; w: number; h: number }> = [];
  const extremeSamples: Array<{ path: string; w: number; h: number }> = [];
  const areas: number[] = [];

  const rectById = new Map<string, LayoutRect>();
  for (const rect of layoutRects) {
    rectById.set(rect.id, rect);
  }

  for (const rect of layoutRects) {
    areas.push(Math.max(0, rect.width * rect.height));

    if (rect.width <= 0 || rect.height <= 0) {
      collapsedCount++;
      collapsedSamples.push({
        path: buildNodePath(rect.id, rectById),
        w: rect.width,
        h: rect.height,
      });
    } else if (
      rect.width / rect.height > EXTREME_ASPECT_RATIO_THRESHOLD ||
      rect.height / rect.width > EXTREME_ASPECT_RATIO_THRESHOLD
    ) {
      extremeCount++;
      extremeSamples.push({
        path: buildNodePath(rect.id, rectById),
        w: rect.width,
        h: rect.height,
      });
    }
  }

  const avgArea =
    areas.reduce((a, b) => a + b, 0) / Math.max(1, areas.length);

  return {
    totalNodes: layoutRects.length,
    collapsedCount,
    extremeCount,
    avgArea: Math.round(avgArea),
    collapsedSamples: collapsedSamples.slice(0, DIAGNOSTICS_SAMPLE_LIMIT),
    extremeSamples: extremeSamples.slice(0, DIAGNOSTICS_SAMPLE_LIMIT),
  };
}

/** Applies an additive weight boost to problematic nodes and their parents, then re-aggregates directory weights bottom-up. */
function applyWeightBoost(
  root: LayoutNode,
  problemIds: string[],
  problemParentIds: string[],
  originalWeights: Map<string, number>,
  nodeById: Map<string, LayoutNode>,
  medianWeight: number,
  multiplier: number,
): void {
  if (problemIds.length === 0) {
    return;
  }

  const boostAmount = medianWeight * multiplier;
  const parentBoostAmount = boostAmount * PARENT_BOOST_FACTOR;

  for (const nodeId of problemIds) {
    const node = nodeById.get(nodeId);
    if (node) {
      node.weight = (originalWeights.get(nodeId) ?? 0) + boostAmount;
    }
  }

  for (const parentId of problemParentIds) {
    const parent = nodeById.get(parentId);
    if (parent) {
      parent.weight = (originalWeights.get(parentId) ?? 0) + parentBoostAmount;
    }
  }

  function aggregate(node: LayoutNode): number {
    if (!node.children || node.children.length === 0) {
      return node.weight;
    }
    let sum = 0;
    for (const child of node.children) {
      sum += aggregate(child);
    }
    node.weight = Math.max(node.weight, sum);
    return node.weight;
  }
  aggregate(root);
}

/** Restores all node weights in the tree from a snapshot map. */
function restoreWeights(
  root: LayoutNode,
  originalWeights: Map<string, number>,
): void {
  const stack: LayoutNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const original = originalWeights.get(node.id);
    if (original !== undefined) {
      node.weight = original;
    }
    for (const child of node.children) {
      stack.push(child);
    }
  }
}

/** Runs the treemap layout with validation retries and progressive weight boosting. */
export class TreemapLayoutValidator {
  private readonly treemapLayout = new TreemapLayout();

  /**
   * Computes a validated layout using a two-phase search:
   * 1. Exponential bracketing to find ANY passing layout
   * 2. Binary search refinement to find the minimum effective boost
   *
   * Between each attempt, weights are restored to their original values
   * so that multipliers do not accumulate.
   */
  public computeValidatedLayout(
    root: LayoutNode,
    layoutSettings: VirtualLayoutSettings,
    topPaddingPerc: number,
    sortDescending: boolean,
  ): ValidatedLayoutResult {
    const { originalWeights, nodeById } = snapshotTree(root);
    const originalMedianWeight = computeMedianWeight(originalWeights);

    let bestResult: ValidatedLayoutResult | undefined;
    let bestProblemCount = Infinity;

    // ------------------------------------------------------------------
    // Phase 1: Exponential bracketing (find ANY solution)
    // ------------------------------------------------------------------
    let previousProblemIds: string[] = [];
    let previousProblemParentIds: string[] = [];
    let firstPassingRecord: AttemptRecord | undefined;
    let lastFailedRecord: AttemptRecord | undefined;

    for (let attempt = 0; attempt < PHASE1_ATTEMPTS; attempt++) {
      restoreWeights(root, originalWeights);

      const useRounding = attempt === 0 && layoutSettings.round;
      const multiplier =
        attempt === 0 ? 0 : Math.pow(2, attempt - 1) * BOOST_BASE_MULTIPLIER;

      if (attempt > 0 && previousProblemIds.length > 0) {
        applyWeightBoost(
          root,
          previousProblemIds,
          previousProblemParentIds,
          originalWeights,
          nodeById,
          originalMedianWeight,
          multiplier,
        );
      }

      const layoutRects = this.treemapLayout.compute(root, {
        width: layoutSettings.width,
        height: layoutSettings.height,
        maxDepth: layoutSettings.maxDepth,
        topPaddingPerc,
        round: useRounding,
        includeRoot: true,
        sortDescending,
      });

      const { problemIds, problemParentIds, problemCount } =
        findProblemNodes(layoutRects);
      const settings = { ...layoutSettings, round: useRounding };

      // Track global best (fewest problems)
      if (problemCount < bestProblemCount) {
        bestProblemCount = problemCount;
        bestResult = {
          layoutRects: [...layoutRects],
          settings,
          attempts: attempt + 1,
          diagnostics: buildDiagnostics(layoutRects) as LayoutDiagnostics,
        };
      }

      const record: AttemptRecord = {
        phase: 1,
        attempt: attempt + 1,
        multiplier,
        problemCount,
        layoutRects: [...layoutRects],
        settings,
        problemIds,
        problemParentIds,
      };

      console.log(
        `Phase 1 attempt ${attempt + 1}/${PHASE1_ATTEMPTS}: ${problemCount} problems (multiplier: ${multiplier})`,
        buildDiagnostics(layoutRects),
      );

      if (problemCount === 0) {
        firstPassingRecord = record;
        break;
      }

      lastFailedRecord = record;
      previousProblemIds = problemIds;
      previousProblemParentIds = problemParentIds;
    }

    // No passing result in Phase 1 — return the best we found
    if (!firstPassingRecord) {
      console.warn(
        `No clean layout found in Phase 1. Best result had ${bestProblemCount} problems.`,
      );
      restoreWeights(root, originalWeights);
      return (
        bestResult ?? {
          layoutRects: [],
          settings: layoutSettings,
          attempts: PHASE1_ATTEMPTS,
          diagnostics: buildDiagnostics([]) as LayoutDiagnostics,
        }
      );
    }

    // Baseline already passes — no refinement needed
    if (!lastFailedRecord) {
      console.log(
        `Solution: baseline layout valid, ${bestResult!.layoutRects.length} nodes, ${bestResult!.attempts} attempts`,
        buildDiagnostics(bestResult!.layoutRects),
      );
      restoreWeights(root, originalWeights);
      return bestResult!;
    }

    // ------------------------------------------------------------------
    // Phase 2: Binary search refinement (find minimum effective boost)
    // ------------------------------------------------------------------
    let lowMultiplier = lastFailedRecord.multiplier;
    let highMultiplier = firstPassingRecord.multiplier;
    let lowProblemIds = lastFailedRecord.problemIds;
    let lowProblemParentIds = lastFailedRecord.problemParentIds;

    for (let phase2Attempt = 0; phase2Attempt < PHASE2_ATTEMPTS; phase2Attempt++) {
      const midpoint = (lowMultiplier + highMultiplier) / 2;

      restoreWeights(root, originalWeights);
      applyWeightBoost(
        root,
        lowProblemIds,
        lowProblemParentIds,
        originalWeights,
        nodeById,
        originalMedianWeight,
        midpoint,
      );

      const layoutRects = this.treemapLayout.compute(root, {
        width: layoutSettings.width,
        height: layoutSettings.height,
        maxDepth: layoutSettings.maxDepth,
        topPaddingPerc,
        round: false,
        includeRoot: true,
        sortDescending,
      });

      const { problemIds, problemParentIds, problemCount } =
        findProblemNodes(layoutRects);
      const settings = { ...layoutSettings, round: false };

      console.log(
        `Phase 2 attempt ${phase2Attempt + 1}/${PHASE2_ATTEMPTS}: ${problemCount} problems (multiplier: ${midpoint.toFixed(2)})`,
        buildDiagnostics(layoutRects),
      );

      if (problemCount === 0) {
        highMultiplier = midpoint;
        bestResult = {
          layoutRects: [...layoutRects],
          settings,
          attempts: PHASE1_ATTEMPTS + phase2Attempt + 1,
          diagnostics: buildDiagnostics(layoutRects) as LayoutDiagnostics,
        };
        bestProblemCount = 0;
      } else {
        lowMultiplier = midpoint;
        lowProblemIds = problemIds;
        lowProblemParentIds = problemParentIds;
      }
    }

    const solutionMultiplier = (lowMultiplier + highMultiplier) / 2;
    console.log(
      `Solution: ${bestProblemCount === 0 ? "clean" : "best-effort"} layout with multiplier ~${solutionMultiplier.toFixed(2)}, ${bestResult!.layoutRects.length} nodes, ${bestResult!.attempts} total attempts`,
      buildDiagnostics(bestResult!.layoutRects),
    );
    restoreWeights(root, originalWeights);
    return bestResult!;
  }
}
