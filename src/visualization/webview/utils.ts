/** Keeps numeric tuning values safely inside an allowed range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Coerces possibly-invalid numeric values into safe positive integers. */
export function toFiniteInteger(value: number, minimum = 1): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.max(minimum, Math.floor(value));
}
