// Parses JSON text, returning `undefined` instead of throwing when it is not JSON.
// JSON cannot encode `undefined`, so that result means the text was malformed.
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Renames object keys from camelCase to snake_case at every depth.
// Values other than plain objects and arrays, such as dates, stay as they are.
export function snakeCaseKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(snakeCaseKeys);
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      snakeCaseKeys(item),
    ]),
  );
}
