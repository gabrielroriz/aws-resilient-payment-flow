import { SqlSubscriptionRepository } from "@infra/repositories/subscription/SqlSubscriptionRepository";
import { expect, test } from "vitest";

test("grantAccess grants every request", async () => {
  const repository = new SqlSubscriptionRepository();

  await expect(
    repository.grantAccess({
      provider: "gatewayBrazil",
      subscriptionId: "sub_1",
      paymentId: "pay_1",
      metadata: { eventId: "evt_1", receivedAt: new Date("2026-10-10T10:00:01.000Z") },
      grantedAt: new Date("2026-10-10T10:00:05.000Z"),
    }),
  ).resolves.toEqual({ granted: true });
});
