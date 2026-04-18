/**
 * Main webview entrypoint that creates Cytoscape and wires all behavior modules.
 */
import { DEBUG_MESSAGES, MESSAGE_TYPES, SELECTORS } from "./constants.js";
import type { GraphUpdateMessage } from "./types.js";
import {
  getDebugFlagValueFromBody,
  getIconUrisFromBody,
} from "./modules/assets.js";
import { setupCollapseExpand } from "./modules/collapseExpand.js";
import { setupDebugGlobals } from "./modules/debug.js";
import {
  assignOrderIndexes,
  createApplyElkLayout,
  createRelayoutAfterHierarchyChange,
} from "./modules/layout.js";
import { stabilizeBoxLabels } from "./modules/labels.js";
import { createGraphStyles } from "./modules/styles.js";
import { setupTooltip } from "./modules/tooltip.js";
import { setupZoomBehavior } from "./modules/zoom.js";

(function () {
  let cy: any;
  let disposeResizeRelayout: (() => void) | undefined;

  const debugController = setupDebugGlobals();

  window.addEventListener(
    "message",
    (event: MessageEvent<GraphUpdateMessage>) => {
      const message = event.data;

      if (!message || message.type !== MESSAGE_TYPES.UPDATE_GRAPH) {
        return;
      }

      if (cy) {
        disposeResizeRelayout?.();
        disposeResizeRelayout = undefined;
        cy.destroy();
        debugController.markDestroyed(
          "destroyed previous instance before update",
        );
      }

      const cyContainer = document.getElementById(SELECTORS.CY_CONTAINER);
      if (!cyContainer) {
        console.error(DEBUG_MESSAGES.MISSING_CONTAINER);
        return;
      }

      const iconUris = getIconUrisFromBody();

      cy = cytoscape({
        container: cyContainer,
        elements: message.elements,
        style: createGraphStyles(iconUris),
        layout: {
          name: "preset",
        },
      });

      const debugFlagValue = getDebugFlagValueFromBody();
      const isCytoscapeDebugEnabled = debugFlagValue === "true";

      debugController.markReady(cy, isCytoscapeDebugEnabled, debugFlagValue);

      const stabilizeLabels = () => {
        stabilizeBoxLabels(cy);
      };

      setupZoomBehavior({
        cy,
        onAfterZoomUpdate: stabilizeLabels,
      });

      assignOrderIndexes(cy);

      const applyElkLayout = createApplyElkLayout(cy, stabilizeLabels);
      const relayoutAfterHierarchyChange =
        createRelayoutAfterHierarchyChange(applyElkLayout);

      let resizeDebounceHandle: number | undefined;
      const scheduleRelayoutForResize = () => {
        if (resizeDebounceHandle !== undefined) {
          window.clearTimeout(resizeDebounceHandle);
        }

        resizeDebounceHandle = window.setTimeout(() => {
          if (!cy || cy.destroyed()) {
            return;
          }

          cy.resize();
          relayoutAfterHierarchyChange();
        }, 120);
      };

      const onWindowResize = () => {
        scheduleRelayoutForResize();
      };

      window.addEventListener("resize", onWindowResize);

      let resizeObserver: ResizeObserver | undefined;
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          scheduleRelayoutForResize();
        });
        resizeObserver.observe(cyContainer);
      }

      disposeResizeRelayout = () => {
        window.removeEventListener("resize", onWindowResize);
        resizeObserver?.disconnect();
        resizeObserver = undefined;

        if (resizeDebounceHandle !== undefined) {
          window.clearTimeout(resizeDebounceHandle);
          resizeDebounceHandle = undefined;
        }
      };

      applyElkLayout();

      setupCollapseExpand({
        cy,
        relayoutAfterHierarchyChange,
      });

      setupTooltip({
        cy,
        cyContainer,
      });
    },
  );
})();
