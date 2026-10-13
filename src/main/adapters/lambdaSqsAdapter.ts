import { MessageHandler } from "@application/contracts/MessageHandler";
import { ErrorQueueInvalidMessage } from "@application/errors/queue/ErrorQueueInvalidMessage";
import { ErrorQueueMalformedMessage } from "@application/errors/queue/ErrorQueueMalformedMessage";
import { validatePayload } from "@kernel/decorators/schema";
import { parseJson } from "@kernel/utils/json";
import { errorLogFields } from "@main/utils/errors";
import type { SQSEvent, SQSBatchResponse } from "aws-lambda";

// Processes FIFO batches in order and acknowledges only the messages that completed. Each message
// is validated against the handler's schema, so the handler receives only messages it can read.
export function lambdaSqsAdapter(handler: MessageHandler) {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    for (const [index, record] of event.Records.entries()) {
      try {
        const body = parseJson(record.body);
        // Syntax errors can include body fragments; keep payment data out of failure logs.
        if (body === undefined) throw new ErrorQueueMalformedMessage();
        const message = validatePayload(handler, body);
        if (!message.success) throw new ErrorQueueInvalidMessage(message.issues);
        await handler.handle(message.data);
      } catch (error) {
        console.error(
          JSON.stringify({
            logType: "queue_message_error",
            messageId: record.messageId,
            messageGroupId: record.attributes.MessageGroupId,
            receiveCount: record.attributes.ApproximateReceiveCount,
            eventSourceARN: record.eventSourceARN,
            ...errorLogFields(error),
          }),
        );
        // Stop at the first failure: acknowledging later messages would break FIFO ordering.
        return {
          batchItemFailures: event.Records.slice(index).map(({ messageId }) => ({
            itemIdentifier: messageId,
          })),
        };
      }
    }
    return { batchItemFailures: [] };
  };
}
