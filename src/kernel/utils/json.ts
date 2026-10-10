/**
 * Parses JSON text, returning `undefined` instead of throwing when it is not JSON. JSON cannot
 * encode `undefined`, so that result always means the text was malformed.
 */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Whether a parsed value is a JSON object, as opposed to an array, null, or a primitive. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a parsed value is a non-empty string, as identifiers usually must be. */
export function isFilledString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
