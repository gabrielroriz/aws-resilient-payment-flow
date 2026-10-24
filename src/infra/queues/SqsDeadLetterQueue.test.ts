import { GetQueueUrlCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DeadLetterQueue } from "@application/ports/DeadLetterQueue";
import { AppConfig } from "@infra/config/AppConfig";
import { SqsDeadLetterQueue } from "@infra/queues/SqsDeadLetterQueue";
import { beforeEach, expect, test, vi, type MockInstance } from "vitest";

// A name unlike the deployed one shows that the queue comes from configuration.
const queueName = "configured_dlq.fifo";
const queueUrl = `https://sqs.us-east-1.amazonaws.com/123456789012/${queueName}`;

const message: DeadLetterQueue.Message = {
  body: '{"provider":"gatewayGlobal"}',
  groupId: "group-1",
  errorCode: "QUEUE_INVALID_MESSAGE",
  receiveCount: 2,
};

beforeEach(() => {
  vi.stubEnv("WEBHOOK_EVENTS_DLQ_NAME", queueName);
});

// Stubs the SDK call so tests never reach AWS, answering the lookup with `queueUrl`.
// The SDK's send is overloaded; tests only use its promise form.
function stubSend(queue: SqsDeadLetterQueue) {
  const send = vi.spyOn(queue.sqs, "send") as unknown as MockInstance<
    (command: GetQueueUrlCommand | SendMessageCommand) => Promise<unknown>
  >;
  return send.mockImplementation(async (command) =>
    command instanceof GetQueueUrlCommand ? { QueueUrl: queueUrl } : {},
  );
}

function sentMessages(send: ReturnType<typeof stubSend>) {
  return send.mock.calls
    .map(([command]) => command)
    .filter((command) => command instanceof SendMessageCommand)
    .map((command) => command.input);
}

test("park sends the body to the configured dead-letter queue in its group, saying why", async () => {
  const queue = new SqsDeadLetterQueue(new AppConfig());
  const send = stubSend(queue);

  await queue.park(message);

  const [lookup] = send.mock.calls.map(([command]) => command);
  expect(lookup.input).toEqual({ QueueName: queueName });
  expect(sentMessages(send)).toEqual([
    {
      QueueUrl: queueUrl,
      MessageBody: message.body,
      MessageGroupId: "group-1",
      MessageDeduplicationId: expect.any(String),
      MessageAttributes: {
        errorCode: { DataType: "String", StringValue: "QUEUE_INVALID_MESSAGE" },
        receiveCount: { DataType: "Number", StringValue: "2" },
      },
    },
  ]);
});

test("park looks the queue up once and gives every park its own deduplication ID", async () => {
  const queue = new SqsDeadLetterQueue(new AppConfig());
  const send = stubSend(queue);

  await queue.park(message);
  await queue.park(message);

  expect(send.mock.calls.filter(([command]) => command instanceof GetQueueUrlCommand)).toHaveLength(
    1,
  );
  const [first, again] = sentMessages(send);
  expect(again.MessageDeduplicationId).not.toBe(first.MessageDeduplicationId);
});

test("park fails, naming the variable, when the queue name is not configured", async () => {
  vi.stubEnv("WEBHOOK_EVENTS_DLQ_NAME", "");
  const queue = new SqsDeadLetterQueue(new AppConfig());
  const send = stubSend(queue);

  await expect(queue.park(message)).rejects.toThrow(/WEBHOOK_EVENTS_DLQ_NAME/);
  expect(send).not.toHaveBeenCalled();
});
