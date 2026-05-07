# TestExtension

> [!WARNING]
> This is still a work in progress

A VS Code extension with a TypeScript frontend/host and a Python runtime backend to visualize in a reactive tree diagram the internal structure and call graph of your repository.

The Python backend parses code with tree-sitter to generate a call graph. The TypeScript host renders this as an interactive treemap in a VS Code webview using PixiJS and d3-hierarchy.

## Prerequisites

- [Node.js](https://nodejs.org/) (v22+ recommended)
- [pnpm](https://pnpm.io/) (v10+)
- [VS Code](https://code.visualstudio.com/) (v1.110+)
- Python 3.11+
- `make` (for Python environment setup)

## Build

```bash
pnpm install
pnpm run compile
```

## Python Environment Setup

The Python code lives in `structure_analyzer/`. To configure the environment:

```bash
cd structure_analyzer
make setup
```

This creates a virtual environment at `structure_analyzer/env/` and installs the dependencies listed in `req.txt`.
The graph building script is still work in progress, a static data file `call_graph.json` is provided for testing in the meantime.

## Run

Press `F5` in VS Code to launch the Extension Development Host.

## Project Structure

- **TypeScript extension host:** `src/` → compiles to `out/`
- **Webview runtime:** `src/visualization/webview/` → compiles to `runtime/` **WIP!!**
- **Python runtime:** expects a bundled binary at `binaries/<platform>/app` (or `app.exe` on Windows) **WIP!!"**
- **Static data:** loads `structure_analyzer/main/call_graph.json` at activation

## Main Dependencies

### TypeScript

- [PixiJS](https://pixijs.com/) — 2D WebGL rendering
- [d3-hierarchy](https://github.com/d3/d3-hierarchy) — treemap layout
- [elkjs](https://github.com/kieler/elkjs) — graph layout
- [pixi-viewport](https://github.com/davidfig/pixi-viewport) — pan/zoom for PixiJS
- [@vscode/webview-ui-toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit) — VS Code webview components

### Python

- [pydantic](https://docs.pydantic.dev/) — data validation
- [tree-sitter](https://tree-sitter.github.io/tree-sitter/) — parsing
- [tree-sitter-languages](https://github.com/grantjenks/py-tree-sitter-languages) — language bindings
