import { MessageHandler } from "@application/contracts/MessageHandler";
import { BaseError } from "@application/errors/BaseError";
import { ErrorQueueInvalidMessage } from "@application/errors/queue/ErrorQueueInvalidMessage";
import { ErrorQueueMalformedMessage } from "@application/errors/queue/ErrorQueueMalformedMessage";
import { DeadLetterQueue } from "@application/ports/DeadLetterQueue";
import { InvocationContext } from "@application/ports/InvocationContext";
import { Logger } from "@application/ports/Logger";
import { validatePayload } from "@kernel/decorators/schema";
import { parseJson } from "@kernel/utils/json";
import { errorLogFields } from "@main/utils/errors";
import type { Context, SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";

// Processes FIFO groups in order and acknowledges only completed or parked messages.
// The handler receives only messages that pass its schema.
export function lambdaSqsAdapter(
  handler: MessageHandler,
  logger: Logger,
  invocationContext: InvocationContext,
  deadLetters: DeadLetterQueue,
) {
  return (event: SQSEvent, context: Context): Promise<SQSBatchResponse> =>
    invocationContext.withContext(context.getRemainingTimeInMillis(), () =>
      logger.withContext({ lambdaRequestId: context.awsRequestId }, async () => {
        // Records without a group ID share one failure boundary.
        const failedGroups = new Set<string | undefined>();
        const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];

        for (const record of event.Records) {
          const groupId = record.attributes.MessageGroupId;
          if (failedGroups.has(groupId)) {
            batchItemFailures.push({ itemIdentifier: record.messageId });
            continue;
          }
          // Every entry logged while handling the message names it.
          const settled = await logger.withContext(messageFields(record), async () => {
            try {
              await handle(handler, record);
              return true;
            } catch (error) {
              logger.error("queue_message_error", errorLogFields(error));
              // Retrying cannot help, so the group moves on without the message.
              const retryable = !(error instanceof BaseError) || error.retryable;
              return !retryable && park(record, error, logger, deadLetters);
            }
          });

          if (!settled) {
            // A failed group cannot advance, but other groups can still run.
            failedGroups.add(groupId);
            batchItemFailures.push({ itemIdentifier: record.messageId });
          }
        }
        return { batchItemFailures };
      }),
    );
}

async function handle(handler: MessageHandler, record: SQSRecord): Promise<void> {
  const body = parseJson(record.body);
  // Syntax errors can quote the body; keep payment data out of failure logs.
  if (body === undefined) throw new ErrorQueueMalformedMessage();
  const message = validatePayload(handler, body);
  if (!message.success) throw new ErrorQueueInvalidMessage(message.issues);
  await handler.handle(message.data);
}

// Returns false when the message could not be parked, so SQS delivers it again.
async function park(
  record: SQSRecord,
  error: unknown,
  logger: Logger,
  deadLetters: DeadLetterQueue,
): Promise<boolean> {
  try {
    await deadLetters.park({
      body: record.body,
      groupId: record.attributes.MessageGroupId ?? record.messageId,
      errorCode: errorLogFields(error).errorCode,
      receiveCount: Number(record.attributes.ApproximateReceiveCount),
    });
    logger.error("queue_message_parked");
    return true;
  } catch (parkError) {
    logger.error("queue_message_park_failed", errorLogFields(parkError));
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
