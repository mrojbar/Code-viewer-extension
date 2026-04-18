/**
 * Small Cytoscape helper utilities used by other webview modules.
 */
export function applyCyStyles(
  elements: any,
  styles: Record<string, unknown>,
): void {
  elements.style(styles);
}
