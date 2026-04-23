import * as vscode from "vscode";

const DEFAULT_TERMINAL_FONT_FAMILY = "Consolas";

export function getTerminalFontFamily(): string {
  const configured = vscode.workspace
    .getConfiguration("terminal.integrated")
    .get<string>("fontFamily")
    ?.trim();

  if (configured) {
    return configured;
  }

  return DEFAULT_TERMINAL_FONT_FAMILY;
}

export function getEditorFontFamily(): string {
  const configured = vscode.workspace
    .getConfiguration("editor")
    .get<string>("fontFamily")
    ?.trim();

  if (configured) {
    return configured;
  }

  return getTerminalFontFamily();
}
