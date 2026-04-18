/**
 * Type declarations for webview messages, icon URIs, and debug globals.
 */
export interface IconUris {
  plus: string;
  minus: string;
}

export interface GraphUpdateMessage {
  type: "updateGraph";
  elements: unknown[];
}

declare global {
  interface Window {
    __cy: any | null;
    __cyDebug: Record<string, unknown>;
    cyReadyPromise: Promise<any>;
    getCy: () => any | null;
  }

  const cytoscape: (options: Record<string, unknown>) => any;
}
