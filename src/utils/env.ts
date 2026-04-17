import * as fs from "fs";

export function readEnvVariables(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const envContent = fs.readFileSync(envPath, "utf8");
  const envVars: Record<string, string> = {};

  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    envVars[key] = value.replace(/^['\"]|['\"]$/g, "");
  }
  return envVars;
}

export function getEnvBoolean(
  envVars: Record<string, string>,
  name: string,
): boolean {
  const value = envVars[name];
  if (value === undefined) {
    return false;
  }

  return value.trim().toLowerCase() === "true";
}
