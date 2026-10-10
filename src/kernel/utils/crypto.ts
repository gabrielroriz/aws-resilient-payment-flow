import { createHash, timingSafeEqual } from "node:crypto";

/** Compares two credentials in a time that does not reveal where they differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  // Digests give both sides the same length, which timingSafeEqual requires.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}
