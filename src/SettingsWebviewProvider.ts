import * as vscode from "vscode";
import { ExtensionSettings, SettingsKey } from "./settings";
import {
  GENERATED_SETTINGS_SCHEMA,
  GeneratedSetting,
} from "./generated/settingsSchema.js";

export class SettingsWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private settings: ExtensionSettings;
  private disposable?: vscode.Disposable;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.settings = ExtensionSettings.getInstance();

    this.disposable = this.settings.onDidChange(() => {
      // Re-trigger a full re-render on settings changes
      if (this._view) {
        this.updateWebview();
      }
    });
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      if (data.command === "updateSetting") {
        const schema =
          GENERATED_SETTINGS_SCHEMA[
            data.key as keyof typeof GENERATED_SETTINGS_SCHEMA
          ];
        if (schema) {
          await vscode.workspace
            .getConfiguration()
            .update(
              schema.configurationPath,
              data.value,
              vscode.ConfigurationTarget.Global,
            );
        }
      }
    });

    this.updateWebview();
  }

  private updateWebview() {
    if (!this._view) {
      return;
    }

    const webview = this._view.webview;
    const toolkitUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "node_modules",
        "@vscode",
        "webview-ui-toolkit",
        "dist",
        "toolkit.min.js",
      ),
    );

    // Generate the HTML for settings
    let settingsHtml = "";

    for (const [key, rawSchema] of Object.entries(GENERATED_SETTINGS_SCHEMA)) {
      const schema = rawSchema as GeneratedSetting;
      const currentVal = this.settings.get(key as SettingsKey);
      const label = this.formatCamelCase(key);
      const desc = schema.configurationPath;

      if (schema.valueType === "boolean") {
        settingsHtml += `
          <div class="setting-row">
            <vscode-checkbox id="${key}" ${currentVal ? "checked" : ""} onchange="updateSetting('${key}', this.checked, 'boolean')">${label}</vscode-checkbox>
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
          <div class="setting-row">
            <div class="setting-label" title="${desc}">${label}</div>
            <div class="setting-control-row">
              <input type="range" class="native-slider" id="${key}-slider" min="${min}" max="${max}" step="${step}" value="${currentVal}" oninput="syncSliderAndInput('${key}')" onchange="commitNumber('${key}')">
              <vscode-text-field id="${key}-input" value="${currentVal}" type="number" onchange="syncInputAndSlider('${key}')"></vscode-text-field>
            </div>
          </div>
        `;
      } else if (schema.valueType === "string") {
        settingsHtml += `
          <div class="setting-row">
            <div class="setting-label" title="${desc}">${label}</div>
            <vscode-text-field id="${key}" value="${currentVal}" onchange="updateSetting('${key}', this.value, 'string')"></vscode-text-field>
          </div>
        `;
      }
    }

    const nonce = this.getNonce();

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "media",
        "settings",
        "settings.css",
      ),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "media",
        "settings",
        "settings.js",
      ),
    );

    const htmlTemplatePath = vscode.Uri.joinPath(
      this._extensionUri,
      "media",
      "settings",
      "settings.html",
    );
    try {
      const fs = require("fs");
      const htmlTemplate = fs.readFileSync(htmlTemplatePath.fsPath, "utf8");
      this._view.webview.html = htmlTemplate
        .replace("${toolkitUri}", toolkitUri.toString())
        .replace("${styleUri}", styleUri.toString())
        .replace("${nonce}", nonce)
        .replace("${scriptUri}", scriptUri.toString())
        .replace("${settingsHtml}", settingsHtml);
    } catch (e) {
      console.error(e);
    }
  }

  private formatCamelCase(text: string): string {
    const result = text.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  private getNonce() {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  dispose() {
    this.disposable?.dispose();
  }
}
