/**
 * Renders and manages hover tooltips plus cursor feedback near controls.
 */
import { SELECTORS, TOOLTIP, UI } from "../constants.js";
import { applyDomStyles, getOrCreateElement } from "./dom.js";

interface TooltipOptions {
  cy: any;
  cyContainer: HTMLElement | null;
}

export function setupTooltip(options: TooltipOptions): void {
  const { cy, cyContainer } = options;

  const cyTooltip = getOrCreateElement(SELECTORS.TOOLTIP, "div", (element) => {
    applyDomStyles(element, {
      position: "absolute",
      display: "none",
      backgroundColor:
        "var(--vscode-editorHoverWidget-background, rgba(0,0,0,0.8))",
      color: "var(--vscode-editorHoverWidget-foreground, white)",
      border: "1px solid var(--vscode-editorHoverWidget-border, #444)",
      padding: UI.PADDING_SMALL,
      borderRadius: UI.BORDER_RADIUS,
      fontSize: UI.FONT_SIZE_SMALL,
      zIndex: UI.TOOLTIP_Z_INDEX,
      pointerEvents: "none",
    });
  });

  let hoverTimeout: number | undefined;

  cy.on("mouseover", SELECTORS.NODE, (e: any) => {
    const node = e.target;

    if (hoverTimeout !== undefined) {
      window.clearTimeout(hoverTimeout);
    }

    hoverTimeout = window.setTimeout(() => {
      cyTooltip.innerHTML = node.data("label");
      applyDomStyles(cyTooltip, { display: "block" });
    }, TOOLTIP.SHOW_DELAY_MS);
  });

  cy.on("mousemove", SELECTORS.NODE, (e: any) => {
    const node = e.target;
    const pos = e.position;

    if (node.isParent() || node.hasClass("collapsed")) {
      const bb = node.boundingBox();
      const buttonX = bb.x1 + 12;
      const buttonY = bb.y1 + 12;

      if (
        pos.x >= buttonX &&
        pos.x <= buttonX + 16 &&
        pos.y >= buttonY &&
        pos.y <= buttonY + 16
      ) {
        if (cyContainer) {
          applyDomStyles(cyContainer, { cursor: UI.POINTER_CURSOR });
        }
      } else if (cyContainer) {
        applyDomStyles(cyContainer, { cursor: UI.DEFAULT_CURSOR });
      }
    }

    applyDomStyles(cyTooltip, {
      left: `${e.originalEvent.pageX + TOOLTIP.OFFSET_X_PX}px`,
      top: `${e.originalEvent.pageY + TOOLTIP.OFFSET_Y_PX}px`,
    });
  });

  cy.on("mouseout", SELECTORS.NODE, () => {
    if (hoverTimeout !== undefined) {
      window.clearTimeout(hoverTimeout);
    }

    applyDomStyles(cyTooltip, { display: "none" });

    if (cyContainer) {
      applyDomStyles(cyContainer, { cursor: UI.DEFAULT_CURSOR });
    }
  });
}
