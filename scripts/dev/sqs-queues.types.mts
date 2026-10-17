import type { QueueAttributeName } from '@aws-sdk/client-sqs';

// A queue as the local SQS service should have it.
export type LocalQueue = {
  name: string;
  // Attributes the queue is created with, apart from its redrive policy.
  attributes: Partial<Record<QueueAttributeName, string>>;
  // The dead-letter queue, by name, for messages received too many times.
  deadLetter?: { queueName: string; maxReceiveCount: number };
};

// Planned values of an aws_sqs_queue resource.
// Values known only after apply are missing.
export type QueueValues = {
  name: string;
  fifo_queue: boolean;
  content_based_deduplication: boolean;
  visibility_timeout_seconds: number;
  delay_seconds: number;
  receive_wait_time_seconds: number;
  redrive_policy?: string | null;
};
