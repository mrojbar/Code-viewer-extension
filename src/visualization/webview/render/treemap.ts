import { Application, Container, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { TreemapLayout } from "../../layout/treemapLayout.js";
import { LayoutNode, LayoutRect } from "../../interfaces/layout.js";
import {
  TreemapLabelRenderer,
  type LabelRenderRef,
  type BoxLabelInput,
} from "./label.js";
import type {
  ExtensionConfig,
  UpdateGraphMessage,
  UpdateSettingsMessage,
} from "../../interfaces/messages.js";
import type {
  Box,
  BoxRenderProps,
  LayoutComplexity,
  PixiElement,
  RenderedBox,
  ValidatedLayoutResult,
  VirtualLayoutSettings,
  VsCodeApi,
} from "../pixiView.js";
import { clamp, toFiniteInteger, shallowEqualObject } from "../utils.js";

const WORLD_PADDING_PX = 120;
const TREEMAP_WIDTH_PX = 1000;
const TREEMAP_HEIGHT_PX = 1500;
const TREEMAP_INNER_PADDING_PX = 50;
const TREEMAP_OUTER_PADDING_PX = 50;
const RESIZE_DEBOUNCE_MS = 250;
const SETTINGS_FLUSH_DELAY_MS = 250;

const BOX_SCALE_COMPENSATION_MIN = 0;
const BOX_SCALE_COMPENSATION_MAX = 100;

const LAYOUT_COMPLEXITY_NODE_COUNT_BASE = 150;
const LAYOUT_COMPLEXITY_DEPTH_BASE = 6;
const LAYOUT_VIRTUAL_MIN_SIDE_PX = 240;
const LAYOUT_VIRTUAL_MAX_SIDE_PX = 8000;
const LAYOUT_PADDING_LOG_DIVISOR = 3;
const LAYOUT_PADDING_DEPTH_DIVISOR = 7;
const LAYOUT_DISABLE_ROUND_NODE_THRESHOLD = 400;
const LAYOUT_DISABLE_ROUND_DEPTH_THRESHOLD = 10;

const VIEWPORT_WHEEL_SMOOTH = 5;
const VIEWPORT_DECELERATE_FRICTION = 0.9;
const VIEWPORT_DECELERATE_MIN_SPEED = 0.02;

const MAX_LAYOUT_VALIDATION_ATTEMPTS = 6;
const LAYOUT_RETRY_SIZE_MULTIPLIER = 1.35;
const LAYOUT_RETRY_PADDING_SHRINK_FACTOR = 0.75;
const LAYOUT_RETRY_MIN_PADDING_PX = 1;
const LAYOUT_DEPTH_RISK_BUFFER_PX = 50;
const LAYOUT_NODE_AREA_FACTOR = 1.5;
const LAYOUT_NODE_MIN_SIDE_PARENT_RATIO = 0.1;
const LAYOUT_NODE_MAX_NORMALIZED_WEIGHT = 1;

const BOX_TYPES = {
  DIR: "directory",
  FILE: "file",
  FUNC: "function",
} as const;

const BOXES_RENDER_PROPS: BoxRenderProps = {
  [BOX_TYPES.DIR]: {
    backgroundColor: 0xffffff,
    backgroundAlpha: 0.12,
    strokeColor: 0xffffff,
    strokeAlpha: 0.9,
    strokeWidth: 1,
  },
  [BOX_TYPES.FILE]: {
    backgroundColor: 0x80f444,
    backgroundAlpha: 0.12,
    strokeColor: 0x80f444,
    strokeAlpha: 0.9,
    strokeWidth: 1,
  },
  [BOX_TYPES.FUNC]: {
    backgroundColor: 0x4096ee,
    backgroundAlpha: 0.24,
    strokeColor: 0x4096ee,
    strokeAlpha: 0.9,
    strokeWidth: 1,
  },
};

/** Stateful manager that owns Pixi lifecycle, layout validation, and rerenders. */
export class TreemapRenderManager {
  /** Active Pixi application instance for this webview session. */
  private app: Application | undefined;
  /** Interactive viewport used for pan/zoom and world sizing. */
  private viewport: Viewport | undefined;
  /** Root scene container that holds boxes and labels. */
  private scene: Container | undefined;
  /** Last received element payload used for resize rerenders. */
  private pendingElements: PixiElement[] | undefined;
  /** Debounce handle for resize-triggered layout rerenders. */
  private resizeDebounceTimer: number | undefined;
  /** Monotonic render version to drop stale async render results. */
  private renderVersion = 0;
  /** Current drawable box objects for stroke-width compensation updates. */
  private renderedBoxes: RenderedBox[] = [];
  /** Parent->children index used by label collision constraints. */
  private childBoxesByParentId = new Map<string, BoxLabelInput[]>();
  /** Stateful label renderer that owns Text nodes and label fit decisions. */
  private readonly labelRenderer = new TreemapLabelRenderer();
  /** Shared treemap algorithm instance reused across attempts/renders. */
  private readonly treemapLayout = new TreemapLayout();
  /** Latest host-provided rendering settings. */
  private settings: ExtensionConfig = {} as ExtensionConfig;
  /** Guards one flush per animation frame to coalesce bursty updates. */
  private renderFlushScheduled = false;
  /** Delayed flush for settings-only updates; canceled if graph arrives. */
  private settingsFlushTimer: number | undefined;
  /** If true, should fit camera to content bounds. */
  private fitToContent = true;

  constructor(private readonly api: VsCodeApi | undefined) {}

  /** Applies host update payload and schedules a full render pass. */
  public handleGraphUpdate(message: UpdateGraphMessage): void {
    if (this.settingsFlushTimer !== undefined) {
      window.clearTimeout(this.settingsFlushTimer);
      this.settingsFlushTimer = undefined;
    }

    this.pendingElements = message.elements as PixiElement[];
    this.scheduleRenderFlush();
  }

  public handleSettingsUpdate(message: UpdateSettingsMessage): void {
    const nextSettings = message.settings;
    const currentSettings = this.settings;
    if (shallowEqualObject(currentSettings, nextSettings)) {
      return;
    }
    this.settings = nextSettings;
    this.labelRenderer.setFontFamily(this.settings.editorFontFamily);

    if (this.settingsFlushTimer !== undefined) {
      window.clearTimeout(this.settingsFlushTimer);
    }

    this.settingsFlushTimer = window.setTimeout(() => {
      this.settingsFlushTimer = undefined;
      this.scheduleRenderFlush();
    }, SETTINGS_FLUSH_DELAY_MS);
  }

  /** Condenses scheduled host updates into one render per animation frame. */
  private scheduleRenderFlush(): void {
    if (this.renderFlushScheduled) {
      return;
    }

    this.renderFlushScheduled = true;
    window.requestAnimationFrame(async () => {
      this.renderFlushScheduled = false;
      if (!this.pendingElements) {
        return;
      }
      await this.renderElements(this.pendingElements, this.fitToContent);
    });
  }

  /** Exposes label internals so callers can inspect current text nodes and bindings. */
  public getLabelRenderRefs(): ReadonlyArray<LabelRenderRef> {
    return this.labelRenderer.getRenderRefs();
  }

  /** Initializes Pixi/viewport wiring and performs initial render. */
  public async bootstrap(): Promise<void> {
    const canvas = document.getElementById(
      "pixi-canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) {
      return;
    }

    this.app = new Application();
    await this.app.init({
      canvas,
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
    });

    this.scene = new Container();

    const { width, height } = this.getScreenSize();
    const { worldWidth, worldHeight } = this.getWorldSizeFromContent(
      width,
      height,
    );

    this.viewport = new Viewport({
      screenWidth: width,
      screenHeight: height,
      worldWidth,
      worldHeight,
      events: this.app.renderer.events,
    });

    this.viewport
      .drag({ mouseButtons: "left" })
      .wheel({ smooth: VIEWPORT_WHEEL_SMOOTH })
      .decelerate({
        friction: VIEWPORT_DECELERATE_FRICTION,
        minSpeed: VIEWPORT_DECELERATE_MIN_SPEED,
      });

    this.viewport.on("zoomed", () => {
      this.applyViewportScaleCompensation();
    });

    this.app.stage.addChild(this.viewport);
    this.viewport.addChild(this.scene);

    if (this.pendingElements) {
      await this.renderElements(this.pendingElements);
    } else {
      await this.renderElements([]);
    }

    window.__pixiApp = this.app;
    window.__pixiViewport = this.viewport;
    this.api?.postMessage({ type: "webviewReady" });
  }

  /** Debounces resize events and rerenders using latest pending elements. */
  public scheduleResizeViewportUpdate(): void {
    if (this.resizeDebounceTimer !== undefined) {
      window.clearTimeout(this.resizeDebounceTimer);
    }

    this.resizeDebounceTimer = window.setTimeout(() => {
      this.resizeDebounceTimer = undefined;
      void this.renderElements(this.pendingElements ?? []);
    }, RESIZE_DEBOUNCE_MS);
  }

  /**
   * Main render pipeline: build tree, validate layout, render boxes+labels, fit view.
   * If no elements provided, will attempt to rerender with last elements
   */
  public async renderElements(
    elements: PixiElement[] = this.pendingElements ?? [],
    fitToContent: boolean = true,
  ): Promise<void> {
    if (elements.length === 0) {
      return;
    }

    this.pendingElements = elements;
    window.__pixiLastElements = elements;

    const currentRenderVersion = ++this.renderVersion;
    if (!this.scene) {
      return;
    }

    this.scene.removeChildren();
    this.renderedBoxes = [];
    this.labelRenderer.resetState();

    const root = this.buildLayoutTree(elements);
    if (!root) {
      this.updateViewportSize();
      return;
    }

    if (currentRenderVersion !== this.renderVersion) {
      return;
    }

    const { width: screenWidth, height: screenHeight } = this.getScreenSize();
    const computedSettings = computeVirtualLayoutSettings(
      root,
      screenWidth,
      screenHeight,
    );

    const validation = this.computeValidatedLayout(root, computedSettings);

    console.log(
      `Treemap settings validated in ${validation.attempts} attempts.`,
    );

    const boxes = mapBoxes(validation.layoutRects).filter(
      (box) => box.width > 0 && box.height > 0,
    );

    this.childBoxesByParentId = new Map<string, BoxLabelInput[]>();
    for (const box of boxes) {
      if (!box.parentId) {
        continue;
      }

      const siblings = this.childBoxesByParentId.get(box.parentId);
      if (siblings) {
        siblings.push(box);
      } else {
        this.childBoxesByParentId.set(box.parentId, [box]);
      }
    }

    for (const box of boxes) {
      const boxGraphic = new Graphics();
      this.renderedBoxes.push({ graphics: boxGraphic, boxData: box });
      this.scene.addChild(boxGraphic);
    }

    if (!this.viewport) {
      return;
    }

    await this.labelRenderer.renderLabels({
      scene: this.scene,
      viewport: this.viewport,
      directories: boxes,
      childBoxesByParentId: this.childBoxesByParentId,
    });

    if (currentRenderVersion !== this.renderVersion) {
      return;
    }

    this.applyViewportScaleCompensation();
    this.updateViewportSize();

    if (fitToContent) {
      this.fitViewportToContent();
      this.applyViewportScaleCompensation();
    }
  }

  /** Reads current renderer dimensions for world and fit calculations. */
  private getScreenSize(): { width: number; height: number } {
    if (!this.app) {
      return { width: window.innerWidth, height: window.innerHeight };
    }

    return {
      width: this.app.renderer.width,
      height: this.app.renderer.height,
    };
  }

  /** Computes world bounds from scene content plus guard padding. */
  private getWorldSizeFromContent(
    screenWidth: number,
    screenHeight: number,
  ): { worldWidth: number; worldHeight: number } {
    if (!this.scene || this.scene.children.length === 0) {
      return {
        worldWidth: screenWidth,
        worldHeight: screenHeight,
      };
    }

    const bounds = this.scene.getLocalBounds();
    const contentWidth = Math.max(
      1,
      Math.ceil(bounds.width + WORLD_PADDING_PX * 2),
    );
    const contentHeight = Math.max(
      1,
      Math.ceil(bounds.height + WORLD_PADDING_PX * 2),
    );

    return {
      worldWidth: Math.max(screenWidth, contentWidth),
      worldHeight: Math.max(screenHeight, contentHeight),
    };
  }

  /** Resizes viewport screen/world dimensions after content or canvas changes. */
  private updateViewportSize(): void {
    if (!this.viewport) {
      return;
    }

    const { width, height } = this.getScreenSize();
    const { worldWidth, worldHeight } = this.getWorldSizeFromContent(
      width,
      height,
    );
    this.viewport.resize(width, height, worldWidth, worldHeight);
  }

  /** Fits camera to current scene bounds while preserving world padding. */
  private fitViewportToContent(): void {
    if (!this.viewport || !this.scene || this.scene.children.length === 0) {
      return;
    }

    const { width: screenWidth, height: screenHeight } = this.getScreenSize();
    if (screenWidth <= 0 || screenHeight <= 0) {
      return;
    }

    const bounds = this.scene.getLocalBounds();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const paddedWidth = bounds.width + WORLD_PADDING_PX * 2;
    const paddedHeight = bounds.height + WORLD_PADDING_PX * 2;
    const fitScale = Math.min(
      screenWidth / Math.max(1, paddedWidth),
      screenHeight / Math.max(1, paddedHeight),
    );

    if (!Number.isFinite(fitScale) || fitScale <= 0) {
      return;
    }

    this.viewport.scale.set(fitScale);
    this.viewport.moveCenter(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
  }

  /** Keeps box stroke widths and labels visually stable across zoom levels. */
  private applyViewportScaleCompensation(): void {
    if (!this.viewport) {
      return;
    }

    const zoom = this.viewport.scale.x;
    if (!Number.isFinite(zoom) || zoom <= 0) {
      return;
    }

    const compensatedScale = Math.max(
      BOX_SCALE_COMPENSATION_MIN,
      Math.min(BOX_SCALE_COMPENSATION_MAX, 1 / zoom),
    );

    for (const { graphics, boxData } of this.renderedBoxes) {
      graphics.clear();
      graphics
        .rect(boxData.x, boxData.y, boxData.width, boxData.height)
        .fill({
          color: boxData.backgroundColor,
          alpha: boxData.backgroundAlpha,
        })
        .stroke({
          color: boxData.strokeColor,
          width: boxData.strokeWidth * compensatedScale,
          alpha: boxData.strokeAlpha,
          alignment: 1,
        });
    }

    this.labelRenderer.applyViewportScaleCompensation(this.viewport);
  }

  /** Produces next retry settings by enlarging canvas and relaxing spacing. */
  private buildRetryLayoutSettings(
    previous: VirtualLayoutSettings,
  ): VirtualLayoutSettings {
    return normalizeLayoutSettings({
      width: Math.ceil(previous.width * LAYOUT_RETRY_SIZE_MULTIPLIER),
      height: Math.ceil(previous.height * LAYOUT_RETRY_SIZE_MULTIPLIER),
      paddingInner: previous.paddingInner * LAYOUT_RETRY_PADDING_SHRINK_FACTOR,
      paddingOuter: previous.paddingOuter * LAYOUT_RETRY_PADDING_SHRINK_FACTOR,
      round: false,
    });
  }

  /** Provides one capped emergency setting set before giving up retries. */
  private getFinalFallbackSettings(
    base: VirtualLayoutSettings,
  ): VirtualLayoutSettings {
    return normalizeLayoutSettings({
      width: Math.max(base.width, LAYOUT_VIRTUAL_MAX_SIDE_PX),
      height: Math.max(base.height, LAYOUT_VIRTUAL_MAX_SIDE_PX),
      paddingInner: LAYOUT_RETRY_MIN_PADDING_PX,
      paddingOuter: LAYOUT_RETRY_MIN_PADDING_PX,
      round: false,
    });
  }

  /** Runs bounded retries until all directory rects are renderable or capped. */
  private computeValidatedLayout(
    root: LayoutNode,
    baseSettings: VirtualLayoutSettings,
  ): ValidatedLayoutResult {
    let currentSettings = normalizeLayoutSettings(baseSettings);
    let lastResult: LayoutRect[] = [];
    let lastSettings = currentSettings;

    /** check if layout rects to be rendered are valid */
    const passesValidation = (layoutRects: LayoutRect[]): boolean => {
      const collapsedCount = countCollapsedRects(layoutRects);
      const isLastRectTooSmall = checkLastRectTooSmall(layoutRects);

      return !isLastRectTooSmall && collapsedCount === 0;
    };

    for (
      let attempt = 1;
      attempt <= MAX_LAYOUT_VALIDATION_ATTEMPTS;
      attempt++
    ) {
      const layoutRects = this.treemapLayout.compute(root, {
        width: currentSettings.width,
        height: currentSettings.height,
        paddingInner: currentSettings.paddingInner,
        paddingOuter: currentSettings.paddingOuter,
        round: currentSettings.round,
        includeRoot: true,
        sortDescending: this.settings.sortNodesByDescendingWeight,
      });

      if (passesValidation(layoutRects)) {
        return {
          layoutRects,
          settings: currentSettings,
          attempts: attempt,
        };
      }

      lastResult = layoutRects;
      lastSettings = currentSettings;

      const nextSettings = this.buildRetryLayoutSettings(currentSettings);
      if (areLayoutSettingsEqual(currentSettings, nextSettings)) {
        break;
      }

      currentSettings = nextSettings;
    }

    const fallback = this.getFinalFallbackSettings(baseSettings);
    const fallbackRects = this.treemapLayout.compute(root, {
      width: fallback.width,
      height: fallback.height,
      paddingInner: fallback.paddingInner,
      paddingOuter: fallback.paddingOuter,
      round: fallback.round,
      includeRoot: true,
      sortDescending: this.settings.sortNodesByDescendingWeight,
    });

    if (passesValidation(fallbackRects)) {
      return {
        layoutRects: fallbackRects,
        settings: fallback,
        attempts: MAX_LAYOUT_VALIDATION_ATTEMPTS + 1,
      };
    }

    console.warn(
      `Treemap layout remains collapsed directories after ${MAX_LAYOUT_VALIDATION_ATTEMPTS} retries.`,
    );

    return {
      layoutRects: lastResult,
      settings: lastSettings,
      attempts: MAX_LAYOUT_VALIDATION_ATTEMPTS,
    };
  }

  /** Builds a hierarchy that the shared treemap layout can consume. */
  private buildLayoutTree(elements: PixiElement[]): LayoutNode | undefined {
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
        weight: this.settings.setFileLinesAsWeight ? rawWeight : 0,
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

      if (this.settings.normalizeTreemapWeight) {
        const normalizedWeight = node.weight / maxWeight;
        node.weight = normalizedWeight * LAYOUT_NODE_MAX_NORMALIZED_WEIGHT;
      }

      const parent = nodesById.get(node.parentId || "");
      if (!parent) {
        roots.push(node);
        continue;
      }
      parent.children.push(node);
    }

    if (roots.length === 1) {
      return roots[0];
    }

    return {
      id: "__layout_root__",
      label: "root",
      kind: BOX_TYPES.DIR,
      weight: 0,
      children: roots,
    };
  }
}

/** Maps generic layout rectangles into render boxes. */
function mapBoxes(rects: LayoutRect[]): Box[] {
  return rects
    .filter((rect) =>
      [BOX_TYPES.DIR, BOX_TYPES.FILE, BOX_TYPES.FUNC].includes(rect.kind),
    )
    .map((rect) => ({
      id: rect.id,
      label: rect.label,
      parentId: rect.parentId,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      backgroundColor: BOXES_RENDER_PROPS[rect.kind].backgroundColor,
      backgroundAlpha: BOXES_RENDER_PROPS[rect.kind].backgroundAlpha,
      strokeColor: BOXES_RENDER_PROPS[rect.kind].strokeColor,
      strokeAlpha: BOXES_RENDER_PROPS[rect.kind].strokeAlpha,
      strokeWidth: BOXES_RENDER_PROPS[rect.kind].strokeWidth,
    }));
}

/** Picks virtual canvas size and paddings from screen aspect + tree complexity. */
function computeVirtualLayoutSettings(
  root: LayoutNode,
  screenWidth: number,
  screenHeight: number,
): VirtualLayoutSettings {
  const fallbackAspect = TREEMAP_WIDTH_PX / TREEMAP_HEIGHT_PX;
  const aspect =
    screenWidth > 0 && screenHeight > 0
      ? screenWidth / screenHeight
      : fallbackAspect;

  const { nodeCount, maxDepth } = measureLayoutComplexity(root);
  const baseArea = TREEMAP_WIDTH_PX * TREEMAP_HEIGHT_PX;
  const countScale = Math.max(
    1,
    Math.sqrt(nodeCount / LAYOUT_COMPLEXITY_NODE_COUNT_BASE),
  );
  const depthScale = Math.max(1, maxDepth / LAYOUT_COMPLEXITY_DEPTH_BASE);
  const complexityScale = Math.max(countScale, depthScale);
  const targetArea = baseArea * complexityScale;

  let width = Math.sqrt(targetArea * aspect);
  let height = targetArea / Math.max(1, width);

  const scaleUp = Math.max(
    LAYOUT_VIRTUAL_MIN_SIDE_PX / Math.max(1, width),
    LAYOUT_VIRTUAL_MIN_SIDE_PX / Math.max(1, height),
    1,
  );
  width *= scaleUp;
  height *= scaleUp;

  const scaleDown = Math.min(
    LAYOUT_VIRTUAL_MAX_SIDE_PX / Math.max(1, width),
    LAYOUT_VIRTUAL_MAX_SIDE_PX / Math.max(1, height),
    1,
  );
  width *= scaleDown;
  height *= scaleDown;

  const paddingScale = Math.max(
    1,
    Math.log2(nodeCount + 1) / LAYOUT_PADDING_LOG_DIVISOR,
    maxDepth / LAYOUT_PADDING_DEPTH_DIVISOR,
  );
  const paddingInner = clamp(
    TREEMAP_INNER_PADDING_PX / paddingScale,
    2,
    TREEMAP_INNER_PADDING_PX,
  );
  const paddingOuter = clamp(
    TREEMAP_OUTER_PADDING_PX / paddingScale,
    2,
    TREEMAP_OUTER_PADDING_PX,
  );

  const depthRiskMinSide = Math.ceil(
    Math.max(0, maxDepth - 1) * 2 * (paddingInner + paddingOuter) +
      LAYOUT_DEPTH_RISK_BUFFER_PX,
  );

  if (width < depthRiskMinSide || height < depthRiskMinSide) {
    const growthForDepth = Math.max(
      depthRiskMinSide / Math.max(1, width),
      depthRiskMinSide / Math.max(1, height),
      1,
    );
    width *= growthForDepth;
    height *= growthForDepth;
  }

  const minAreaForNodeDensity =
    nodeCount * Math.pow(paddingInner + 2, 2) * LAYOUT_NODE_AREA_FACTOR;
  const currentArea = width * height;
  if (currentArea < minAreaForNodeDensity) {
    const growthForDensity = Math.sqrt(
      minAreaForNodeDensity / Math.max(1, currentArea),
    );
    width *= growthForDensity;
    height *= growthForDensity;
  }

  const finalScaleDown = Math.min(
    LAYOUT_VIRTUAL_MAX_SIDE_PX / Math.max(1, width),
    LAYOUT_VIRTUAL_MAX_SIDE_PX / Math.max(1, height),
    1,
  );
  width *= finalScaleDown;
  height *= finalScaleDown;

  return {
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
    paddingInner,
    paddingOuter,
    // Disabling rounding for very dense trees keeps tiny boxes from collapsing away.
    round: !(
      nodeCount > LAYOUT_DISABLE_ROUND_NODE_THRESHOLD ||
      maxDepth > LAYOUT_DISABLE_ROUND_DEPTH_THRESHOLD
    ),
  };
}

/** Normalizes width/height/padding to stay inside allowed runtime limits. */
function normalizeLayoutSettings(
  settings: VirtualLayoutSettings,
): VirtualLayoutSettings {
  return {
    width: clamp(
      toFiniteInteger(settings.width),
      1,
      LAYOUT_VIRTUAL_MAX_SIDE_PX,
    ),
    height: clamp(
      toFiniteInteger(settings.height),
      1,
      LAYOUT_VIRTUAL_MAX_SIDE_PX,
    ),
    paddingInner: Math.max(LAYOUT_RETRY_MIN_PADDING_PX, settings.paddingInner),
    paddingOuter: Math.max(LAYOUT_RETRY_MIN_PADDING_PX, settings.paddingOuter),
    round: settings.round,
  };
}

/** Checks whether retry settings changed enough to justify another compute pass. */
function areLayoutSettingsEqual(
  a: VirtualLayoutSettings,
  b: VirtualLayoutSettings,
): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    Math.abs(a.paddingInner - b.paddingInner) < 0.0001 &&
    Math.abs(a.paddingOuter - b.paddingOuter) < 0.0001 &&
    a.round === b.round
  );
}

