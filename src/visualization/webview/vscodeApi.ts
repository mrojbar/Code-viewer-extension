/** Minimal VS Code webview API surface used by this runtime. */
export interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare const acquireVsCodeApi: (() => VsCodeApi) | undefined;

export const vscodeApi: VsCodeApi | undefined =
  typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;
