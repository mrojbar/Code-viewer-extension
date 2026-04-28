import { Container, Text } from "pixi.js";
import { Viewport } from "pixi-viewport";

export interface BoxLabelInput {
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
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

interface Label {
  id: string;
  parentId?: string;
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
  textNode: Text;
  labelData: Label;
  collisionBoxes: BoxLabelInput[];
}

export interface LabelRenderRef {
  textNode: Text;
  labelData: BoxLabelInput;
  collisionBoxes: BoxLabelInput[];
}

const LABEL_PADDING_PX = 5;
const LABEL_COLOR = "#ffffff";
const LABEL_DEFAULT_POSITION: LabelPosition = "bottom-right";
const LABEL_FONT_SIZE_PX = 12;
const LABEL_ZOOM_SCALE_MIN = 0;
const LABEL_ZOOM_SCALE_MAX = 100;
const LABEL_FIT_EPSILON_PX = 25;
const LABEL_FIT_EPSILON_MIN_PX = 0.01;
const LABEL_HEIGHT_FIT_EPSILON_PX = 0.01;
const DEFAULT_LABEL_FONT_FAMILY = "Consolas";
export class TreemapLabelRenderer {
  private currentLabelFontFamily = DEFAULT_LABEL_FONT_FAMILY;
  private renderedLabels: RenderedLabel[] = [];
  private readonly measuredLabelWidthCache = new Map<string, number>();

  /** Updates active raster font family used by Pixi Text labels. */
  public setFontFamily(nextFontFamily?: string): void {
    const normalized = nextFontFamily?.trim() || DEFAULT_LABEL_FONT_FAMILY;
    if (normalized === this.currentLabelFontFamily) {
      return;
    }

    this.currentLabelFontFamily = normalized;
    this.clearLabelWidthCache();
  }

  /** Clears label state between full scene rerenders. */
  public resetState(): void {
    this.renderedLabels = [];
  }

  /** Exposes current label internals so caller can inspect bound pixi objects. */
  public getRenderRefs(): ReadonlyArray<LabelRenderRef> {
    return this.renderedLabels.map(
      ({ textNode, labelData, collisionBoxes }) => ({
        textNode,
        labelData: {
          id: labelData.id,
          label: labelData.text,
          parentId: labelData.parentId,
          x: labelData.x,
          y: labelData.y,
          width: labelData.width,
          height: labelData.height,
        },
        collisionBoxes,
      }),
    );
  }

  /** Keeps label text visually stable while viewport zoom changes. */
  public applyViewportScaleCompensation(viewport: Viewport): void {
    if (this.renderedLabels.length === 0) {
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

    for (const { textNode, labelData, collisionBoxes } of this.renderedLabels) {
      textNode.scale.set(compensatedScale);

      const dynamicPadding = labelData.padding * compensatedScale;
      const fitEpsilon = Math.max(
        LABEL_FIT_EPSILON_MIN_PX,
        LABEL_FIT_EPSILON_PX * compensatedScale,
      );
      const heightFitEpsilon = LABEL_HEIGHT_FIT_EPSILON_PX;
      const maxWidth = labelData.width - dynamicPadding * 2;
      const maxHeight = labelData.height - dynamicPadding * 2;

      if (maxWidth <= 0 || maxHeight <= 0) {
        textNode.visible = false;
        continue;
      }

      let constrainedMaxWidth = maxWidth;
      let effectiveMaxWidth = constrainedMaxWidth / (compensatedScale || 1);
      let newText = this.fitLabelText(
        labelData.text,
        effectiveMaxWidth,
        labelData.fontSize,
      );

      textNode.text = newText;
      positionTextLabel(textNode, labelData, dynamicPadding);

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
        newText = this.fitLabelText(
          labelData.text,
          effectiveMaxWidth,
          labelData.fontSize,
        );
        textNode.text = newText;
        positionTextLabel(textNode, labelData, dynamicPadding);
      }

      if (
        !newText ||
        textNode.width > constrainedMaxWidth + fitEpsilon ||
        textNode.height > maxHeight + heightFitEpsilon
      ) {
        textNode.visible = false;
      } else {
        textNode.visible = true;
      }
    }
  }

  /** Renders labels for a directory set and immediately applies current zoom compensation. */
  public async renderLabels(options: {
    scene: Container;
    viewport: Viewport;
    directories: BoxLabelInput[];
    childBoxesByParentId: Map<string, BoxLabelInput[]>;
  }): Promise<void> {
    const { scene, viewport, directories, childBoxesByParentId } = options;

    this.renderedLabels = [];

    const labels = mapDirectoryLabels(directories);

    for (const label of labels) {
      if (label.width <= 0 || label.height <= 0) {
        continue;
      }

      const textLabel = new Text({
        text: "",
        style: {
          fontFamily: this.currentLabelFontFamily,
          fontSize: label.fontSize,
          fill: label.color,
        },
      });

      const collisionBoxes = childBoxesByParentId.get(label.id) ?? [];
      this.renderedLabels.push({
        textNode: textLabel,
        labelData: label,
        collisionBoxes,
      });
      scene.addChild(textLabel);
    }

    this.applyViewportScaleCompensation(viewport);
  }

  /** Measures raster text width for the current font and caches results. */
  private measureLabelWidth(text: string, fontSize: number): number {
    const cacheKey = `${this.currentLabelFontFamily}|${fontSize}|${text}`;
    const cached = this.measuredLabelWidthCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const measurement = new Text({
      text,
      style: {
        fontFamily: this.currentLabelFontFamily,
        fontSize,
      },
    });

    const width = measurement.width;
    measurement.destroy();
    this.measuredLabelWidthCache.set(cacheKey, width);
    return width;
  }

  /** Truncates label text with ellipsis so it fits the available width. */
  private fitLabelText(
    text: string,
    maxWidth: number,
    fontSize: number,
  ): string {
    if (maxWidth <= 0) {
      return "";
    }

    if (this.measureLabelWidth(text, fontSize) <= maxWidth) {
      return text;
    }

    const ellipsis = "...";
    if (this.measureLabelWidth(ellipsis, fontSize) > maxWidth) {
      return "";
    }

    let left = 0;
    let right = text.length;
    let best = "";

    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      const candidate = `${text.slice(0, middle)}${ellipsis}`;
      if (this.measureLabelWidth(candidate, fontSize) <= maxWidth) {
        best = candidate;
        left = middle + 1;
      } else {
        right = middle - 1;
      }
    }

    return best;
  }

  private clearLabelWidthCache(): void {
    this.measuredLabelWidthCache.clear();
  }
}

/** Converts directory rectangles into label descriptors for raster text rendering. */
function mapDirectoryLabels(directories: BoxLabelInput[]): Label[] {
  return directories.map((directory) => ({
    id: directory.id,
    parentId: directory.parentId,
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
function positionTextLabel(
  target: Text,
  label: Label,
  paddingOverride?: number,
): void {
  const padding = paddingOverride ?? label.padding;
  const left = label.x + padding;
  const right = label.x + label.width - padding;
  const top = label.y + padding;
  const middleX = label.x + label.width / 2;
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
  childBoxes: BoxLabelInput[],
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
