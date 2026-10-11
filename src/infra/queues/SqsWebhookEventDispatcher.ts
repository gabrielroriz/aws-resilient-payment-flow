import { GetQueueUrlCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { WebhookEventDispatcher } from "@application/ports/webhooks/WebhookEventDispatcher";
import { WebhookEventRepository } from "@application/ports/webhooks/WebhookEventRepository";
import { AppConfig } from "@infra/config/AppConfig";
import { Injectable } from "@kernel/decorators/injectable";
import { createHash } from "node:crypto";

/**
 * Dispatches webhook events to an SQS FIFO queue, from which processing receives them. Each
 * provider's events form one message group, so SQS delivers them in the order they were received.
 */
@Injectable(AppConfig)
export class SqsWebhookEventDispatcher implements WebhookEventDispatcher {
  // The region comes from the Lambda environment, and locally so does the endpoint, which makes
  // the queue lookup below return the local queue.
  readonly sqs = new SQSClient({});
  // Looked up by name on the first dispatch, then reused for the execution environment's lifetime.
  private queueUrl?: string;

  constructor(private readonly config: AppConfig) {}

  async dispatch({ provider, providerEventId }: WebhookEventRepository.EventId): Promise<void> {
    // Only the event's identity travels: the stored event stays the single source of truth, and
    // messages stay far below the SQS size limit whatever the payload size.
    const message: SqsWebhookEventDispatcher.Message = { provider, providerEventId };
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: await this.getQueueUrl(),
        MessageBody: JSON.stringify(message),
        MessageGroupId: provider,
        // SQS drops a message with the same ID sent within five minutes, such as one from a quick
        // provider retry. Provider event IDs may contain characters SQS rejects here, so the ID is
        // a digest of the event's identity.
        MessageDeduplicationId: createHash("sha256").update(JSON.stringify([provider, providerEventId])).digest("hex"),
      }),
    );
  }

  private async getQueueUrl(): Promise<string | undefined> {
    if (this.queueUrl === undefined) {
      // A missing name fails the request with a 5xx, so the provider retries until it is configured.
      const { name } = this.config.queues.webhookEvents;
      const { QueueUrl } = await this.sqs.send(new GetQueueUrlCommand({ QueueName: name }));
      this.queueUrl = QueueUrl;
    }
    return this.queueUrl;
  }
}

export namespace SqsWebhookEventDispatcher {
  /** Body of each queued message, as JSON. */
  export type Message = WebhookEventRepository.EventId;
}
