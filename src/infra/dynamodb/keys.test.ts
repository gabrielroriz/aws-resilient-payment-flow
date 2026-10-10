import { joinKey, shardOf } from "@infra/dynamodb/keys";
import { expect, test } from "vitest";

test("joinKey joins parts with #", () => {
  expect(joinKey("stripe", "evt_1")).toBe("stripe#evt_1");
  expect(joinKey("stripe", 3)).toBe("stripe#3");
});

test("shardOf is stable, stays in range, and spreads keys evenly", () => {
  const shards = Array.from({ length: 1000 }, (_, i) => shardOf(`stripe#evt_${i}`, 4));

  expect(shardOf("stripe#evt_1", 4)).toBe(shardOf("stripe#evt_1", 4));
  expect(shards.every((shard) => Number.isInteger(shard) && shard >= 0 && shard < 4)).toBe(true);
  // An even spread puts about 250 of the 1,000 keys on each shard.
  for (const shard of [0, 1, 2, 3]) {
    expect(shards.filter((value) => value === shard).length).toBeGreaterThan(200);
  }
});
