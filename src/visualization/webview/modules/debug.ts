/**
 * Exposes debug globals and readiness helpers for webview devtools.
 */
import { DEBUG_MESSAGES } from "../constants.js";

interface DebugController {
  markDestroyed: (reason: string) => void;
  markReady: (cy: any, enabled: boolean, flagValue?: string) => void;
}

export function setupDebugGlobals(): DebugController {
  let resolveCyReady: ((value: any) => void) | undefined;

  const resetReadyPromise = () => {
    window.cyReadyPromise = new Promise((resolve) => {
      resolveCyReady = resolve;
    });
  };

  window.__cy = null;
  window.__cyDebug = {
    ready: false,
    reason: "waiting for updateGraph message",
  };

  resetReadyPromise();

  window.getCy = function () {
    if (!window.__cy) {
      console.warn(DEBUG_MESSAGES.NOT_READY);
      return null;
    }

    return window.__cy;
  };

  return {
    markDestroyed: (reason: string) => {
      window.__cy = null;
      window.__cyDebug = {
        ready: false,
        reason,
      };
      resetReadyPromise();
    },
    markReady: (cy: any, enabled: boolean, flagValue?: string) => {
      window.__cy = cy;
      window.__cyDebug = {
        ready: true,
        enabled,
        flagValue,
        nodeCount: cy.nodes().length,
        edgeCount: cy.edges().length,
      };

      if (resolveCyReady) {
        resolveCyReady(cy);
        resolveCyReady = undefined;
      }

      if (enabled) {
        console.info(DEBUG_MESSAGES.READY);
      } else {
        console.info(DEBUG_MESSAGES.READY_WITHOUT_FLAG);
      }
    },
  };
}
