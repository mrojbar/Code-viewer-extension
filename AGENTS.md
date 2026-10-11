## Build & Verification

- **Package manager:** `pnpm` (lockfile is pnpm; `npm` works for simple commands but prefer `pnpm`)
- **Compile everything:** `pnpm run compile`  
  Order matters: `generate:settings-schema` → `compile:extension` → `compile:webview`
- **Lint:** `pnpm run lint` (`eslint src`)
- **Test:** `pnpm run test` (uses `@vscode/test-cli` + `@vscode/test-electron`; launches a real VS Code instance)
- **Watch mode:** `pnpm run watch` rebuilds webview once then watches extension code

### TypeScript split
- **Extension host:** `tsconfig.json` → `out/` (Node16, `src/visualization/webview/**` excluded)
- **Webview runtime:** `tsconfig.webview.json` → `runtime/` (Bundler, DOM libs, only `src/visualization/webview/**/*.ts`)
- Both have `strict`, `noUnusedLocals`, `noUnusedParameters` enabled. Dead code will fail compilation.

## Codegen

`scripts/generate-settings-schema.mjs` parses `package.json` `contributes.configuration.properties` and emits `src/generated/settingsSchema.ts`.  
**Regeneration is automatic** during `compile:extension`. Do not hand-edit `src/generated/**`.

## Architecture

- **Entry:** `src/extension.ts` — activates the extension, starts the Python runtime, wires sidebar/settings webviews.
- **Settings:** `src/settings.ts` (`ExtensionSettings` singleton) reads VS Code settings and provides typed `get`/`bind`/`bindAll` APIs. Schema is codegen-derived from `package.json`.
- **Visualization:**
  - `src/visualization/PixiVisualizer.ts` — flattens `CallGraphData` into `PixiElement[]` for the renderer.
  - `src/visualization/webview/pixiView.ts` — webview bootstrap; receives messages from the extension host.
  - `src/visualization/webview/render/treemap.ts` — `TreemapRenderManager`; owns Pixi lifecycle, layout validation, and retry logic.
  - `src/visualization/layout/treemapLayout.ts` — thin D3 treemap wrapper.
- **Python runtime:** `src/RuntimeManager.ts` spawns a platform binary under `runtime/<platform>/app`. Communicates via **JSON lines over stdio** (`{"type":"initialize"}` → expects `{"type":"ready"}` within 10s).
- **Sidebar webview:** `src/SidebarProvider.ts` renders the treemap. `src/SettingsWebviewProvider.ts` renders the settings panel.

## Data Flow

`structure_analyzer/main/call_graph.json` (static file loaded at activation) → `PixiVisualizer.buildElementsFromGraph()` → extension host posts `UpdateGraphMessage` → webview `TreemapRenderManager.renderElements()` → D3 treemap layout → PixiJS boxes + labels.

## Agent Conventions

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Agent skills

### Issue tracker

`to-spec`, `to-tickets`, and `triage` return chat drafts only; they do not publish issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default triage vocabulary in chat drafts: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
