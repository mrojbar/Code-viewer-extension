import { Assets, BitmapText, Container } from "pixi.js";
import { Viewport } from "pixi-viewport";

export interface DirectoryLabelInput {
  id: string;
  label: string;
  parentId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LabelPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

interface Label {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  position: LabelPosition;
  color: string;
  padding: number;
  fontSize: number;
}

interface RenderedLabel {
  textNode: BitmapText;
  labelData: Label;
  collisionBoxes: DirectoryLabelInput[];
}

export const LABEL_PADDING_PX = 5;
export const LABEL_COLOR = "#ffffff";
export const LABEL_DEFAULT_POSITION: LabelPosition = "bottom-right";
export const LABEL_FONT_SIZE_PX = 14;
export const LABEL_ZOOM_SCALE_MIN = 0;
export const LABEL_ZOOM_SCALE_MAX = 100;
export const LABEL_FIT_EPSILON_PX = 25;
export const LABEL_FIT_EPSILON_MIN_PX = 0.01;
export const LABEL_OUTER_PADDING_FALLBACK_PX = 25;

let currentMsdfFontFntUri: string | undefined;
let currentMsdfFontFamily: string | undefined;
let activeBitmapFontUri: string | undefined;
let activeBitmapFontFamily: string | undefined;
let currentLayoutOuterPaddingPx = LABEL_OUTER_PADDING_FALLBACK_PX;
let renderedBitmapLabels: RenderedLabel[] = [];

const measuredLabelWidthCache = new Map<string, number>();

/** Updates font source and clears active font/cache if source changed. */
export function setLabelFontSource(
  nextMsdfFontFntUri?: string,
  nextMsdfFontFamily?: string,
): void {
  const fontSourceChanged =
    currentMsdfFontFntUri !== nextMsdfFontFntUri ||
    currentMsdfFontFamily !== nextMsdfFontFamily;

  currentMsdfFontFntUri = nextMsdfFontFntUri;
  currentMsdfFontFamily = nextMsdfFontFamily;

  if (fontSourceChanged) {
    activeBitmapFontFamily = undefined;
    activeBitmapFontUri = undefined;
    clearLabelWidthCache();
  }
}

/** Clears label state between full scene rerenders. */
export function resetlabelState(): void {
  renderedBitmapLabels = [];
  currentLayoutOuterPaddingPx = LABEL_OUTER_PADDING_FALLBACK_PX;
}

/** Keeps label text visually stable while viewport zoom changes. */
export function applyViewportLabelScaleCompensation(viewport: Viewport): void {
  if (renderedBitmapLabels.length === 0) {
    return;
  }

  const zoom = viewport.scale.x;
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return;
  }

  const compensatedScale = Math.max(
    LABEL_ZOOM_SCALE_MIN,
    Math.min(LABEL_ZOOM_SCALE_MAX, 1 / zoom),
  );

  for (const { textNode, labelData, collisionBoxes } of renderedBitmapLabels) {
    textNode.scale.set(compensatedScale);

    const dynamicPadding = labelData.padding * compensatedScale;
    const fitEpsilon = Math.max(
      LABEL_FIT_EPSILON_MIN_PX,
      LABEL_FIT_EPSILON_PX * compensatedScale,
    );
    const maxWidth = labelData.width - dynamicPadding * 2;
    const maxHeight = Math.min(
      labelData.height - dynamicPadding * 2,
      currentLayoutOuterPaddingPx - dynamicPadding,
    );

    if (maxWidth <= 0 || maxHeight <= 0) {
      textNode.visible = false;
      continue;
    }

    let constrainedMaxWidth = maxWidth;
    let effectiveMaxWidth = constrainedMaxWidth / (compensatedScale || 1);
    let newText = fitLabelText(
      labelData.text,
      effectiveMaxWidth,
      labelData.fontSize,
    );

    textNode.text = newText;
    positionBitmapLabel(textNode, labelData, dynamicPadding);

    const collisionMaxWidth = computeCollisionConstrainedWidth(
      labelData,
      collisionBoxes,
      textNode.height,
      dynamicPadding,
    );

    if (Number.isFinite(collisionMaxWidth)) {
      constrainedMaxWidth = Math.max(
        0,
        Math.min(constrainedMaxWidth, collisionMaxWidth),
      );
      effectiveMaxWidth = constrainedMaxWidth / (compensatedScale || 1);
      newText = fitLabelText(
        labelData.text,
        effectiveMaxWidth,
        labelData.fontSize,
      );
      textNode.text = newText;
      positionBitmapLabel(textNode, labelData, dynamicPadding);
    }

    if (
      !newText ||
      textNode.width > constrainedMaxWidth + fitEpsilon ||
      textNode.height > maxHeight + fitEpsilon
    ) {
      textNode.visible = false;
    } else {
      textNode.visible = true;
    }
  }
}

