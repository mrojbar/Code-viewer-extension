import * as assert from "assert";
import { buildSettingsViewData } from "../SettingsViewDataBuilder.js";
import { GENERATED_SETTINGS_SCHEMA } from "../generated/settingsSchema.js";
import type { ExtensionSettings } from "../settings.js";

function makeSettings(values: Record<string, unknown>): ExtensionSettings {
  return {
    get: (key: string) => values[key],
  } as unknown as ExtensionSettings;
}

suite("Settings view data", () => {
  test("projects every schema key", () => {
    const data = buildSettingsViewData(makeSettings({}));
    assert.deepStrictEqual(
      data.map((datum) => datum.key).sort(),
      Object.keys(GENERATED_SETTINGS_SCHEMA).sort(),
    );
  });

  test("derives labels from camel case keys", () => {
    const data = buildSettingsViewData(makeSettings({}));
    const byKey = new Map(data.map((datum) => [datum.key, datum]));
    assert.strictEqual(
      byKey.get("normalizeTreemapWeight")?.label,
      "Normalize Treemap Weight",
    );
    assert.strictEqual(
      byKey.get("graphViewLocation")?.label,
      "Graph View Location",
    );
  });

  test("projects schema metadata", () => {
    const data = buildSettingsViewData(makeSettings({}));
    const padding = data.find(
      (datum) => datum.key === "treemapPaddingPercent",
    );
    assert.strictEqual(padding?.valueType, "number");
    assert.strictEqual(padding?.defaultValue, 0.02);
    assert.strictEqual(padding?.minimum, 0);
    assert.strictEqual(padding?.maximum, 0.5);
    assert.strictEqual(padding?.configurationPath, "testextension.treemapPaddingPercent");
    assert.ok(padding?.description);
  });

  test("projects enum values for string settings", () => {
    const data = buildSettingsViewData(makeSettings({}));
    const location = data.find((datum) => datum.key === "graphViewLocation");
    assert.deepStrictEqual(location?.enumValues, ["tab", "sidebar"]);
  });

  test("projects current values from the settings module", () => {
    const data = buildSettingsViewData(
      makeSettings({
        graphViewLocation: "sidebar",
        normalizedTreemapMaxWeight: 8,
        dynamicTreemapPadding: false,
      }),
    );
    const byKey = new Map(data.map((datum) => [datum.key, datum]));
    assert.strictEqual(byKey.get("graphViewLocation")?.value, "sidebar");
    assert.strictEqual(byKey.get("normalizedTreemapMaxWeight")?.value, 8);
    assert.strictEqual(byKey.get("dynamicTreemapPadding")?.value, false);
  });
});
