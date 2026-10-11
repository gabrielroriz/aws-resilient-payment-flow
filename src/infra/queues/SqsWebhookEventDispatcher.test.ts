import { GetQueueUrlCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import { AppConfig } from "@infra/config/AppConfig";
import { SqsWebhookEventDispatcher } from "@infra/queues/SqsWebhookEventDispatcher";
import { beforeEach, expect, test, vi, type MockInstance } from "vitest";

// A name unlike the deployed one shows that the queue comes from configuration.
const queueName = "configured_events.fifo";
const queueUrl = `https://sqs.us-east-1.amazonaws.com/123456789012/${queueName}`;

beforeEach(() => {
  vi.stubEnv("WEBHOOK_EVENTS_QUEUE_NAME", queueName);
});

function newDispatcher() {
  return new SqsWebhookEventDispatcher(new AppConfig());
}

// Replaces the SDK call, answering the queue lookup with `queueUrl`, so tests check the commands
// sent without reaching AWS. The SDK's send is overloaded; tests only use its promise form.
function stubSend(dispatcher: SqsWebhookEventDispatcher) {
  const send = vi.spyOn(dispatcher.sqs, "send") as unknown as MockInstance<
    (command: GetQueueUrlCommand | SendMessageCommand) => Promise<unknown>
  >;
  return send.mockImplementation(async (command) => (command instanceof GetQueueUrlCommand ? { QueueUrl: queueUrl } : {}));
}

function sentMessages(send: ReturnType<typeof stubSend>) {
  return send.mock.calls.map(([command]) => command).filter((command) => command instanceof SendMessageCommand);
}

test("dispatch sends the event's identity to the provider's message group of the configured FIFO queue", async () => {
  const dispatcher = newDispatcher();
  const send = stubSend(dispatcher);

  await dispatcher.dispatch({ provider: "gatewayGlobal", providerEventId: "evt_1" });

  const [lookup, message] = send.mock.calls.map(([command]) => command);
  expect(lookup).toBeInstanceOf(GetQueueUrlCommand);
  expect(lookup.input).toEqual({ QueueName: queueName });
  expect(message).toBeInstanceOf(SendMessageCommand);
  expect(message.input).toEqual({
    QueueUrl: queueUrl,
    MessageBody: '{"provider":"gatewayGlobal","providerEventId":"evt_1"}',
    MessageGroupId: "gatewayGlobal",
    MessageDeduplicationId: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
});

test("dispatch fails, naming the variable, when the queue name is not configured", async () => {
  vi.stubEnv("WEBHOOK_EVENTS_QUEUE_NAME", "");
  const dispatcher = newDispatcher();
  const send = stubSend(dispatcher);

  await expect(dispatcher.dispatch({ provider: "gatewayGlobal", providerEventId: "evt_1" })).rejects.toThrow(
    /WEBHOOK_EVENTS_QUEUE_NAME/,
  );
  expect(send).not.toHaveBeenCalled();
});

test("dispatch looks the queue up once and reuses its URL", async () => {
  const dispatcher = newDispatcher();
  const send = stubSend(dispatcher);

  await dispatcher.dispatch({ provider: "gatewayGlobal", providerEventId: "evt_1" });
  await dispatcher.dispatch({ provider: "gatewayGlobal", providerEventId: "evt_2" });

  expect(send.mock.calls.filter(([command]) => command instanceof GetQueueUrlCommand)).toHaveLength(1);
  expect(sentMessages(send).map((command) => command.input.QueueUrl)).toEqual([queueUrl, queueUrl]);
});

test("dispatch gives an event the same deduplication ID every time, distinct from other providers' events", async () => {
  const dispatcher = newDispatcher();
  const send = stubSend(dispatcher);

  await dispatcher.dispatch({ provider: "gatewayGlobal", providerEventId: "evt_1" });
  await dispatcher.dispatch({ provider: "gatewayGlobal", providerEventId: "evt_1" });
  // Providers reuse each other's event IDs, which must not make SQS drop the other event.
  await dispatcher.dispatch({ provider: "gatewayBrazil", providerEventId: "evt_1" });

  const [first, repeated, otherProvider] = sentMessages(send).map((command) => command.input.MessageDeduplicationId);
  expect(repeated).toBe(first);
  expect(otherProvider).not.toBe(first);
});
