/** Keeps numeric tuning values safely inside an allowed range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Guards the settings view data payload posted from the host. */
export function isSettingsViewDataMessage(
  value: unknown,
): value is import("../interfaces/messages.js").SettingsViewDataMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { type?: unknown; settings?: unknown };
  return message.type === "settingsViewData" && Array.isArray(message.settings);
}

/** Coerces possibly-invalid numeric values into safe positive integers. */
export function toFiniteInteger(value: number, minimum = 1): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.max(minimum, Math.floor(value));
}

/** Compares two plain objects by keys and primitive values. */
export function shallowEqualObject<T extends object>(
  left: T,
  right: T,
): boolean {
  if (left === right) {
    return true;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  const rightRecord = right as Record<string, unknown>;
  const leftRecord = left as Record<string, unknown>;

  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) {
      return false;
    }

    if (!Object.is(leftRecord[key], rightRecord[key])) {
      return false;
    }
  }

  return true;
}
