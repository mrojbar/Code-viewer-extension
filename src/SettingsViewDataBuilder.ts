import {
  GENERATED_SETTINGS_SCHEMA,
  GeneratedSetting,
} from "./generated/settingsSchema";
import { ExtensionSettings, SettingsKey } from "./settings";
import { SettingsViewDatum } from "./visualization/interfaces/messages";
import { formatCamelCase } from "./SettingsHtmlBuilder";

/**
 * Projects the generated settings schema plus current cached values
 * into the data payload consumed by the webview settings popup.
 */
export function buildSettingsViewData(
  settings: ExtensionSettings,
): SettingsViewDatum[] {
  const data: SettingsViewDatum[] = [];

  for (const [key, rawSchema] of Object.entries(GENERATED_SETTINGS_SCHEMA)) {
    const schema = rawSchema as GeneratedSetting;
    data.push({
      key,
      label: formatCamelCase(key),
      description: schema.description,
      valueType: schema.valueType,
      defaultValue: schema.defaultValue,
      value: settings.get(key as SettingsKey),
      minimum: schema.minimum,
      maximum: schema.maximum,
      enumValues: schema.enumValues,
      configurationPath: schema.configurationPath,
    });
  }

  return data;
}
