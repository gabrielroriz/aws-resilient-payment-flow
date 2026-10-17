import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  QueueDoesNotExist,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import type { SyncResult } from './local-resources.types.mts';
import type { LocalQueue, QueueValues } from './sqs-queues.types.mts';
import { plannedResources } from './terraform-plan.mts';
import type { TerraformPlan } from './terraform-plan.types.mts';

// Converts each planned SQS queue into the queue to create in the local SQS service.
// Dead-letter queues come first, so they exist before the queues that use them.
// Only settings that change how requests behave are kept.
export function queuesFromPlan(plan: TerraformPlan): LocalQueue[] {
  // Named targets stay known even when the redrive policy holds an unknown ARN.
  const redrive = plan.planned_values?.outputs?.local_sqs_redrive?.value as
    Record<string, LocalQueue['deadLetter']> | undefined;
  const queues = plannedResources<QueueValues>(plan, 'aws_sqs_queue').map(({ values }) => {
    const queue = toLocalQueue(values);
    queue.deadLetter = redrive?.[queue.name] ?? queue.deadLetter;
    return queue;
  });
  const deadLetterNames = new Set(queues.flatMap((queue) => queue.deadLetter?.queueName ?? []));
  return [
    ...queues.filter((queue) => deadLetterNames.has(queue.name)),
    ...queues.filter((queue) => !deadLetterNames.has(queue.name)),
  ];
}

// Makes the local SQS service match a queue definition.
// A queue whose attributes differ is recreated, losing its messages.
// The local service cannot change most attributes, and its messages are disposable.
export async function syncQueue(client: SQSClient, queue: LocalQueue): Promise<SyncResult> {
  const attributes = { ...queue.attributes };
  if (queue.deadLetter) {
    // The plan names the deployed dead-letter queue; locally it is the local one.
    const deadLetterQueue = await currentQueue(client, queue.deadLetter.queueName);
    if (!deadLetterQueue) {
      throw new Error(
        `Dead-letter queue ${queue.deadLetter.queueName} of ${queue.name} is not in the Terraform plan.`,
      );
    }
    attributes.RedrivePolicy = JSON.stringify({
      deadLetterTargetArn: deadLetterQueue.attributes.QueueArn,
      maxReceiveCount: queue.deadLetter.maxReceiveCount,
    });
  }

  const current = await currentQueue(client, queue.name);
  if (current && matches(current.attributes, attributes)) {
    return 'unchanged';
  }

  if (current) {
    await client.send(new DeleteQueueCommand({ QueueUrl: current.url }));
  }
  await client.send(new CreateQueueCommand({ QueueName: queue.name, Attributes: attributes }));
  return current ? 'recreated' : 'created';
}

function toLocalQueue(queue: QueueValues): LocalQueue {
  // Deployed queues supply their redrive policy; new targets use named outputs.
  const redrive = queue.redrive_policy ? JSON.parse(queue.redrive_policy) : undefined;
  return {
    name: queue.name,
    attributes: {
      // Deduplication applies only to FIFO queues, whose names end in .fifo.
      ...(queue.fifo_queue && {
        FifoQueue: 'true',
        ContentBasedDeduplication: String(queue.content_based_deduplication),
      }),
      VisibilityTimeout: String(queue.visibility_timeout_seconds),
      DelaySeconds: String(queue.delay_seconds),
      ReceiveMessageWaitTimeSeconds: String(queue.receive_wait_time_seconds),
    },
    // A queue ARN ends with its name, which the local dead-letter queue shares.
    deadLetter: redrive && {
      queueName: String(redrive.deadLetterTargetArn).split(':').at(-1) ?? '',
      maxReceiveCount: Number(redrive.maxReceiveCount),
    },
  };
}

async function currentQueue(client: SQSClient, QueueName: string) {
  try {
    const { QueueUrl } = await client.send(new GetQueueUrlCommand({ QueueName }));
    const { Attributes = {} } = await client.send(
      new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ['All'] }),
    );
    return { url: QueueUrl, attributes: Attributes };
  } catch (error) {
    if (error instanceof QueueDoesNotExist) {
      return undefined;
    }
    throw error;
  }
}

// Compares only defined attributes, as queues also report counters and timestamps.
// The redrive policy is compared by content, as its JSON formatting may differ.
function matches(current: Record<string, string>, defined: Record<string, string>): boolean {
  const redrive = (policy: string | undefined) => {
    const parsed = policy ? JSON.parse(policy) : undefined;
    return JSON.stringify(parsed && [parsed.deadLetterTargetArn, Number(parsed.maxReceiveCount)]);
  };
  return (
    Object.entries(defined).every(
      ([name, value]) => name === 'RedrivePolicy' || current[name] === value,
    ) && redrive(current.RedrivePolicy) === redrive(defined.RedrivePolicy)
  );
}
