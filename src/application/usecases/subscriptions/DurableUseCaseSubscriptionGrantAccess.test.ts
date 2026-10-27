import type { SubscriptionGrantAccess } from "@application/contracts/Workflows";
import { Clock } from "@application/ports/Clock";
import { Logger } from "@application/ports/Logger";
import { SubscriptionRepository } from "@application/ports/subscriptions/SubscriptionRepository";
import { DurableExecution } from "@application/ports/workflows/DurableExecution";
import { DurableUseCaseSubscriptionGrantAccess } from "@application/usecases/subscriptions/DurableUseCaseSubscriptionGrantAccess";
import { expect, test, vi } from "vitest";

const input: SubscriptionGrantAccess = {
  provider: "gatewayBrazil",
  subscriptionId: "sub_1",
  paymentId: "pay_1",
  metadata: { eventId: "evt_1", receivedAt: new Date("2026-10-10T10:00:01.000Z") },
};

const grantedAt = new Date("2026-10-10T10:00:05.000Z");

// `granted` is whether the payment's latest status still allows the grant.
function setup({ granted = true }: { granted?: boolean } = {}) {
  const grantAccess = vi.fn(async (_grant: SubscriptionRepository.Grant) => ({ granted }));
  const info = vi.fn();
  const logger = { info } as Partial<Logger> as Logger;
  const clock: Clock = { now: () => grantedAt };
  // Runs each step at once, recording its name, as a first execution would.
  const steps: string[] = [];
  const execution: DurableExecution = {
    step: async (name, work) => {
      steps.push(name);
      return work();
    },
  };
  return {
    useCase: new DurableUseCaseSubscriptionGrantAccess(execution, { grantAccess }, clock, logger),
    grantAccess,
    info,
    steps,
  };
}

test("execute grants access to the subscription in one step, from its input alone", async () => {
  const { useCase, grantAccess, info, steps } = setup();

  await useCase.execute(input);

  expect(steps).toEqual(["grant_access"]);
  expect(grantAccess).toHaveBeenCalledExactlyOnceWith({ ...input, grantedAt });
  expect(info).toHaveBeenCalledExactlyOnceWith("subscription_access_granted", {
    provider: "gatewayBrazil",
    subscriptionId: "sub_1",
    paymentId: "pay_1",
    eventId: "evt_1",
  });
});

test("execute succeeds without granting when a newer event of the payment outranks it", async () => {
  const { useCase, info } = setup({ granted: false });

  await expect(useCase.execute(input)).resolves.toBeUndefined();

  expect(info).toHaveBeenCalledExactlyOnceWith(
    "subscription_access_grant_stale",
    expect.any(Object),
  );
});

test("execute propagates storage failures from its step, which retries them", async () => {
  const failure = new Error("unavailable");
  const { useCase, grantAccess } = setup();
  grantAccess.mockRejectedValueOnce(failure);

  await expect(useCase.execute(input)).rejects.toBe(failure);
});
