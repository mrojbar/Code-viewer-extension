import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

const RUNTIME_FOLDER = "binaries";
const APP_NAME = "app";

type RuntimeTarget = {
  folder: string;
  executableName: string;
};

type RuntimeMessage = {
  type: string;
  [key: string]: unknown;
};

type StartWaiter = {
  resolve: () => void;
  reject: (reason: Error) => void;
  timeoutHandle: NodeJS.Timeout;
};

/**
 * Manages the lifecycle of the bundled runtime process, including starting, stopping, and monitoring its status.
 * Communicates with the runtime via stdin/stdout using a simple JSON message protocol.
 * Logs runtime output to a dedicated VS Code output channel for visibility.
 * Implements a startup timeout to handle cases where the runtime fails to initialize properly.
 */
export class RuntimeManager implements vscode.Disposable {
  static readonly STARTUP_TIMEOUT_MS = 10000;

  runtimeProcess?: ChildProcessWithoutNullStreams;
  readonly context: vscode.ExtensionContext;
  readonly outputChannel: vscode.OutputChannel;
  stdoutBuffer = "";
  startWaiter?: StartWaiter;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.outputChannel = vscode.window.createOutputChannel(
      "TestExtension Python Runtime",
    );
  }

  async start(): Promise<void> {
    if (this.runtimeProcess && !this.runtimeProcess.killed) {
      this.outputChannel.appendLine("Runtime is already running.");
      return;
    }

    const executablePath = this.resolveBundledExecutablePath();
    if (!fs.existsSync(executablePath)) {
      throw new Error(
        `Bundled runtime not found at ${executablePath}. Add the binary before running.`,
      );
    }

    if (process.platform !== "win32") {
      // Ensure executable bit is set when packaged on a non-POSIX filesystem.
      fs.chmodSync(executablePath, 0o755);
    }

    this.outputChannel.appendLine(`Starting runtime from: ${executablePath}`);

    this.runtimeProcess = spawn(executablePath, [], {
      cwd: path.dirname(executablePath),
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: "pipe",
    });

    this.stdoutBuffer = "";

    this.runtimeProcess.stdout.on("data", (data: Buffer) => {
      this.consumeStdout(data);
    });

    this.runtimeProcess.stderr.on("data", (data: Buffer) => {
      const text = data.toString("utf8").trimEnd();
      if (text.length > 0) {
        this.outputChannel.appendLine(`[runtime stderr] ${text}`);
      }
    });

    this.runtimeProcess.on("error", (error: Error) => {
      this.outputChannel.appendLine(`Runtime process error: ${error.message}`);
      this.rejectStartWaiter(
        new Error(`Runtime process error before ready: ${error.message}`),
      );
    });

    this.runtimeProcess.on(
      "exit",
      (code: number | null, signal: NodeJS.Signals | null) => {
        this.outputChannel.appendLine(
          `Runtime exited. code=${code ?? "null"} signal=${signal ?? "null"}`,
        );
        this.rejectStartWaiter(
          new Error("Runtime exited before signaling readiness."),
        );
        this.stdoutBuffer = "";
        this.runtimeProcess = undefined;
      },
    );

    const waitForReady = this.createStartWaiter();
    this.sendMessage({ type: "initialize", protocolVersion: 1 });
    await waitForReady;
    this.outputChannel.appendLine("Runtime signaled ready.");
  }

  stop(): void {
    if (!this.runtimeProcess || this.runtimeProcess.killed) {
      this.outputChannel.appendLine("Runtime is not running.");
      return;
    }

    this.outputChannel.appendLine("Stopping runtime process.");
    this.rejectStartWaiter(
      new Error("Runtime stop requested before startup completed."),
    );
    this.runtimeProcess.kill();
  }

  isRunning(): boolean {
    return !!this.runtimeProcess && !this.runtimeProcess.killed;
  }

  dispose(): void {
    this.stop();
    this.outputChannel.dispose();
  }

  resolveBundledExecutablePath(): string {
    const target = this.resolveTarget();
    const runtimeUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      RUNTIME_FOLDER,
      target.folder,
      target.executableName,
    );
    return runtimeUri.fsPath;
  }

  consumeStdout(data: Buffer): void {
    this.stdoutBuffer += data.toString("utf8");

    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const rawLine = this.stdoutBuffer.slice(0, newlineIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      const line = rawLine.trim();

      if (line.length > 0) {
        this.handleStdoutLine(line);
      }

      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  handleStdoutLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      this.outputChannel.appendLine(`[runtime stdout] ${line}`);
      return;
    }

    if (!this.isRuntimeMessage(parsed)) {
      this.outputChannel.appendLine(`[runtime stdout] ${line}`);
      return;
    }

    this.handleRuntimeMessage(parsed);
  }

  isRuntimeMessage(value: unknown): value is RuntimeMessage {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    if (!("type" in value)) {
      return false;
    }

    return typeof value.type === "string";
  }

  handleRuntimeMessage(message: RuntimeMessage): void {
    if (message.type === "ready") {
      this.resolveStartWaiter();
      return;
    }

    if (message.type === "log" && typeof message.message === "string") {
      this.outputChannel.appendLine(`[runtime] ${message.message}`);
      return;
    }

    this.outputChannel.appendLine(`[runtime json] ${JSON.stringify(message)}`);
  }

  sendMessage(message: RuntimeMessage): void {
    if (!this.runtimeProcess || this.runtimeProcess.killed) {
      throw new Error("Runtime process is not running.");
    }

    const payload = `${JSON.stringify(message)}\n`;
    this.runtimeProcess.stdin.write(payload, "utf8");
  }

  createStartWaiter(): Promise<void> {
    this.rejectStartWaiter(new Error("Replaced previous startup wait state."));

    return new Promise<void>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        const processToStop = this.runtimeProcess;
        this.startWaiter = undefined;
        reject(
          new Error(
            `Runtime did not send a ready message within ${RuntimeManager.STARTUP_TIMEOUT_MS}ms.`,
          ),
        );

        if (processToStop && !processToStop.killed) {
          processToStop.kill();
        }
      }, RuntimeManager.STARTUP_TIMEOUT_MS);

      this.startWaiter = {
        resolve,
        reject,
        timeoutHandle,
      };
    });
  }

  resolveStartWaiter(): void {
    if (!this.startWaiter) {
      return;
    }

    clearTimeout(this.startWaiter.timeoutHandle);
    this.startWaiter.resolve();
    this.startWaiter = undefined;
  }

  rejectStartWaiter(error: Error): void {
    if (!this.startWaiter) {
      return;
    }

    clearTimeout(this.startWaiter.timeoutHandle);
    this.startWaiter.reject(error);
    this.startWaiter = undefined;
  }

  resolveTarget(): RuntimeTarget {
    if (process.platform === "win32") {
      if (process.arch === "x64") {
        return { folder: "win32-x64", executableName: `${APP_NAME}.exe` };
      }
      if (process.arch === "arm64") {
        return { folder: "win32-arm64", executableName: `${APP_NAME}.exe` };
      }
    }

    if (process.platform === "darwin") {
      if (process.arch === "x64") {
        return { folder: "darwin-x64", executableName: `${APP_NAME}` };
      }
      if (process.arch === "arm64") {
        return { folder: "darwin-arm64", executableName: `${APP_NAME}` };
      }
    }

    if (process.platform === "linux") {
      if (process.arch === "x64") {
        return { folder: "linux-x64", executableName: `${APP_NAME}` };
      }
      if (process.arch === "arm64") {
        return { folder: "linux-arm64", executableName: `${APP_NAME}` };
      }
    }

    throw new Error(
      `Unsupported runtime target: platform=${process.platform} arch=${process.arch}`,
    );
  }
}
