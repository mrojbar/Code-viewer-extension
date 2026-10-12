import type { SettingsViewDatum } from "../interfaces/messages.js";

export interface SettingsRowsOptions {
  /** When true, descriptions are rendered as title tooltips on the row instead of inline text. */
  tooltip?: boolean;
}

/**
 * Builds the settings popup row markup (including the reset row)
 * from settings view data. Returns plain HTML for the popup container.
 */
export function buildSettingsRowsHtml(
  settings: readonly SettingsViewDatum[],
  options?: SettingsRowsOptions,
): string {
  const useTooltip = options?.tooltip ?? false;

  let settingsHtml = `
    <div class="settings-reset-row">
      <button class="settings-reset-btn">
        <span class="codicon codicon-refresh"></span>
        <span>Reset to default settings</span>
      </button>
    </div>
  `;

  for (const datum of settings) {
    const key = datum.key;
    const currentVal = datum.value;
    const label = datum.label;
    const desc = datum.description;
    const isConfigured = currentVal !== datum.defaultValue;
    const descAttr = desc && useTooltip ? ` title="${desc}"` : "";
    const descHtml =
      desc && !useTooltip ? `<div class="setting-description">${desc}</div>` : "";

    if (datum.valueType === "boolean") {
      settingsHtml += `
        <div class="setting-row${isConfigured ? " is-configured" : ""}" data-key="${key}" data-default="${datum.defaultValue}"${descAttr}>
          <vscode-checkbox id="${key}" ${currentVal ? "checked" : ""}>${label}</vscode-checkbox>
          ${descHtml}
        </div>
      `;
    } else if (datum.valueType === "number") {
      const min = datum.minimum !== null ? datum.minimum : 0;
      const max = datum.maximum !== null ? datum.maximum : 100;
      const step =
        Number.isInteger(min) &&
        Number.isInteger(max) &&
        Number(datum.defaultValue) % 1 === 0
          ? "1"
          : "0.01";

      settingsHtml += `
        <div class="setting-row${isConfigured ? " is-configured" : ""}" data-key="${key}" data-default="${datum.defaultValue}"${descAttr}>
          <div class="setting-label" title="${datum.configurationPath}">${label}</div>
          ${descHtml}
          <div class="setting-control-row">
            <input type="range" class="native-slider" id="${key}-slider" min="${min}" max="${max}" step="${step}" value="${currentVal}">
            <input type="number" class="native-number" id="${key}-input" value="${currentVal}" step="0.01">
          </div>
        </div>
      `;
    } else if (datum.valueType === "string") {
      if (datum.enumValues && datum.enumValues.length > 0) {
        const optionsHtml = datum.enumValues
          .map(
            (opt) =>
              `<vscode-option value="${opt}" ${opt === currentVal ? "selected" : ""}>${opt}</vscode-option>`,
          )
          .join("");
        settingsHtml += `
          <div class="setting-row${isConfigured ? " is-configured" : ""}" data-key="${key}" data-default="${datum.defaultValue}"${descAttr}>
            <div class="setting-label" title="${datum.configurationPath}">${label}</div>
            ${descHtml}
            <vscode-dropdown id="${key}">${optionsHtml}</vscode-dropdown>
          </div>
        `;
      } else {
        settingsHtml += `
          <div class="setting-row${isConfigured ? " is-configured" : ""}" data-key="${key}" data-default="${datum.defaultValue}"${descAttr}>
            <div class="setting-label" title="${datum.configurationPath}">${label}</div>
            ${descHtml}
            <vscode-text-field id="${key}" value="${currentVal}"></vscode-text-field>
          </div>
        `;
      }
    }
  }

  return settingsHtml;
}
