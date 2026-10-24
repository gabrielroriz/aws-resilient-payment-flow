import { GetQueueUrlCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { WebhookEventDispatcher } from "@application/ports/webhooks/WebhookEventDispatcher";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { AppConfig } from "@infra/config/AppConfig";
import { Injectable } from "@kernel/decorators/injectable";
import { createHash } from "node:crypto";

// Dispatches webhook events for processing through an SQS FIFO queue.
// Each subject's events form one message group, so SQS keeps their arrival order.
@Injectable(AppConfig)
export class SqsWebhookEventDispatcher implements WebhookEventDispatcher {
  // The region comes from the Lambda environment, and locally so does the endpoint.
  // Locally, the queue lookup below therefore returns the local queue.
  readonly sqs = new SQSClient({});
  // Looked up by name once, then reused for the execution environment's lifetime.
  private queueUrl?: string;

  constructor(private readonly config: AppConfig) {}

  async dispatch({ provider, providerEventId, subject }: WebhookEventDispatcher.Event) {
    // Only the identity travels, so the stored event stays the source of truth.
    // Messages also stay far below the SQS size limit, whatever the payload size.
    const message: SqsWebhookEventDispatcher.Message = { provider, providerEventId };
    // Provider IDs may contain characters SQS rejects, so both IDs are digests.
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: await this.getQueueUrl(),
        MessageBody: JSON.stringify(message),
        // An event without a subject waits for nothing, so it gets its own group.
        MessageGroupId: digest(
          subject ? [provider, subject.type, subject.id] : [provider, providerEventId],
        ),
        // SQS drops a message whose ID repeats within five minutes.
        MessageDeduplicationId: digest([provider, providerEventId]),
      }),
    );
  }

  private async getQueueUrl(): Promise<string | undefined> {
    if (this.queueUrl === undefined) {
      // A missing name fails with a 5xx, so the provider retries until it is set.
      const { name } = this.config.queues.webhookEvents;
      const { QueueUrl } = await this.sqs.send(new GetQueueUrlCommand({ QueueName: name }));
      this.queueUrl = QueueUrl;
    }
    return this.queueUrl;
  }
}

export namespace SqsWebhookEventDispatcher {
  // Body of each queued message, as JSON.
  export type Message = WebhookEventRepository.EventId;
}

// A JSON array keeps parts distinct, so `a#b` + `c` never matches `a` + `b#c`.
function digest(parts: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
