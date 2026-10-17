import { createHash } from "node:crypto";

// Helpers for building DynamoDB key values, shared by every table adapter.

// Joins key parts with `#`, every composite key's separator, as in `stripe#evt_1`.
export function joinKey(...parts: readonly (string | number)[]): string {
  return parts.join("#");
}

// Picks a write shard in `0..count-1` for a key.
// The same key always lands on the same shard, and different keys spread evenly.
// This way no single partition key value takes every write.
export function shardOf(key: string, count: number): number {
  return createHash("sha256").update(key).digest().readUInt32BE(0) % count;
}
