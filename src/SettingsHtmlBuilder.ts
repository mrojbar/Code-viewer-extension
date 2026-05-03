import * as fs from "fs";
import * as vscode from "vscode";
import { ExtensionSettings, SettingsKey } from "./settings";
import {
  GENERATED_SETTINGS_SCHEMA,
  GeneratedSetting,
} from "./generated/settingsSchema.js";

export interface SettingsControlsOptions {
  /** When true, descriptions are rendered as title tooltips on the row instead of inline text. */
  tooltip?: boolean;
}

export function buildSettingsControlsHtml(
  settings: ExtensionSettings,
  options?: SettingsControlsOptions,
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

  for (const [key, rawSchema] of Object.entries(GENERATED_SETTINGS_SCHEMA)) {
    const schema = rawSchema as GeneratedSetting;
    const currentVal = settings.get(key as SettingsKey);
    const label = formatCamelCase(key);
    const desc = schema.description;
    const isConfigured = currentVal !== schema.defaultValue;
    const descAttr = desc && useTooltip ? ` title="${desc}"` : "";
    const descHtml = desc && !useTooltip ? `<div class="setting-description">${desc}</div>` : "";

    if (schema.valueType === "boolean") {
      settingsHtml += `
        <div class="setting-row${isConfigured ? " is-configured" : ""}" data-key="${key}" data-default="${schema.defaultValue}"${descAttr}>
          <vscode-checkbox id="${key}" ${currentVal ? "checked" : ""}>${label}</vscode-checkbox>
          ${descHtml}
        </div>
      `;
    } else if (schema.valueType === "number") {
      const min = schema.minimum !== null ? schema.minimum : 0;
      const max = schema.maximum !== null ? schema.maximum : 100;
      const step =
        Number.isInteger(min) &&
        Number.isInteger(max) &&
        Number(schema.defaultValue) % 1 === 0
          ? "1"
          : "0.01";

      settingsHtml += `
        <div class="setting-row${isConfigured ? " is-configured" : ""}" data-key="${key}" data-default="${schema.defaultValue}"${descAttr}>
          <div class="setting-label" title="${schema.configurationPath}">${label}</div>
          ${descHtml}
          <div class="setting-control-row">
            <input type="range" class="native-slider" id="${key}-slider" min="${min}" max="${max}" step="${step}" value="${currentVal}">
            <input type="number" class="native-number" id="${key}-input" value="${currentVal}" step="0.01">
          </div>
        </div>
      `;
    } else if (schema.valueType === "string") {
      settingsHtml += `
        <div class="setting-row${isConfigured ? " is-configured" : ""}" data-key="${key}" data-default="${schema.defaultValue}"${descAttr}>
          <div class="setting-label" title="${schema.configurationPath}">${label}</div>
          ${descHtml}
          <vscode-text-field id="${key}" value="${currentVal}"></vscode-text-field>
        </div>
      `;
    }
  }

  return settingsHtml;
}

export function buildSettingsHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  settings: ExtensionSettings,
): string {
  const toolkitUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      extensionUri,
      "node_modules",
      "@vscode",
      "webview-ui-toolkit",
      "dist",
      "toolkit.min.js",
    ),
  );

  const codiconUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      extensionUri,
      "node_modules",
      "@vscode",
      "codicons",
      "dist",
      "codicon.css",
    ),
  );

  const settingsHtml = buildSettingsControlsHtml(settings);

  const nonce = getNonce();

  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "settings", "settings.css"),
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "runtime", "webview", "settingsPanel.js"),
  );

  const htmlTemplatePath = vscode.Uri.joinPath(
    extensionUri,
    "media",
    "settings",
    "settings.html",
  );
  const htmlTemplate = fs.readFileSync(htmlTemplatePath.fsPath, "utf8");
  return htmlTemplate
    .replace("${toolkitUri}", toolkitUri.toString())
    .replace("${codiconUri}", codiconUri.toString())
    .replace("${styleUri}", styleUri.toString())
    .replace("${nonce}", nonce)
    .replace("${scriptUri}", scriptUri.toString())
    .replace("${settingsHtml}", settingsHtml);
}

function formatCamelCase(text: string): string {
  const result = text.replace(/([A-Z])/g, " $1");
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
