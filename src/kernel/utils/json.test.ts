import { parseJson, snakeCaseKeys } from "@kernel/utils/json";
import { expect, test } from "vitest";

test("parseJson returns undefined for text that is not JSON", () => {
  expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  expect(parseJson("{")).toBeUndefined();
});

test("snakeCaseKeys renames keys at every depth and keeps other values", () => {
  const receivedAt = new Date("2026-10-26T10:00:00.000Z");

  expect(
    snakeCaseKeys({
      subscriptionId: "sub_1",
      metadata: { eventId: "evt_1", receivedAt },
      items: [{ paymentId: "pay_1" }, "plain"],
      provider: "gatewayBrazil",
    }),
  ).toEqual({
    subscription_id: "sub_1",
    metadata: { event_id: "evt_1", received_at: receivedAt },
    items: [{ payment_id: "pay_1" }, "plain"],
    provider: "gatewayBrazil",
  });
  expect(snakeCaseKeys(null)).toBeNull();
  expect(snakeCaseKeys(undefined)).toBeUndefined();
  expect(snakeCaseKeys("subscriptionId")).toBe("subscriptionId");
});
