import type { SubscriptionGrantAccess } from "@application/contracts/Workflows";
import { SubscriptionGrantAccessController } from "@application/controller/subscriptions/SubscriptionGrantAccessController";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import { LambdaWorkflowStarter } from "@infra/workflows/LambdaWorkflowStarter";
import { validatePayload } from "@kernel/decorators/schema";
import { expect, test, vi, type MockInstance } from "vitest";

// Replaces the SDK call, so tests check the commands sent without reaching AWS.
// The SDK's send is overloaded; tests only use its promise form.
function setup() {
  const starter = new LambdaWorkflowStarter();
  const send = vi.spyOn(starter.lambda, "send") as unknown as MockInstance<
    (command: InvokeCommand) => Promise<unknown>
  >;
  send.mockResolvedValue({ StatusCode: 202 });
  return { starter, send };
}

const grant: SubscriptionGrantAccess = {
  provider: "gatewayBrazil",
  subscriptionId: "sub_1",
  paymentId: "pay_1",
  metadata: { eventId: "evt_1", receivedAt: new Date("2026-10-10T10:00:01.000Z") },
};

test("start invokes the workflow's durable function through its alias asynchronously with its snake_case contract", async () => {
  const { starter, send } = setup();

  await starter.start("subscription_grant_access", grant);

  const [command] = send.mock.calls[0];
  expect(command).toBeInstanceOf(InvokeCommand);
  const { Payload, ...input } = command.input;
  expect(input).toEqual({
    FunctionName: "wf_subscription_grant_access:live",
    InvocationType: "Event",
    DurableExecutionName: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
  expect(JSON.parse(String(Payload))).toEqual({
    provider: "gatewayBrazil",
    subscription_id: "sub_1",
    payment_id: "pay_1",
    metadata: { event_id: "evt_1", received_at: "2026-10-10T10:00:01.000Z" },
  });
});

test("the input a caller sends is what the workflow's controller accepts", async () => {
  const { starter, send } = setup();

  await starter.start("subscription_grant_access", grant);

  const sent = JSON.parse(String(send.mock.calls[0][0].input.Payload));
  expect(validatePayload(new SubscriptionGrantAccessController({} as never), sent)).toEqual({
    success: true,
    data: grant,
  });
});

test("start names each execution after its input, so starting it again reuses it", async () => {
  const { starter, send } = setup();

  await starter.start("subscription_grant_access", grant);
  await starter.start("subscription_grant_access", { ...grant });
  await starter.start("subscription_grant_access", {
    ...grant,
    metadata: { ...grant.metadata, eventId: "evt_2" },
  });

  const names = send.mock.calls.map(([command]) => command.input.DurableExecutionName);
  expect(names[1]).toBe(names[0]);
  expect(names[2]).not.toBe(names[0]);
});

test("start propagates a failed start so the queue retries the event", async () => {
  const { starter, send } = setup();
  const failure = new Error("throttled");
  send.mockRejectedValueOnce(failure);

  await expect(starter.start("subscription_grant_access", grant)).rejects.toBe(failure);
});
