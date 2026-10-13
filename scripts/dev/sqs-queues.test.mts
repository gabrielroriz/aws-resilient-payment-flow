import { queuesFromPlan } from './sqs-queues.mts';
import { expect, test } from 'vitest';

test('undeployed queues retain redrive settings and create the dead-letter queue first', () => {
  const resource = (name: string) => ({
    mode: 'managed',
    type: 'aws_sqs_queue',
    values: {
      name,
      fifo_queue: true,
      content_based_deduplication: false,
      visibility_timeout_seconds: 180,
      delay_seconds: 0,
      receive_wait_time_seconds: 0,
    },
  });
  const queues = queuesFromPlan({
    planned_values: {
      root_module: { resources: [resource('events.fifo'), resource('failed.fifo')] },
      outputs: {
        local_sqs_redrive: {
          value: { 'events.fifo': { queueName: 'failed.fifo', maxReceiveCount: 5 } },
        },
      },
    },
  });
  expect(queues.map(({ name }) => name)).toEqual(['failed.fifo', 'events.fifo']);
  expect(queues[1]).toMatchObject({
    attributes: { VisibilityTimeout: '180' },
    deadLetter: { queueName: 'failed.fifo', maxReceiveCount: 5 },
  });
});