/** Counts nodes that cannot render because their size collapsed to zero. */
function countCollapsedRects(rects: LayoutRect[]): number {
  let collapsedCount = 0;

  for (const rect of rects) {
    if (rect.width <= 0 || rect.height <= 0) {
      collapsedCount += 1;
    }
  }

  return collapsedCount;
}

/** Measures if the last node is too small compared to the first node. */
function checkLastRectTooSmall(rects: LayoutRect[]): boolean {
  if (rects.length < 2) {
    return false;
  }
  const lastRect = rects[rects.length - 1];
  const prevRect = rects[rects.length - 2];
  const lastRectAvgSide = Math.sqrt(lastRect.width * lastRect.height);
  const prevRectAvgSide = Math.sqrt(prevRect.width * prevRect.height);
  const sizeRatio = Math.max(1, lastRectAvgSide) / Math.max(1, prevRectAvgSide);

  return sizeRatio < LAYOUT_NODE_MIN_SIDE_PARENT_RATIO;
}

/** Measures hierarchy size/depth so layout can adapt for dense trees. */
function measureLayoutComplexity(root: LayoutNode): LayoutComplexity {
  const stack: Array<{ node: LayoutNode; depth: number }> = [
    { node: root, depth: 0 },
  ];

  let nodeCount = 0;
  let maxDepth = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    nodeCount += 1;
    maxDepth = Math.max(maxDepth, current.depth);

    for (const child of current.node.children) {
      stack.push({ node: child, depth: current.depth + 1 });
    }
  }

  console.log("Layout complexity:", { nodeCount, maxDepth });
  return { nodeCount, maxDepth };
}
