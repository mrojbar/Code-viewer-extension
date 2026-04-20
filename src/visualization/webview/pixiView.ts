/** Webview runtime: boot Pixi, receive data messages, and render treemap content. */
import { Application, Container, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { TreemapLayout } from "../layout/treemapLayout.js";
import { LayoutNode, LayoutRect } from "../layout/contracts";
import {
  applyViewportLabelScaleCompensation,
  renderDirectoryLabels,
  resetlabelState,
  setLabelFontSource,
  type DirectoryLabelInput,
} from "./label.js";

interface PixiElement {
  id: string;
  label: string;
  type: "directory" | "file";
  parentId?: string;
  lineCount?: number;
}

interface GraphUpdateMessage {
  type: "updateGraph";
  elements: PixiElement[];
  editorFontFamily: string;
  msdfFontFntUri?: string;
  msdfFontFamily?: string;
}

interface Box {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: number;
  backgroundAlpha: number;
  strokeColor: number;
  strokeAlpha: number;
  strokeWidth: number;
}

interface Directory extends Box {
  parentId?: string;
}

declare global {
  interface Window {
    __pixiApp?: Application;
    __pixiViewport?: Viewport;
    __pixiLastElements?: PixiElement[];
  }
}

let app: Application | undefined;
let viewport: Viewport | undefined;
let scene: Container | undefined;
let pendingElements: PixiElement[] | undefined;
let resizeDebounceTimer: number | undefined;
let renderVersion = 0;

const WORLD_PADDING_PX = 120;
const TREEMAP_WIDTH_PX = 1000;
const TREEMAP_HEIGHT_PX = 500;
const TREEMAP_INNER_PADDING_PX = 25;
const TREEMAP_OUTER_PADDING_PX = 25;
const RESIZE_DEBOUNCE_MS = 250;
const DIRECTORY_BACKGROUND_COLOR = 0xffffff;
const DIRECTORY_BACKGROUND_ALPHA = 0.12;
const DIRECTORY_STROKE_COLOR = 0xffffff;
const DIRECTORY_STROKE_ALPHA = 0.9;
const DIRECTORY_STROKE_WIDTH = 1;
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

interface RenderedDirectory {
  graphics: Graphics;
  boxData: Directory;
}

let renderedDirectoryBoxes: RenderedDirectory[] = [];

interface LayoutComplexity {
  nodeCount: number;
  maxDepth: number;
}

interface VirtualLayoutSettings {
  width: number;
  height: number;
  paddingInner: number;
  paddingOuter: number;
  round: boolean;
}

/** Keeps numeric tuning values safely inside an allowed range. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

  return { nodeCount, maxDepth };
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

/** Keeps text and strokes visually stable while the viewport zoom changes. */
function applyViewportScaleCompensation(): void {
  if (!viewport) {
    return;
  }

  const zoom = viewport.scale.x;
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return;
  }

  const compensatedScale = Math.max(
    BOX_SCALE_COMPENSATION_MIN,
    Math.min(BOX_SCALE_COMPENSATION_MAX, 1 / zoom),
  );

  for (const { graphics, boxData } of renderedDirectoryBoxes) {
    graphics.clear();
    graphics
      .rect(boxData.x, boxData.y, boxData.width, boxData.height)
      .fill({
        color: boxData.backgroundColor,
        alpha: boxData.backgroundAlpha,
      })
      .stroke({
        color: boxData.strokeColor,
        width: boxData.strokeWidth * compensatedScale, // Keeps visual width constant at 1px
        alpha: boxData.strokeAlpha,
        alignment: 1, // inner stroke to avoid bleeding
      });
  }

  applyViewportLabelScaleCompensation(viewport);
}

