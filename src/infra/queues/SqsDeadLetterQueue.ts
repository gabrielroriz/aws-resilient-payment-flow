import { GetQueueUrlCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { DeadLetterQueue } from "@application/ports/DeadLetterQueue";
import { AppConfig } from "@infra/config/AppConfig";
import { Injectable } from "@kernel/decorators/injectable";
import { randomId } from "@kernel/utils/crypto";

// Parks failed messages in the webhook events' FIFO dead-letter queue.
@Injectable(AppConfig)
export class SqsDeadLetterQueue implements DeadLetterQueue {
  // The region comes from the Lambda environment, and locally so does the endpoint.
  readonly sqs = new SQSClient({});
  // Looked up by name once, then reused for the execution environment's lifetime.
  private queueUrl?: string;

  constructor(private readonly config: AppConfig) {}

  async park({ body, groupId, errorCode, receiveCount }: DeadLetterQueue.Message) {
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: await this.getQueueUrl(),
        MessageBody: body,
        // A redriven message rejoins its group in the main queue.
        MessageGroupId: groupId,
        // Each park is new, so a redriven message parked again is never dropped.
        MessageDeduplicationId: randomId(),
        // Operators see why the message is here without opening the logs.
        MessageAttributes: {
          errorCode: { DataType: "String", StringValue: errorCode },
          receiveCount: { DataType: "Number", StringValue: String(receiveCount) },
        },
      }),
    );
  }

  private async getQueueUrl(): Promise<string | undefined> {
    if (this.queueUrl === undefined) {
      const { name } = this.config.deadLetterQueues.webhookEvents;
      const { QueueUrl } = await this.sqs.send(new GetQueueUrlCommand({ QueueName: name }));
      this.queueUrl = QueueUrl;
    }
    return this.queueUrl;
  }
}
