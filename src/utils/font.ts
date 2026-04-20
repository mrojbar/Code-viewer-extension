import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import { SidebarProvider } from "../SidebarProvider";

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

function getDefaultTerminalFontFilePath(): string {
  const windowsDir = process.env.WINDIR ?? "C:\\Windows";
  return path.join(windowsDir, "Fonts", "consola.ttf");
}

async function patchMsdfgenWasmExports(): Promise<void> {
  const universalEntry = require.resolve("@a-issaoui/universal-msdf-generator");
  const msdfgenPackageJsonPath = path.resolve(
    universalEntry,
    "../../../../msdfgen-wasm/package.json",
  );

  const packageJsonText = await fs.readFile(msdfgenPackageJsonPath, "utf8");
  const msdfgenPackage = JSON.parse(packageJsonText) as {
    exports?: Record<string, unknown>;
  };

  const exportsRecord = (msdfgenPackage.exports ??= {}) as Record<
    string,
    unknown
  >;
  const rootExport = (exportsRecord["."] ??= {}) as Record<string, unknown>;

  let changed = false;
  if (rootExport.import !== "./dist/cjs/index.js") {
    rootExport.import = "./dist/cjs/index.js";
    changed = true;
  }

  if (rootExport.types !== "./dist/types/index.d.ts") {
    rootExport.types = "./dist/types/index.d.ts";
    changed = true;
  }

  if (changed) {
    await fs.writeFile(
      msdfgenPackageJsonPath,
      `${JSON.stringify(msdfgenPackage, null, 2)}\n`,
      "utf8",
    );
  }
}

async function parseFontFaceFromFntFile(
  fntFilePath: string,
): Promise<string | undefined> {
  const fntText = await fs.readFile(fntFilePath, "utf8");
  const match = /face="([^"]+)"/i.exec(fntText);
  const face = match?.[1]?.trim();
  return face || undefined;
}

export async function configureMsdfTextRendering(
  context: vscode.ExtensionContext,
  sidebarProvider: SidebarProvider,
  terminalFontFamily: string,
): Promise<void> {
  try {
    await vscode.workspace.fs.createDirectory(context.globalStorageUri);
    await patchMsdfgenWasmExports();

    const previousVitest = process.env.VITEST;
    process.env.VITEST = "1";

    try {
      const outputDir = path.join(
        context.globalStorageUri.fsPath,
        "msdf-fonts",
      );
      await fs.mkdir(outputDir, { recursive: true });

      const msdfModule = await import("@a-issaoui/universal-msdf-generator");
      const fontFilePath = getDefaultTerminalFontFilePath();
      let fontFileExists = false;
      try {
        await fs.access(fontFilePath);
        fontFileExists = true;
      } catch {
        fontFileExists = false;
      }

      if (!fontFileExists) {
        console.warn(
          `MSDF font generation skipped: terminal font file not found at ${fontFilePath}`,
        );
        return;
      }

      const result = await msdfModule.generate(fontFilePath, {
        outputDir,
        outputFormat: "fnt",
        name: "terminal-default",
        fontSize: 200,
        fieldRange: 6,
        padding: 2,
        charset: "latin",
        reuseExisting: true,
        verbose: false,
      });

      if (!result.success) {
        const errorValue = result.error as unknown;
        const errorMessage =
          errorValue instanceof Error ? errorValue.message : String(errorValue);
        console.warn(`MSDF font generation failed: ${errorMessage}`);
        return;
      }

      const fntFilePath = (result.savedFiles ?? []).find((filePath) =>
        filePath.toLowerCase().endsWith(".fnt"),
      );

      if (!fntFilePath) {
        console.warn("MSDF font generation succeeded without .fnt output.");
        return;
      }

      const msdfFontFamily =
        (await parseFontFaceFromFntFile(fntFilePath)) ?? terminalFontFamily;

      sidebarProvider.setTextRenderingConfig({
        editorFontFamily: terminalFontFamily,
        msdfFontFntAbsolutePath: fntFilePath,
        msdfFontFamily,
      });
    } finally {
      if (previousVitest === undefined) {
        delete process.env.VITEST;
      } else {
        process.env.VITEST = previousVitest;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`MSDF text setup failed: ${message}`);
  }
}