/** Reads current renderer dimensions for viewport screen sizing. */
function getScreenSize(): { width: number; height: number } {
  if (!app) {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  return {
    width: app.renderer.width,
    height: app.renderer.height,
  };
}

/** Computes world bounds from rendered scene content plus a small margin. */
function getWorldSizeFromContent(
  screenWidth: number,
  screenHeight: number,
): { worldWidth: number; worldHeight: number } {
  if (!scene || scene.children.length === 0) {
    return {
      worldWidth: screenWidth,
      worldHeight: screenHeight,
    };
  }

  const bounds = scene.getLocalBounds();
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

/** Updates viewport screen and world sizes after resize or content changes. */
function updateViewportSize(): void {
  if (!viewport) {
    return;
  }

  const { width, height } = getScreenSize();
  const { worldWidth, worldHeight } = getWorldSizeFromContent(width, height);
  viewport.resize(width, height, worldWidth, worldHeight);
}

/** Fits the viewport camera to the rendered scene content. */
function fitViewportToContent(): void {
  if (!viewport || !scene || scene.children.length === 0) {
    return;
  }

  const { width: screenWidth, height: screenHeight } = getScreenSize();
  if (screenWidth <= 0 || screenHeight <= 0) {
    return;
  }

  const bounds = scene.getLocalBounds();
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

  viewport.scale.set(fitScale);
  viewport.moveCenter(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
}

/** Debounces viewport resize and rebuilds layout so it refits the new canvas size. */
function scheduleResizeViewportUpdate(): void {
  if (resizeDebounceTimer !== undefined) {
    window.clearTimeout(resizeDebounceTimer);
  }

  resizeDebounceTimer = window.setTimeout(() => {
    resizeDebounceTimer = undefined;
    renderElements(pendingElements ?? [], true);
  }, RESIZE_DEBOUNCE_MS);
}

let childBoxesByParentId = new Map<string, DirectoryLabelInput[]>();

/** Builds a directory hierarchy that the shared treemap layout can consume. */
function buildLayoutTree(elements: PixiElement[]): LayoutNode | undefined {
  const directoryElements = elements.filter(
    (element) => element.type === "directory",
  );

  if (directoryElements.length === 0) {
    return undefined;
  }

  const nodesById = new Map<string, LayoutNode>();
  for (const element of directoryElements) {
    nodesById.set(element.id, {
      id: element.id,
      label: element.label,
      kind: "directory",
      weight: 1,
      parentId: element.parentId,
      children: [],
    });
  }

  const roots: LayoutNode[] = [];
  for (const element of directoryElements) {
    const node = nodesById.get(element.id);
    if (!node) {
      continue;
    }

    if (!element.parentId) {
      roots.push(node);
      continue;
    }

    const parent = nodesById.get(element.parentId);
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
    kind: "group",
    weight: 1,
    children: roots,
  };
}

/** Maps generic layout rectangles into directory render boxes. */
function mapDirectoryBoxes(rects: LayoutRect[]): Directory[] {
  return rects
    .filter((rect) => rect.kind === "directory")
    .map((rect) => ({
      id: rect.id,
      label: rect.label,
      parentId: rect.parentId,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      backgroundColor: DIRECTORY_BACKGROUND_COLOR,
      backgroundAlpha: DIRECTORY_BACKGROUND_ALPHA,
      strokeColor: DIRECTORY_STROKE_COLOR,
      strokeAlpha: DIRECTORY_STROKE_ALPHA,
      strokeWidth: DIRECTORY_STROKE_WIDTH,
    }));
}

/** Draws treemap directory boxes and labels based on shared layout output. */
function renderElements(elements: PixiElement[], fitToContent = false): void {
  void renderElementsAsync(elements, fitToContent);
}

async function renderElementsAsync(
  elements: PixiElement[],
  fitToContent: boolean,
): Promise<void> {
  pendingElements = elements;
  window.__pixiLastElements = elements;

  const currentRenderVersion = ++renderVersion;
  if (!scene) {
    return;
  }

  scene.removeChildren();
  renderedDirectoryBoxes = [];
  resetlabelState();

  const root = buildLayoutTree(elements);
  if (!root) {
    updateViewportSize();
    return;
  }

  if (currentRenderVersion !== renderVersion) {
    return;
  }

  const { width: screenWidth, height: screenHeight } = getScreenSize();
  const layoutSettings = computeVirtualLayoutSettings(
    root,
    screenWidth,
    screenHeight,
  );

  const treemapLayout = new TreemapLayout();

  const layoutRects = treemapLayout.compute(root, {
    width: layoutSettings.width,
    height: layoutSettings.height,
    paddingInner: layoutSettings.paddingInner,
    paddingOuter: layoutSettings.paddingOuter,
    round: layoutSettings.round,
    includeRoot: true,
  });

  const directoryBoxes = mapDirectoryBoxes(layoutRects);
  childBoxesByParentId = new Map<string, DirectoryLabelInput[]>();
  for (const directory of directoryBoxes) {
    if (!directory.parentId) {
      continue;
    }

    const siblings = childBoxesByParentId.get(directory.parentId);
    if (siblings) {
      siblings.push(directory);
    } else {
      childBoxesByParentId.set(directory.parentId, [directory]);
    }
  }

  for (const directory of directoryBoxes) {
    const box = new Graphics();
    // Intentionally skipped drawing here because applyViewportScaleCompensation()
    // will be called right below and draw the strokes with the correct initial scale!
    renderedDirectoryBoxes.push({ graphics: box, boxData: directory });
    scene.addChild(box);
  }

  if (!viewport) {
    return;
  }

  await renderDirectoryLabels({
    scene,
    viewport,
    directories: directoryBoxes,
    childBoxesByParentId,
    layoutOuterPaddingPx: layoutSettings.paddingOuter,
  });

  applyViewportScaleCompensation();

  updateViewportSize();

  if (fitToContent) {
    fitViewportToContent();
    applyViewportScaleCompensation();
  }
}

/** Guards extension -> webview message payload shape. */
function isGraphUpdateMessage(value: unknown): value is GraphUpdateMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<GraphUpdateMessage>;
  return (
    message.type === "updateGraph" &&
    Array.isArray(message.elements) &&
    typeof message.editorFontFamily === "string"
  );
}

/** Receives graph updates posted from the extension host. */
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isGraphUpdateMessage(event.data)) {
    return;
  }

  const nextMsdfFontFntUri =
    typeof event.data.msdfFontFntUri === "string" &&
    event.data.msdfFontFntUri.trim()
      ? event.data.msdfFontFntUri
      : undefined;
  const nextMsdfFontFamily =
    typeof event.data.msdfFontFamily === "string" &&
    event.data.msdfFontFamily.trim()
      ? event.data.msdfFontFamily
      : undefined;

  setLabelFontSource(nextMsdfFontFntUri, nextMsdfFontFamily);

  renderElements(event.data.elements, true);
});

