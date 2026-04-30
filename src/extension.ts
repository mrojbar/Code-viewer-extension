import * as vscode from "vscode";
import * as path from "path";
import { RuntimeManager } from "./RuntimeManager";
import { SidebarProvider } from "./SidebarProvider";
import { PixiVisualizer } from "./visualization/PixiVisualizer";
import { CallGraphData } from "./visualization/interfaces/callGraph";
import { getEditorFontFamily } from "./utils/font";
import { ExtensionSettings } from "./settings";
import { ExtensionConfig } from "./visualization/interfaces/messages";
import { SettingsWebviewProvider } from "./SettingsWebviewProvider";

export async function activate(context: vscode.ExtensionContext) {
  const runtimeManager = new RuntimeManager(context);
  context.subscriptions.push(runtimeManager);

  const startRuntimeCommand = vscode.commands.registerCommand(
    "testextension.startPythonRuntime",
    async () => {
      try {
        await runtimeManager.start();
        vscode.window.showInformationMessage("Python runtime started.");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown runtime start error.";
        vscode.window.showErrorMessage(`Failed to start runtime: ${message}`);
      }
    },
  );

  const stopRuntimeCommand = vscode.commands.registerCommand(
    "testextension.stopPythonRuntime",
    () => {
      runtimeManager.stop();
      vscode.window.showInformationMessage("Python runtime stop requested.");
    },
  );

  const runtimeStatusCommand = vscode.commands.registerCommand(
    "testextension.pythonRuntimeStatus",
    () => {
      const status = runtimeManager.isRunning() ? "running" : "stopped";
      vscode.window.showInformationMessage(`Python runtime is ${status}.`);
    },
  );

  void runtimeManager.start().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown runtime start error.";
    console.error(`Failed to start runtime on activation: ${message}`);
    vscode.window.showWarningMessage(
      `Runtime not started on activation: ${message}`,
    );
  });

  /**
   * Test: render graph
   */
  const pixiVis = new PixiVisualizer();
  const editorFontFamily = getEditorFontFamily();
  const extensionSettings = ExtensionSettings.getInstance();
  extensionSettings.initialize(context);

  const sidebarProvider = SidebarProvider.create(
    context.extensionUri,
    pixiVis,
    [context.globalStorageUri],
  );

  // Initial settings config and dyanmic bind to push settings updates on change
  sidebarProvider.setRenderingConfig({
    editorFontFamily,
    ...extensionSettings.snapshot(),
  } as ExtensionConfig);

  extensionSettings.bindAll((values) => {
    sidebarProvider.setRenderingConfig({
      editorFontFamily,
      ...values,
    } as ExtensionConfig);
    sidebarProvider.refresh();
  });

  const settingsProvider = new SettingsWebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "testextension-settings-view",
      settingsProvider,
    ),
  );

  try {
    // TODO: replace with dynamic runtime data once implemented
    const structFile = path.join(
      context.extensionUri.fsPath,
      "structure_analyzer",
      "main",
      "call_graph.json",
    );

    const structObj = require(structFile);
    sidebarProvider.setGraphData(structObj as CallGraphData);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to load call graph data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "testextension-sidebar-view",
      sidebarProvider,
    ),
  );

  context.subscriptions.push({
    dispose: () => {
      sidebarProvider.dispose();
    },
  });

  context.subscriptions.push(
    startRuntimeCommand,
    stopRuntimeCommand,
    runtimeStatusCommand,
    settingsProvider,
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
