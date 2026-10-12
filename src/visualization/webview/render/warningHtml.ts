import type { LayoutDiagnostics } from "../../interfaces/messages.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Builds HTML content for the warning diagnostics popup.
 * Returns an empty string when there are no problems.
 */
export function buildWarningHtml(
  diagnostics: LayoutDiagnostics | undefined,
): string {
  const hasProblems =
    diagnostics &&
    (diagnostics.collapsedCount > 0 || diagnostics.extremeCount > 0);

  if (!hasProblems) {
    return "";
  }

  let html =
    "<h3>Graph tree could not be validated with the current settings.</h3>";

  if (diagnostics.collapsedCount > 0) {
    html += `<div><strong>Collapsed nodes: ${diagnostics.collapsedCount}</strong></div><ol>`;
    for (const sample of diagnostics.collapsedSamples) {
      html += `<li>${escapeHtml(sample.path)} (${sample.w.toFixed(1)} x ${sample.h.toFixed(1)})</li>`;
    }
    html += "</ol>";
  }

  if (diagnostics.extremeCount > 0) {
    html += `<div><strong>Extreme aspect ratio nodes: ${diagnostics.extremeCount}</strong></div><ol>`;
    for (const sample of diagnostics.extremeSamples) {
      html += `<li>${escapeHtml(sample.path)} (${sample.w.toFixed(1)} x ${sample.h.toFixed(1)})</li>`;
    }
    html += "</ol>";
  }

  return html;
}
