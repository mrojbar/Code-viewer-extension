import * as assert from "assert";
import { buildWarningHtml } from "../visualization/webview/render/warningHtml.js";
import { buildSettingsRowsHtml } from "../visualization/webview/settingsRowsHtml.js";
import type {
  LayoutDiagnostics,
  SettingsViewDatum,
} from "../visualization/interfaces/messages.js";

function makeDiagnostics(
  partial: Partial<LayoutDiagnostics> = {},
): LayoutDiagnostics {
  return {
    totalNodes: 10,
    collapsedCount: 0,
    extremeCount: 0,
    avgArea: 100,
    collapsedSamples: [],
    extremeSamples: [],
    ...partial,
  };
}

function makeDatum(
  partial: Pick<SettingsViewDatum, "key" | "valueType" | "value"> &
    Partial<SettingsViewDatum>,
): SettingsViewDatum {
  const defaults: SettingsViewDatum = {
    key: partial.key,
    label: "Sample label",
    description: null,
    valueType: partial.valueType,
    defaultValue:
      partial.valueType === "boolean"
        ? false
        : partial.valueType === "number"
          ? 0
          : "",
    value: partial.value,
    minimum: null,
    maximum: null,
    enumValues: null,
    configurationPath: `testextension.${partial.key}`,
  };
  return { ...defaults, ...partial };
}

suite("Popup render", () => {
  suite("buildWarningHtml", () => {
    test("returns empty string without diagnostics", () => {
      assert.strictEqual(buildWarningHtml(undefined), "");
    });

    test("returns empty string when validation found no problems", () => {
      assert.strictEqual(buildWarningHtml(makeDiagnostics()), "");
    });

    test("renders collapsed samples", () => {
      const html = buildWarningHtml(
        makeDiagnostics({
          collapsedCount: 2,
          collapsedSamples: [{ path: "src/a.ts", w: 1.5, h: 0.5 }],
        }),
      );
      assert.ok(html.includes("Collapsed nodes: 2"));
      assert.ok(html.includes("src/a.ts"));
      assert.ok(html.includes("1.5 x 0.5"));
    });

    test("renders extreme aspect ratio samples", () => {
      const html = buildWarningHtml(
        makeDiagnostics({
          extremeCount: 1,
          extremeSamples: [{ path: "src/b.ts", w: 30, h: 1 }],
        }),
      );
      assert.ok(html.includes("Extreme aspect ratio nodes: 1"));
      assert.ok(html.includes("src/b.ts"));
    });

    test("renders both problem kinds together", () => {
      const html = buildWarningHtml(
        makeDiagnostics({
          collapsedCount: 1,
          collapsedSamples: [{ path: "src/a.ts", w: 1, h: 1 }],
          extremeCount: 1,
          extremeSamples: [{ path: "src/b.ts", w: 2, h: 2 }],
        }),
      );
      assert.ok(html.includes("Collapsed nodes: 1"));
      assert.ok(html.includes("Extreme aspect ratio nodes: 1"));
    });

    test("escapes sample paths", () => {
      const html = buildWarningHtml(
        makeDiagnostics({
          collapsedCount: 1,
          collapsedSamples: [{ path: "<script>&'", w: 1, h: 1 }],
        }),
      );
      assert.ok(!html.includes("<script>"));
      assert.ok(html.includes("&lt;script&gt;&amp;&#039;"));
    });
  });

  suite("buildSettingsRowsHtml", () => {
    test("always renders the reset row", () => {
      const html = buildSettingsRowsHtml([]);
      assert.ok(html.includes("settings-reset-btn"));
    });

    test("renders boolean checkbox checked when true", () => {
      const html = buildSettingsRowsHtml([
        makeDatum({
          key: "normalizeTreemapWeight",
          valueType: "boolean",
          value: true,
          defaultValue: false,
        }),
      ]);
      assert.ok(html.includes("data-key=\"normalizeTreemapWeight\""));
      assert.ok(html.includes("<vscode-checkbox"));
      assert.ok(html.includes("checked"));
    });

    test("marks row configured when value differs from default", () => {
      const html = buildSettingsRowsHtml([
        makeDatum({
          key: "dynamicTreemapPadding",
          valueType: "boolean",
          value: true,
          defaultValue: true,
        }),
        makeDatum({
          key: "capSiblingsWeightRatio",
          valueType: "number",
          value: 50,
          defaultValue: 10,
        }),
      ]);
      assert.ok(!html.includes("data-key=\"dynamicTreemapPadding\" is-configured"));
      assert.ok(html.includes("is-configured\" data-key=\"capSiblingsWeightRatio\""));
    });

    test("renders number slider bounded by schema limits", () => {
      const html = buildSettingsRowsHtml([
        makeDatum({
          key: "treemapPaddingPercent",
          valueType: "number",
          value: 0.02,
          defaultValue: 0.02,
          minimum: 0,
          maximum: 0.5,
        }),
      ]);
      assert.ok(html.includes("native-slider"));
      assert.ok(html.includes("id=\"treemapPaddingPercent-slider\""));
      assert.ok(html.includes("id=\"treemapPaddingPercent-input\""));
      assert.ok(html.includes("min=\"0\""));
      assert.ok(html.includes("max=\"0.5\""));
      assert.ok(html.includes("step=\"0.01\""));
    });

    test("renders enum dropdown with the current option selected", () => {
      const html = buildSettingsRowsHtml([
        makeDatum({
          key: "graphViewLocation",
          valueType: "string",
          value: "sidebar",
          defaultValue: "tab",
          enumValues: ["tab", "sidebar"],
        }),
      ]);
      assert.ok(html.includes("<vscode-dropdown"));
      assert.ok(html.includes("<vscode-option value=\"sidebar\" selected>"));
      assert.ok(html.includes("<vscode-option value=\"tab\" >"));
    });

    test("renders free string value as text field", () => {
      const html = buildSettingsRowsHtml([
        makeDatum({
          key: "editorFontFamily",
          valueType: "string",
          value: "Fira Code",
          defaultValue: "",
        }),
      ]);
      assert.ok(html.includes("<vscode-text-field"));
      assert.ok(html.includes("value=\"Fira Code\""));
    });

    test("renders descriptions as tooltips when requested", () => {
      const datum = makeDatum({
        key: "normalizeTreemapWeight",
        valueType: "boolean",
        value: true,
        defaultValue: true,
        description: "Normalize treemap weight",
      });
      const tooltipHtml = buildSettingsRowsHtml([datum], { tooltip: true });
      const inlineHtml = buildSettingsRowsHtml([datum]);
      assert.ok(tooltipHtml.includes("title=\"Normalize treemap weight\""));
      assert.ok(!tooltipHtml.includes("setting-description"));
      assert.ok(inlineHtml.includes("setting-description"));
    });
  });
});
