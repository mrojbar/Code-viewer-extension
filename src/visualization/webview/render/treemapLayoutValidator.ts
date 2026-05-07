/**
 * Validates D3 treemap layouts with automatic retry.
 * Uses an adaptive approach: weight boosting attempts run until validation
 * succeeds or an attempt worsens results, then falls back to paddingOuter
 * reduction for problem parents.
 */
import { TreemapLayout } from "../../layout/treemapLayout.js";
import { LayoutNode, LayoutRect } from "../../interfaces/layout.js";
import type { LayoutDiagnostics } from "../../interfaces/messages.js";
import type {
  ValidatedLayoutResult,
  VirtualLayoutSettings,
} from "../pixiView.js";

/** Maximum weight-boost attempts before switching to padding reduction. */
const MAX_WEIGHT_BOOST_ATTEMPTS = 8;
/** Maximum padding-reduction attempts. */
const MAX_PADDING_REDUCTION_ATTEMPTS = 4;
/** Aspect ratio threshold above which a rectangle is considered extreme. */
const EXTREME_ASPECT_RATIO_THRESHOLD = 50;
/** Maximum number of collapsed/extreme samples included in diagnostics logs. */
const DIAGNOSTICS_SAMPLE_LIMIT = 10;
/** Base multiplier applied on the first retry (doubled each subsequent attempt). */
const BOOST_BASE_MULTIPLIER = 0.5;
/** How much stronger parent boosts are relative to leaf boosts. */
const PARENT_BOOST_FACTOR = 2;

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
  extremeMetric: number;
} {
  const problemIds: string[] = [];
  const problemParentIds = new Set<string>();
  let problemCount = 0;
  let extremeMetric = 0;

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

    if (isExtreme) {
      extremeMetric += Math.max(
        rect.width / rect.height,
        rect.height / rect.width,
      );
    }
  }

  return {
    problemIds,
    problemParentIds: Array.from(problemParentIds),
    problemCount,
    extremeMetric,
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

/** Runs the treemap layout with validation retries and adaptive weight boosting / padding reduction. */
export class TreemapLayoutValidator {
  private readonly treemapLayout = new TreemapLayout();

  /**
   * Computes a validated layout using an adaptive approach:
   * 1. Iterative weight boosting until validation succeeds or results worsen
   * 2. Progressive paddingOuter reduction for problem parents (if enabled)
   *
   * Between weight-boost attempts, weights are restored to original values
   * so that multipliers do not accumulate.
   */
  public computeValidatedLayout(
    root: LayoutNode,
    layoutSettings: VirtualLayoutSettings,
    topPaddingPerc: number,
    sortDescending: boolean,
    dynamicTreemapPadding?: boolean,
  ): ValidatedLayoutResult {
    const { originalWeights, nodeById } = snapshotTree(root);
    const originalMedianWeight = computeMedianWeight(originalWeights);

    let bestResult: ValidatedLayoutResult | undefined;
    let bestQuality: { problemCount: number; extremeMetric: number } | undefined;

    // ------------------------------------------------------------------
    // Weight-boost phase
    // ------------------------------------------------------------------
    let previousProblemIds: string[] = [];
    let previousProblemParentIds: string[] = [];
    let previousAttemptQuality:
      | { problemCount: number; extremeMetric: number }
      | undefined;
    let bestWeightBoostAttempt: {
      attempt: number;
      multiplier: number;
      boostProblemIds: string[];
      boostProblemParentIds: string[];
      resultProblemParentIds: string[];
      quality: { problemCount: number; extremeMetric: number };
    } | undefined;

    for (let attempt = 0; attempt < MAX_WEIGHT_BOOST_ATTEMPTS; attempt++) {
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

      const { problemIds, problemParentIds, problemCount, extremeMetric } =
        findProblemNodes(layoutRects);
      const settings = { ...layoutSettings, round: useRounding };
      const quality = { problemCount, extremeMetric };

      console.log(
        `Weight-boost attempt ${attempt + 1}/${MAX_WEIGHT_BOOST_ATTEMPTS}: ${problemCount} problems, extremeMetric=${extremeMetric.toFixed(2)} (multiplier: ${multiplier})`,
        buildDiagnostics(layoutRects),
      );

      // Track best result
      if (
        !bestQuality ||
        quality.problemCount < bestQuality.problemCount ||
        (quality.problemCount === bestQuality.problemCount &&
          quality.extremeMetric < bestQuality.extremeMetric)
      ) {
        bestQuality = quality;
        bestResult = {
          layoutRects: [...layoutRects],
          settings,
          attempts: attempt + 1,
          diagnostics: buildDiagnostics(layoutRects) as LayoutDiagnostics,
        };
        bestWeightBoostAttempt = {
          attempt: attempt + 1,
          multiplier,
          boostProblemIds: [...previousProblemIds],
          boostProblemParentIds: [...previousProblemParentIds],
          resultProblemParentIds: problemParentIds,
          quality,
        };
      }

      if (problemCount === 0) {
        console.log(
          `Solution: clean layout after ${attempt + 1} weight-boost attempts`,
          buildDiagnostics(layoutRects),
        );
        restoreWeights(root, originalWeights);
        return bestResult!;
      }

      // Stop weight boosting if results worsened vs previous attempt
      if (
        previousAttemptQuality &&
        (quality.problemCount > previousAttemptQuality.problemCount ||
          (quality.problemCount === previousAttemptQuality.problemCount &&
            quality.extremeMetric > previousAttemptQuality.extremeMetric))
      ) {
        console.log(
          `Weight-boost attempt ${attempt + 1} is worse than previous; switching to padding reduction.`,
        );
        break;
      }

      previousProblemIds = problemIds;
      previousProblemParentIds = problemParentIds;
      previousAttemptQuality = quality;
    }

    // ------------------------------------------------------------------
    // Padding-reduction phase
    // ------------------------------------------------------------------
    if (
      dynamicTreemapPadding &&
      bestWeightBoostAttempt &&
      bestWeightBoostAttempt.quality.problemCount > 0
    ) {
      // Restore to best weight-boost state
      restoreWeights(root, originalWeights);
      if (bestWeightBoostAttempt.boostProblemIds.length > 0) {
        applyWeightBoost(
          root,
          bestWeightBoostAttempt.boostProblemIds,
          bestWeightBoostAttempt.boostProblemParentIds,
          originalWeights,
          nodeById,
          originalMedianWeight,
          bestWeightBoostAttempt.multiplier,
        );
      }

      const paddingOuterOverrides = new Map<string, number>();
      let previousPaddingQuality:
        | { problemCount: number; extremeMetric: number }
        | undefined;
      let paddingProblemParentIds =
        bestWeightBoostAttempt.resultProblemParentIds;

      for (
        let paddingAttempt = 0;
        paddingAttempt < MAX_PADDING_REDUCTION_ATTEMPTS;
        paddingAttempt++
      ) {
        for (const parentId of paddingProblemParentIds) {
          const currentFactor = paddingOuterOverrides.get(parentId) ?? 1;
          paddingOuterOverrides.set(parentId, currentFactor / 2);
        }

        const layoutRects = this.treemapLayout.compute(root, {
          width: layoutSettings.width,
          height: layoutSettings.height,
          maxDepth: layoutSettings.maxDepth,
          topPaddingPerc,
          round: false,
          includeRoot: true,
          sortDescending,
          paddingOuterOverrides,
        });

        const { problemParentIds, problemCount, extremeMetric } =
          findProblemNodes(layoutRects);
        const settings = { ...layoutSettings, round: false };
        const quality = { problemCount, extremeMetric };

        console.log(
          `Padding-reduction attempt ${paddingAttempt + 1}/${MAX_PADDING_REDUCTION_ATTEMPTS}: ${problemCount} problems, extremeMetric=${extremeMetric.toFixed(2)}`,
          buildDiagnostics(layoutRects),
        );

        // Update best overall
        if (
          !bestQuality ||
          quality.problemCount < bestQuality.problemCount ||
          (quality.problemCount === bestQuality.problemCount &&
            quality.extremeMetric < bestQuality.extremeMetric)
        ) {
          bestQuality = quality;
          bestResult = {
            layoutRects: [...layoutRects],
            settings,
            attempts: bestWeightBoostAttempt.attempt + paddingAttempt + 1,
            diagnostics: buildDiagnostics(layoutRects) as LayoutDiagnostics,
          };
        }

        if (problemCount === 0) {
          console.log(
            `Solution: clean layout after weight-boost + ${paddingAttempt + 1} padding-reduction attempts`,
            buildDiagnostics(layoutRects),
          );
          restoreWeights(root, originalWeights);
          return bestResult!;
        }

        // Stop padding if this attempt is worse than the previous padding attempt
        if (
          paddingAttempt > 0 &&
          previousPaddingQuality &&
          (quality.problemCount > previousPaddingQuality.problemCount ||
            (quality.problemCount === previousPaddingQuality.problemCount &&
              quality.extremeMetric > previousPaddingQuality.extremeMetric))
        ) {
          console.log(
            `Padding-reduction attempt ${paddingAttempt + 1} is worse than previous; stopping.`,
          );
          break;
        }

        previousPaddingQuality = quality;
        paddingProblemParentIds = problemParentIds;
      }
    }

    const multiplierStr = bestWeightBoostAttempt
      ? `, multiplier: ${bestWeightBoostAttempt.multiplier}`
      : "";
    console.log(
      `Solution: ${bestQuality!.problemCount === 0 ? "clean" : "best-effort"} layout${multiplierStr}, ${bestResult!.layoutRects.length} nodes, ${bestResult!.attempts} total attempts`,
      buildDiagnostics(bestResult!.layoutRects),
    );
    restoreWeights(root, originalWeights);
    return bestResult!;
  }
}
