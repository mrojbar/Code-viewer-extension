/**
 * Applies zoom-reactive label styling and updates a fixed zoom indicator.
 */
import { SELECTORS, TOOLTIP, UI, ZOOM } from "../constants.js";
import { applyCyStyles } from "./cy.js";
import { applyDomStyles, getOrCreateElement } from "./dom.js";

interface ZoomBehaviorOptions {
  cy: any;
  onAfterZoomUpdate: () => void;
}

export function setupZoomBehavior(options: ZoomBehaviorOptions): void {
  const { cy, onAfterZoomUpdate } = options;

  let zoomFontRafId: number | null = null;

  const zoomLevelIndicator = getOrCreateElement(
    SELECTORS.ZOOM_INDICATOR,
    "div",
    (element) => {
      applyDomStyles(element, {
        position: "fixed",
        top: `${ZOOM.INDICATOR_OFFSET_TOP_PX}px`,
        left: `${ZOOM.INDICATOR_OFFSET_LEFT_PX}px`,
        padding: UI.PADDING_SMALL,
        borderRadius: UI.BORDER_RADIUS,
        fontSize: UI.FONT_SIZE_SMALL,
        fontWeight: "600",
        zIndex: UI.ZOOM_INDICATOR_Z_INDEX,
        pointerEvents: "none",
        backgroundColor:
          "var(--vscode-editorHoverWidget-background, rgba(0,0,0,0.8))",
        color: "var(--vscode-editorHoverWidget-foreground, white)",
        border: "1px solid var(--vscode-editorHoverWidget-border, #444)",
      });
    },
  );

  const updateZoomLevelDisplay = () => {
    zoomLevelIndicator.textContent = `Zoom: ${(cy.zoom() || 1).toFixed(2)}x`;
  };

  const logZoomSnapshot = () => {
    const zoomValue = cy.zoom() || 1;
    console.log("[zoom-debug]", {
      zoom: Number(zoomValue.toFixed(4)),
    });
  };

  const applyZoomAwareNodeFontSize = () => {
    const zoomFactor = cy.zoom() || 1;
    const computedFontSize = Math.max(
      ZOOM.BASE_FONT_SIZE_PX / zoomFactor,
      ZOOM.MIN_FONT_SIZE_PX,
    );
    const shouldHideLabels = zoomFactor < ZOOM.LABEL_HIDE_THRESHOLD;
    const boxNodes = cy.nodes(SELECTORS.BOX_NODE);

    applyCyStyles(boxNodes, {
      "font-size": `${computedFontSize}px`,
      "text-opacity": shouldHideLabels ? 0 : 1,
    });

    onAfterZoomUpdate();
    updateZoomLevelDisplay();
    logZoomSnapshot();
  };

  applyZoomAwareNodeFontSize();

  cy.on("zoom", () => {
    if (zoomFontRafId !== null) {
      window.cancelAnimationFrame(zoomFontRafId);
    }

    zoomFontRafId = window.requestAnimationFrame(() => {
      applyZoomAwareNodeFontSize();
      zoomFontRafId = null;
    });
  });
}

export const TOOLTIP_OFFSETS = {
  x: TOOLTIP.OFFSET_X_PX,
  y: TOOLTIP.OFFSET_Y_PX,
};
