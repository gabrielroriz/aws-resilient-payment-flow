// Parses JSON text, returning `undefined` instead of throwing when it is not JSON.
// JSON cannot encode `undefined`, so that result means the text was malformed.
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
