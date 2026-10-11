import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  QueueDoesNotExist,
  type QueueAttributeName,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import { plannedResources, type TerraformPlan } from './terraform-plan.mts';

/** A queue as the local SQS service should have it. */
export type LocalQueue = {
  name: string;
  /** Attributes the queue is created with, apart from its redrive policy. */
  attributes: Partial<Record<QueueAttributeName, string>>;
  /** Where messages go after too many receives, naming the dead-letter queue by its queue name. */
  deadLetter?: { queueName: string; maxReceiveCount: number };
};

/** What happened to a local queue when it was brought in line with its definition. */
export type SyncResult = 'created' | 'unchanged' | 'recreated';

// Planned values of an aws_sqs_queue resource. Values known only after apply are missing.
type QueueValues = {
  name: string;
  fifo_queue: boolean;
  content_based_deduplication: boolean;
  visibility_timeout_seconds: number;
  delay_seconds: number;
  receive_wait_time_seconds: number;
  redrive_policy?: string | null;
};

/**
 * Converts every SQS queue in a Terraform plan into the queue to create in the local SQS service,
 * dead-letter queues first so they exist before the queues that use them. Only what changes how
 * requests behave is kept; retention, encryption, and access policies mean nothing locally.
 */
export function queuesFromPlan(plan: TerraformPlan): LocalQueue[] {
  // Named targets remain known even when the deployed redrive policy contains an unknown ARN.
  const redrive = plan.planned_values?.outputs?.local_sqs_redrive?.value as Record<string, LocalQueue['deadLetter']> | undefined;
  const queues = plannedResources<QueueValues>(plan, 'aws_sqs_queue').map(({ values }) => {
    const queue = toLocalQueue(values);
    queue.deadLetter = redrive?.[queue.name] ?? queue.deadLetter;
    return queue;
  });
  const deadLetterNames = new Set(queues.flatMap((queue) => queue.deadLetter?.queueName ?? []));
  return [...queues.filter((queue) => deadLetterNames.has(queue.name)), ...queues.filter((queue) => !deadLetterNames.has(queue.name))];
}

/**
 * Makes the local SQS service match a queue definition. A queue whose attributes differ is deleted
 * and created again, losing its messages: the local service cannot change most attributes of an
 * existing queue, and local messages are disposable.
 */
export async function syncQueue(client: SQSClient, queue: LocalQueue): Promise<SyncResult> {
  const attributes = { ...queue.attributes };
  if (queue.deadLetter) {
    // The planned redrive policy names the deployed dead-letter queue; locally it is the local one.
    const deadLetterQueue = await currentQueue(client, queue.deadLetter.queueName);
    if (!deadLetterQueue) {
      throw new Error(`Dead-letter queue ${queue.deadLetter.queueName} of ${queue.name} is not in the Terraform plan.`);
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
  // Deployed queues can supply their redrive policy directly; undeployed targets use named outputs.
  const redrive = queue.redrive_policy ? JSON.parse(queue.redrive_policy) : undefined;
  return {
    name: queue.name,
    attributes: {
      // Deduplication applies to FIFO queues only, which SQS recognizes by their .fifo name.
      ...(queue.fifo_queue && {
        FifoQueue: 'true',
        ContentBasedDeduplication: String(queue.content_based_deduplication),
      }),
      VisibilityTimeout: String(queue.visibility_timeout_seconds),
      DelaySeconds: String(queue.delay_seconds),
      ReceiveMessageWaitTimeSeconds: String(queue.receive_wait_time_seconds),
    },
    // A queue ARN ends with the queue name, which the local dead-letter queue shares.
    deadLetter: redrive && {
      queueName: String(redrive.deadLetterTargetArn).split(':').at(-1) ?? '',
      maxReceiveCount: Number(redrive.maxReceiveCount),
    },
  };
}

async function currentQueue(client: SQSClient, QueueName: string) {
  try {
    const { QueueUrl } = await client.send(new GetQueueUrlCommand({ QueueName }));
    const { Attributes = {} } = await client.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ['All'] }));
    return { url: QueueUrl, attributes: Attributes };
  } catch (error) {
    if (error instanceof QueueDoesNotExist) {
      return undefined;
    }
    throw error;
  }
}

// Queue descriptions also carry counters and timestamps, so only the defined attributes are
// compared. The redrive policy is compared by content, since its JSON can be formatted either way.
function matches(current: Record<string, string>, defined: Record<string, string>): boolean {
  const redrive = (policy: string | undefined) => {
    const parsed = policy ? JSON.parse(policy) : undefined;
    return JSON.stringify(parsed && [parsed.deadLetterTargetArn, Number(parsed.maxReceiveCount)]);
  };
  return (
    Object.entries(defined).every(([name, value]) => name === 'RedrivePolicy' || current[name] === value) &&
    redrive(current.RedrivePolicy) === redrive(defined.RedrivePolicy)
  );
}