/** Renders labels for a directory set and immediately applies current zoom compensation. */
export async function renderDirectoryLabels(options: {
  scene: Container;
  viewport: Viewport;
  directories: DirectoryLabelInput[];
  childBoxesByParentId: Map<string, DirectoryLabelInput[]>;
  layoutOuterPaddingPx: number;
}): Promise<void> {
  const {
    scene,
    viewport,
    directories,
    childBoxesByParentId,
    layoutOuterPaddingPx,
  } = options;

  renderedBitmapLabels = [];
  currentLayoutOuterPaddingPx =
    layoutOuterPaddingPx > 0
      ? layoutOuterPaddingPx
      : LABEL_OUTER_PADDING_FALLBACK_PX;

  const hasBitmapFont = await ensureBitmapFontLoaded();
  if (!hasBitmapFont) {
    return;
  }

  const labels = mapDirectoryLabels(directories);

  for (const label of labels) {
    if (label.width <= 0 || label.height <= 0) {
      continue;
    }

    const bitmapLabel = new BitmapText({
      text: "",
      style: {
        fontFamily: activeBitmapFontFamily,
        fontSize: label.fontSize,
        fill: label.color,
      },
    });

    const collisionBoxes = childBoxesByParentId.get(label.id) ?? [];
    renderedBitmapLabels.push({
      textNode: bitmapLabel,
      labelData: label,
      collisionBoxes,
    });
    scene.addChild(bitmapLabel);
  }

  applyViewportLabelScaleCompensation(viewport);
}

function clearLabelWidthCache(): void {
  measuredLabelWidthCache.clear();
}

