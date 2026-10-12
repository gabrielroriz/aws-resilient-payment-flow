import type { SQSEvent } from 'aws-lambda';

export type LocalConsumer = {
  function_name: string;
  queue_name: string;
  batch_size: number;
  enabled: boolean;
  function_response_types: string[];
};

export type QueueSource = { url: string; arn: string; region: string };
export type Invoke = (functionName: string, event: SQSEvent) => Promise<unknown>;
