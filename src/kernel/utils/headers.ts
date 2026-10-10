/** Reads a header in any letter case, since HTTP header names are case-insensitive. */
export function headerValue(headers: Record<string, string | undefined>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === wanted)?.[1];
}