/** Loads the current MSDF bitmap font atlas if needed. */
async function ensureBitmapFontLoaded(): Promise<boolean> {
  if (!currentMsdfFontFntUri || !currentMsdfFontFamily) {
    activeBitmapFontFamily = undefined;
    activeBitmapFontUri = undefined;
    return false;
  }

  if (
    activeBitmapFontFamily === currentMsdfFontFamily &&
    activeBitmapFontUri === currentMsdfFontFntUri
  ) {
    return true;
  }

  try {
    await Assets.load(currentMsdfFontFntUri);

    const probe = new BitmapText({
      text: "A",
      style: {
        fontFamily: currentMsdfFontFamily,
        fontSize: LABEL_FONT_SIZE_PX,
      },
    });
    probe.destroy();

    activeBitmapFontFamily = currentMsdfFontFamily;
    activeBitmapFontUri = currentMsdfFontFntUri;
    clearLabelWidthCache();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to load MSDF font atlas: ${message}`);
    activeBitmapFontFamily = undefined;
    activeBitmapFontUri = undefined;
    return false;
  }
}

/** Measures bitmap text width using the active MSDF font and caches results. */
function measureLabelWidth(text: string, fontSize: number): number {
  if (!activeBitmapFontFamily) {
    return Number.POSITIVE_INFINITY;
  }

  const cacheKey = `${activeBitmapFontFamily}|${fontSize}|${text}`;
  const cached = measuredLabelWidthCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const measurement = new BitmapText({
    text,
    style: {
      fontFamily: activeBitmapFontFamily,
      fontSize,
    },
  });

  const width = measurement.width;
  measurement.destroy();
  measuredLabelWidthCache.set(cacheKey, width);
  return width;
}

/** Truncates label text with ellipsis so it fits the available width. */
function fitLabelText(
  text: string,
  maxWidth: number,
  fontSize: number,
): string {
  if (maxWidth <= 0) {
    return "";
  }

  if (measureLabelWidth(text, fontSize) <= maxWidth) {
    return text;
  }

  const ellipsis = "...";
  if (measureLabelWidth(ellipsis, fontSize) > maxWidth) {
    return "";
  }

  let left = 0;
  let right = text.length;
  let best = "";

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const candidate = `${text.slice(0, middle)}${ellipsis}`;
    if (measureLabelWidth(candidate, fontSize) <= maxWidth) {
      best = candidate;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }

  return best;
}

/** Converts directory rectangles into label descriptors for bitmap rendering. */
function mapDirectoryLabels(directories: DirectoryLabelInput[]): Label[] {
  return directories.map((directory) => ({
    id: directory.id,
    text: directory.label,
    x: directory.x,
    y: directory.y,
    width: directory.width,
    height: directory.height,
    position: LABEL_DEFAULT_POSITION,
    color: LABEL_COLOR,
    padding: LABEL_PADDING_PX,
    fontSize: LABEL_FONT_SIZE_PX,
  }));
}

/** Places a label inside its box according to the selected anchor position. */
function positionBitmapLabel(
  target: BitmapText,
  label: Label,
  paddingOverride?: number,
): void {
  const padding = paddingOverride ?? label.padding;
  const left = label.x + padding;
  const right = label.x + label.width - padding;
  const top = label.y + padding;
  const middleX = label.x + label.width / 2;
  const middleY = label.y + label.height / 2;
  const bottom = label.y + label.height - padding;

  const textWidth = target.width;
  const textHeight = target.height;

  switch (label.position) {
    case "top-left":
      target.x = left;
      target.y = top;
      return;
    case "top-center":
      target.x = middleX - textWidth / 2;
      target.y = top;
      return;
    case "top-right":
      target.x = right - textWidth;
      target.y = top;
      return;
    case "middle-left":
      target.x = left;
      target.y = middleY - textHeight / 2;
      return;
    case "middle-center":
      target.x = middleX - textWidth / 2;
      target.y = middleY - textHeight / 2;
      return;
    case "middle-right":
      target.x = right - textWidth;
      target.y = middleY - textHeight / 2;
      return;
    case "bottom-left":
      target.x = left;
      target.y = bottom - textHeight;
      return;
    case "bottom-center":
      target.x = middleX - textWidth / 2;
      target.y = bottom - textHeight;
      return;
    case "bottom-right":
      target.x = right - textWidth;
      target.y = bottom - textHeight;
  }
}

/** Computes maximum usable label width after accounting for nested child boxes. */
function computeCollisionConstrainedWidth(
  label: Label,
  childBoxes: DirectoryLabelInput[],
  textHeight: number,
  padding: number,
): number {
  if (childBoxes.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const left = label.x + padding;
  const right = label.x + label.width - padding;
  if (right <= left) {
    return 0;
  }

  const rowHeight = Math.max(0, textHeight);
  let rowTop = label.y + padding;
  let rowBottom = rowTop + rowHeight;

  if (label.position.startsWith("middle-")) {
    const centerY = label.y + label.height / 2;
    rowTop = centerY - rowHeight / 2;
    rowBottom = centerY + rowHeight / 2;
  } else if (label.position.startsWith("bottom-")) {
    rowBottom = label.y + label.height - padding;
    rowTop = rowBottom - rowHeight;
  }

  type Interval = { left: number; right: number };
  const obstacles: Interval[] = [];
  for (const child of childBoxes) {
    const childTop = child.y;
    const childBottom = child.y + child.height;
    if (rowBottom <= childTop || rowTop >= childBottom) {
      continue;
    }

    const obstacleLeft = Math.max(left, child.x - padding);
    const obstacleRight = Math.min(right, child.x + child.width + padding);
    if (obstacleRight > obstacleLeft) {
      obstacles.push({ left: obstacleLeft, right: obstacleRight });
    }
  }

  if (obstacles.length === 0) {
    return right - left;
  }

  if (label.position.endsWith("-left")) {
    let limit = right;
    for (const obstacle of obstacles) {
      if (obstacle.left >= left) {
        limit = Math.min(limit, obstacle.left);
      }
    }
    return Math.max(0, limit - left);
  }

  if (label.position.endsWith("-right")) {
    let limit = left;
    for (const obstacle of obstacles) {
      if (obstacle.right <= right) {
        limit = Math.max(limit, obstacle.right);
      }
    }
    return Math.max(0, right - limit);
  }

  const centerX = label.x + label.width / 2;
  let leftLimit = left;
  let rightLimit = right;
  for (const obstacle of obstacles) {
    if (obstacle.right <= centerX) {
      leftLimit = Math.max(leftLimit, obstacle.right);
      continue;
    }
    if (obstacle.left >= centerX) {
      rightLimit = Math.min(rightLimit, obstacle.left);
      continue;
    }
    return 0;
  }

  const halfWidth = Math.min(centerX - leftLimit, rightLimit - centerX);
  return Math.max(0, halfWidth * 2);
}
