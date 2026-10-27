import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

// Compares two credentials in a time that does not reveal where they differ.
export function constantTimeEqual(a: string, b: string): boolean {
  // Digests give both sides the same length, which timingSafeEqual requires.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

// A random identifier, unique without coordination, such as an attempt's.
export function randomId(): string {
  return randomUUID();
}

// A 64-character hex name for parts that AWS names may not contain as they are.
// A JSON array keeps parts distinct, so `a#b` + `c` never matches `a` + `b#c`.
export function digest(parts: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
