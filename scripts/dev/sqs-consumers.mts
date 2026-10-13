import {
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  type SQSClient,
  type Message,
} from '@aws-sdk/client-sqs';
import type { SQSRecord } from 'aws-lambda';
import type { Invoke, LocalConsumer, QueueSource } from './sqs-consumers.types.mts';
import type { TerraformPlan } from './terraform-plan.types.mts';

// Terraform exports settings from its actual mappings, using names that exist before deployment.
export function consumersFromPlan(plan: TerraformPlan): LocalConsumer[] {
  const value = plan.planned_values?.outputs?.local_sqs_consumers?.value;
  if (!value || typeof value !== 'object') {
    throw new Error('The Terraform plan must include the local_sqs_consumers output.');
  }
  return Object.values(value)
    .map((consumer: LocalConsumer) => {
      if (
        !consumer.function_name ||
        !consumer.queue_name ||
        !Number.isInteger(consumer.batch_size) ||
        consumer.batch_size < 1 ||
        consumer.batch_size > 10 ||
        typeof consumer.enabled !== 'boolean' ||
        !Array.isArray(consumer.function_response_types)
      ) {
        throw new Error('Invalid local SQS consumer configuration in the Terraform plan.');
      }
      return consumer;
    })
    .filter(({ enabled }) => enabled);
}

// One local delivery: failed invocations leave the entire batch for visibility timeout and redrive.
export async function consumeBatch(
  sqs: SQSClient,
  consumer: LocalConsumer,
  source: QueueSource,
  invoke: Invoke,
): Promise<void> {
  const { Messages = [] } = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: source.url,
      MaxNumberOfMessages: consumer.batch_size,
      WaitTimeSeconds: 20,
      MessageSystemAttributeNames: ['All'],
      MessageAttributeNames: ['All'],
    }),
  );
  if (!Messages.length) return;

  const response = await invoke(consumer.function_name, {
    Records: Messages.map((message) => toRecord(message, source)),
  });
  const failed = consumer.function_response_types.includes('ReportBatchItemFailures')
    ? failedIds(response, Messages)
    : new Set<string>();
  const succeeded = Messages.filter((message) => !failed.has(message.MessageId!));
  if (!succeeded.length) return;

  const result = await sqs.send(
    new DeleteMessageBatchCommand({
      QueueUrl: source.url,
      Entries: succeeded.map((message, index) => ({
        Id: String(index),
        ReceiptHandle: message.ReceiptHandle!,
      })),
    }),
  );
  if (result.Failed?.length) {
    throw new Error(`Local SQS could not acknowledge ${result.Failed.length} messages.`);
  }
}

function failedIds(response: unknown, messages: Message[]): Set<string> {
  // An invalid response must never turn into a successful acknowledgement of the batch.
  if (
    !response ||
    typeof response !== 'object' ||
    !('batchItemFailures' in response) ||
    !Array.isArray(response.batchItemFailures)
  ) {
    throw new Error('Lambda returned an invalid partial batch response.');
  }
  const ids = new Set(messages.map(({ MessageId }) => MessageId));
  const failed = new Set<string>();
  for (const failure of response.batchItemFailures) {
    if (
      !failure ||
      typeof failure.itemIdentifier !== 'string' ||
      !ids.has(failure.itemIdentifier)
    ) {
      throw new Error('Lambda returned an unknown failed message ID.');
    }
    failed.add(failure.itemIdentifier);
  }
  return failed;
}

function toRecord(message: Message, source: QueueSource): SQSRecord {
  return {
    messageId: message.MessageId!,
    receiptHandle: message.ReceiptHandle!,
    body: message.Body ?? '',
    attributes: message.Attributes as SQSRecord['attributes'],
    messageAttributes: Object.fromEntries(
      Object.entries(message.MessageAttributes ?? {}).map(([name, value]) => [
        name,
        {
          dataType: value.DataType!,
          stringValue: value.StringValue,
          binaryValue: value.BinaryValue && Buffer.from(value.BinaryValue).toString('base64'),
        },
      ]),
    ),
    md5OfBody: message.MD5OfBody!,
    eventSource: 'aws:sqs',
    eventSourceARN: source.arn,
    awsRegion: source.region,
  };
}
