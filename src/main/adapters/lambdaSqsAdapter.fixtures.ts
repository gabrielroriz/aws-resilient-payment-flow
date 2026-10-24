import { DeadLetterQueue } from "@application/ports/DeadLetterQueue";
import type { SQSEvent, SQSRecord } from "aws-lambda";
import { vi } from "vitest";

// Records the messages parked instead of sending them to SQS.
export function deadLetterQueue() {
  return {
    park: vi.fn<DeadLetterQueue["park"]>(async () => {}),
  } satisfies DeadLetterQueue;
}

export function sqsEvent(...bodies: unknown[]): SQSEvent {
  return {
    Records: bodies.map((body, index): SQSRecord => ({
      messageId: `message-${index}`,
      receiptHandle: `receipt-${index}`,
      body: JSON.stringify(body),
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: "1791633600000",
        SenderId: "local",
        ApproximateFirstReceiveTimestamp: "1791633600000",
        MessageGroupId: "gatewayGlobal",
      },
      messageAttributes: {},
      md5OfBody: "unused",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:us-east-1:000000000000:webhook_events.fifo",
      awsRegion: "us-east-1",
    })),
  };
}
