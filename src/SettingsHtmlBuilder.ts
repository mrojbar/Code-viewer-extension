import * as fs from "fs";
import * as vscode from "vscode";

/**
 * Builds the settings sidebar webview shell (template + resources).
 * Setting rows are rendered webview-side from settings view data.
 */
export function buildSettingsHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
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
    .replace("${scriptUri}", scriptUri.toString());
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
