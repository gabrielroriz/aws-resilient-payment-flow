import { MessageHandler } from "@application/contracts/MessageHandler";
import { ErrorQueueInvalidMessage } from "@application/errors/queue/ErrorQueueInvalidMessage";
import { ErrorQueueMalformedMessage } from "@application/errors/queue/ErrorQueueMalformedMessage";
import { InvocationContext } from "@application/ports/InvocationContext";
import { Logger } from "@application/ports/Logger";
import { validatePayload } from "@kernel/decorators/schema";
import { parseJson } from "@kernel/utils/json";
import { errorLogFields } from "@main/utils/errors";
import type { Context, SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";

// Processes FIFO groups in order and acknowledges only completed messages.
// The handler receives only messages that pass its schema.
export function lambdaSqsAdapter(
  handler: MessageHandler,
  logger: Logger,
  invocationContext: InvocationContext,
) {
  return (event: SQSEvent, context: Context): Promise<SQSBatchResponse> =>
    invocationContext.withContext(context.getRemainingTimeInMillis(), () =>
      logger.withContext({ lambdaRequestId: context.awsRequestId }, async () => {
        // Records without a group ID share one failure boundary.
        const failedGroups = new Set<string | undefined>();
        const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];

        for (const record of event.Records) {
          const groupId = record.attributes.MessageGroupId;
          // Later records of a failed group are skipped, then retried after it.
          // Ex: in [m1 A, m2 B, m3 A], if m1 fails, m2 completes and m3 is skipped.
          // SQS deletes m2 and redelivers m1, then m3, in their original order.
          if (failedGroups.has(groupId)) {
            batchItemFailures.push({ itemIdentifier: record.messageId });
            continue;
          }
          // Every entry logged while handling the message names it.
          const completed = await logger.withContext(messageFields(record), () =>
            handle(handler, logger, record),
          );

          if (!completed) {
            // A failed group cannot advance, but other groups can still run.
            failedGroups.add(groupId);
            batchItemFailures.push({ itemIdentifier: record.messageId });
          }
        }
        return { batchItemFailures };
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
