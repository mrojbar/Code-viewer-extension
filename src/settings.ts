import * as vscode from "vscode";
import {
  GENERATED_SETTINGS_SCHEMA,
  type GeneratedSetting,
} from "./generated/settingsSchema";

/** Declarative definition for one extension setting entry. */
type SettingDefinition<TValue> = {
  configurationPath: string;
  defaultValue: TValue;
  parse: (value: unknown, defaultValue: TValue) => TValue;
};

/** Helper to preserve literal keys and value types in the schema object. */
function defineSettingsSchema<T extends Record<string, SettingDefinition<any>>>(
  schema: T,
): T {
  return schema;
}

/** Central list of extension settings managed by this singleton. */
const SETTINGS_SCHEMA = (() => {
  const entries = Object.entries(GENERATED_SETTINGS_SCHEMA).map(
    ([key, gen]) => {
      const g = gen as GeneratedSetting;
      const def: SettingDefinition<any> = {
        configurationPath: g.configurationPath,
        defaultValue: g.defaultValue as any,
        parse: (value: unknown, defaultValue: any) => {
          if (g.valueType === "boolean") {
            return typeof value === "boolean" ? value : defaultValue;
          }

          if (g.valueType === "number") {
            if (typeof value !== "number") {
              return defaultValue;
            }
            if (typeof g.minimum === "number" && value < g.minimum) {
              return defaultValue;
            }
            if (typeof g.maximum === "number" && value > g.maximum) {
              return defaultValue;
            }
            return value;
          }

          if (g.valueType === "string") {
            return typeof value === "string" ? value : defaultValue;
          }

          return defaultValue;
        },
      };

      return [key, def] as const;
    },
  );

  return defineSettingsSchema(
    Object.fromEntries(entries) as Record<string, SettingDefinition<any>>,
  );
})();

export type SettingsKey = keyof typeof SETTINGS_SCHEMA;
export type SettingsValues = {
  [K in SettingsKey]: ReturnType<(typeof SETTINGS_SCHEMA)[K]["parse"]>;
};

/**
 * Singleton cache for extension settings.
 *
 * Reads initial values once, tracks configuration changes, and exposes
 * typed read/bind APIs so consumers do not query VS Code settings directly.
 */
export class ExtensionSettings {
  private static instance: ExtensionSettings | undefined;

  private readonly onDidChangeEmitter = new vscode.EventEmitter<
    ReadonlySet<SettingsKey>
  >();
  private initialized = false;
  private values: SettingsValues = this.readAllValues();

  private constructor() {}

  public static getInstance(): ExtensionSettings {
    if (!ExtensionSettings.instance) {
      ExtensionSettings.instance = new ExtensionSettings();
    }

    return ExtensionSettings.instance;
  }

  public initialize(context: vscode.ExtensionContext): void {
    if (this.initialized) {
      return;
    }

    this.values = this.readAllValues();

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        const changedKeys = this.refreshChangedValues(event);
        if (changedKeys.size > 0) {
          this.onDidChangeEmitter.fire(changedKeys);
        }
      }),
      this.onDidChangeEmitter,
    );

    this.initialized = true;
  }

  public get onDidChange(): vscode.Event<ReadonlySet<SettingsKey>> {
    return this.onDidChangeEmitter.event;
  }

  /**
   * Subscribes to a subset of keys and immediately applies current values.
   * Re-applies only when one of the watched keys changes.
   */
  public bind<K extends readonly SettingsKey[]>(
    keys: K,
    apply: (values: Pick<SettingsValues, K[number]>) => void,
  ): vscode.Disposable {
    const watchedKeys = new Set<SettingsKey>(keys);

    const applyCurrentValues = () => {
      apply(this.pickValues(keys));
    };

    applyCurrentValues();

    return this.onDidChangeEmitter.event((changedKeys) => {
      for (const key of watchedKeys) {
        if (changedKeys.has(key)) {
          applyCurrentValues();
          return;
        }
      }
    });
  }

  public bindAll(apply: (values: SettingsValues) => void): vscode.Disposable {
    return this.onDidChangeEmitter.event((changedKeys) => {
      console.log(
        "Settings changed:",
        changedKeys,
        "Complete settings:",
        this.snapshot(),
      );
      apply(this.snapshot());
    });
  }

  /** Reads one cached setting value with full type inference. */
  public get<K extends SettingsKey>(key: K): SettingsValues[K] {
    return this.values[key];
  }

  /** Returns an immutable snapshot of all cached settings. */
  public snapshot(): Readonly<SettingsValues> {
    return { ...this.values };
  }

  /** Forces a re-read of all settings from VS Code configuration into the cache. */
  public forceRefresh(): void {
    this.values = this.readAllValues();
  }

  /** Writes a single setting to VS Code configuration. The cache is updated by the onDidChangeConfiguration listener. */
  public update<K extends SettingsKey>(
    key: K,
    value: SettingsValues[K],
  ): Thenable<void> {
    const schema = SETTINGS_SCHEMA[key];
    return vscode.workspace
      .getConfiguration()
      .update(
        schema.configurationPath,
        value,
        vscode.ConfigurationTarget.Global,
      );
  }

  /** Resets every setting to its default. The cache is updated by the onDidChangeConfiguration listener. */
  public resetAll(): Thenable<void> {
    const updatePromises: Thenable<void>[] = [];
    for (const key of this.getSchemaKeys()) {
      const schema = SETTINGS_SCHEMA[key];
      updatePromises.push(
        vscode.workspace
          .getConfiguration()
          .update(
            schema.configurationPath,
            schema.defaultValue,
            vscode.ConfigurationTarget.Global,
          ),
      );
    }
    return Promise.all(updatePromises).then(() => undefined);
  }

  private refreshChangedValues(
    event: vscode.ConfigurationChangeEvent,
  ): ReadonlySet<SettingsKey> {
    const changed = new Set<SettingsKey>();

    for (const key of this.getSchemaKeys()) {
      const schema = SETTINGS_SCHEMA[key];
      if (!event.affectsConfiguration(schema.configurationPath)) {
        continue;
      }

      const nextValue = this.readValue(key);
      if (Object.is(nextValue, this.values[key])) {
        continue;
      }

      this.values[key] = nextValue;
      changed.add(key);
    }

    return changed;
  }

  private readAllValues(): SettingsValues {
    const values = {} as SettingsValues;

    for (const key of this.getSchemaKeys()) {
      values[key] = this.readValue(key);
    }

    return values;
  }

  private readValue<K extends SettingsKey>(key: K): SettingsValues[K] {
    const schema = SETTINGS_SCHEMA[key];
    const rawValue = vscode.workspace
      .getConfiguration()
      .get<unknown>(schema.configurationPath, schema.defaultValue);

    return schema.parse(rawValue, schema.defaultValue) as SettingsValues[K];
  }

  private getSchemaKeys(): SettingsKey[] {
    return Object.keys(SETTINGS_SCHEMA) as SettingsKey[];
  }

  private pickValues<K extends readonly SettingsKey[]>(
    keys: K,
  ): Pick<SettingsValues, K[number]> {
    const entries = keys.map((key) => [key, this.values[key]] as const);
    return Object.fromEntries(entries) as Pick<SettingsValues, K[number]>;
  }
}
