import { MessageHandler } from "@application/contracts/MessageHandler";
import { ErrorQueueInvalidMessage } from "@application/errors/queue/ErrorQueueInvalidMessage";
import { ErrorQueueMalformedMessage } from "@application/errors/queue/ErrorQueueMalformedMessage";
import { InvocationContext } from "@application/ports/InvocationContext";
import { Logger } from "@application/ports/Logger";
import { validatePayload } from "@kernel/decorators/schema";
import { parseJson } from "@kernel/utils/json";
import { errorLogFields } from "@main/utils/errors";
import type { Context, SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";

// Processes FIFO batches in order and acknowledges only the messages that completed.
// The handler receives only messages that pass its schema.
export function lambdaSqsAdapter(
  handler: MessageHandler,
  logger: Logger,
  invocationContext: InvocationContext,
) {
  return (event: SQSEvent, context: Context): Promise<SQSBatchResponse> =>
    invocationContext.withContext(context.getRemainingTimeInMillis(), () =>
      logger.withContext({ lambdaRequestId: context.awsRequestId }, async () => {
        for (const [index, record] of event.Records.entries()) {
          // Every entry logged while handling the message names it.
          const completed = await logger.withContext(messageFields(record), () =>
            handle(handler, logger, record),
          );
          if (!completed) {
            // Stop at the first failure: acknowledging later ones breaks FIFO order.
            return {
              batchItemFailures: event.Records.slice(index).map(({ messageId }) => ({
                itemIdentifier: messageId,
              })),
            };
          }
        }
        return { batchItemFailures: [] };
      }),
    );
}

// Handles one message, logging failures instead of throwing; true if it completed.
async function handle(
  handler: MessageHandler,
  logger: Logger,
  record: SQSRecord,
): Promise<boolean> {
  try {
    const body = parseJson(record.body);
    // Syntax errors can quote the body; keep payment data out of failure logs.
    if (body === undefined) throw new ErrorQueueMalformedMessage();
    const message = validatePayload(handler, body);
    if (!message.success) throw new ErrorQueueInvalidMessage(message.issues);
    await handler.handle(message.data);
    return true;
  } catch (error) {
    logger.error("queue_message_error", errorLogFields(error));
    return false;
  }
}

// The message's identity, group, delivery count, and source queue.
function messageFields(record: SQSRecord): Logger.Fields {
  return {
    messageId: record.messageId,
    messageGroupId: record.attributes.MessageGroupId,
    receiveCount: record.attributes.ApproximateReceiveCount,
    eventSourceARN: record.eventSourceARN,
  };
}