/** Initializes Pixi app, viewport controls, and first frame state. */
async function bootstrapPixi(): Promise<void> {
  const canvas = document.getElementById(
    "pixi-canvas",
  ) as HTMLCanvasElement | null;
  if (!canvas) {
    return;
  }

  app = new Application();
  await app.init({
    canvas,
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
  });

  scene = new Container();

  const { width, height } = getScreenSize();
  const { worldWidth, worldHeight } = getWorldSizeFromContent(width, height);
  viewport = new Viewport({
    screenWidth: width,
    screenHeight: height,
    worldWidth,
    worldHeight,
    events: app.renderer.events,
  });

  // Left mouse drag + wheel zoom with smoothing + movement deceleration.
  viewport
    .drag({ mouseButtons: "left" })
    .wheel({ smooth: VIEWPORT_WHEEL_SMOOTH })
    .decelerate({
      friction: VIEWPORT_DECELERATE_FRICTION,
      minSpeed: VIEWPORT_DECELERATE_MIN_SPEED,
    });

  viewport.on("zoomed", () => {
    applyViewportScaleCompensation();
  });

  app.stage.addChild(viewport);
  viewport.addChild(scene);

  window.addEventListener("resize", () => {
    scheduleResizeViewportUpdate();
  });

  if (pendingElements) {
    renderElements(pendingElements, true);
  } else {
    renderElements([], true);
  }

  window.__pixiApp = app;
  window.__pixiViewport = viewport;
}

void bootstrapPixi();
