import * as vscode from "vscode";
import * as path from "path";
import { RuntimeManager } from "./RuntimeManager";
import { SidebarProvider } from "./SidebarProvider";
import { CallGraphVisualizer } from "./visualization/CallGraphVisualizer";
import { CallGraphData } from "./types/call_graph";

export function activate(context: vscode.ExtensionContext) {
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

  const disposable = vscode.commands.registerCommand(
    "testextension.helloWorld",
    () => {
      vscode.window.showInformationMessage("Hello Vscode from TestExtension!");
    },
  );

  /**
   * Test: render graph
   */
  const cytoscapeVis = new CallGraphVisualizer();
  const sidebarProvider = new SidebarProvider(context.extensionUri);

  sidebarProvider.visualizer = cytoscapeVis;
  try {
    const structFile = path.join(
      context.extensionUri.fsPath,
      "structure_analyzer",
      "main",
      "call_graph.json",
    );

    const structObj = require(structFile);
    sidebarProvider.graphData = structObj as CallGraphData;
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

  context.subscriptions.push(
    disposable,
    startRuntimeCommand,
    stopRuntimeCommand,
    runtimeStatusCommand,
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
