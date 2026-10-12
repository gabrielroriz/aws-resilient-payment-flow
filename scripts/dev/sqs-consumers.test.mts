import { DeleteMessageBatchCommand, ReceiveMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import { consumeBatch, consumersFromPlan } from './sqs-consumers.mts';
import type { LocalConsumer } from './sqs-consumers.types.mts';
import { expect, test, vi } from 'vitest';

const consumer: LocalConsumer = {
  function_name: 'webhook_worker', queue_name: 'webhook_events.fifo', batch_size: 10,
  enabled: true, function_response_types: ['ReportBatchItemFailures'],
};
const source = { url: 'http://localhost:9324/queue', arn: 'arn:aws:sqs:us-east-1:local:queue', region: 'us-east-1' };
const messages = [0, 1, 2].map((id) => ({
  MessageId: `m${id}`, ReceiptHandle: `r${id}`, Body: '{"provider":"gatewayGlobal","providerEventId":"evt"}',
  Attributes: { MessageGroupId: 'gatewayGlobal', ApproximateReceiveCount: '2' }, MD5OfBody: 'md5',
}));

function setup() {
  const send = vi.fn().mockResolvedValueOnce({ Messages: messages }).mockResolvedValue({});
  return { send, sqs: { send } as unknown as SQSClient };
}

test('undeployed mappings use names from the plan and disabled mappings are not polled', () => {
  const plan = { planned_values: { outputs: { local_sqs_consumers: { value: {
    worker: consumer, disabled: { ...consumer, enabled: false },
  } } } } };
  expect(consumersFromPlan(plan)).toEqual([consumer]);
  expect(() => consumersFromPlan({})).toThrow('local_sqs_consumers');
});

test('local consumption emits AWS-shaped batches and deletes only successful records', async () => {
  const { send, sqs } = setup();
  const invoke = vi.fn().mockResolvedValue({ batchItemFailures: [{ itemIdentifier: 'm1' }, { itemIdentifier: 'm2' }] });
  await consumeBatch(sqs, consumer, source, invoke);
  expect(send.mock.calls[0][0]).toBeInstanceOf(ReceiveMessageCommand);
  expect(invoke).toHaveBeenCalledWith('webhook_worker', { Records: expect.arrayContaining([
    expect.objectContaining({ messageId: 'm0', receiptHandle: 'r0', eventSource: 'aws:sqs', eventSourceARN: source.arn,
      attributes: { MessageGroupId: 'gatewayGlobal', ApproximateReceiveCount: '2' } }),
  ]) });
  expect(send.mock.calls[1][0]).toBeInstanceOf(DeleteMessageBatchCommand);
  expect(send.mock.calls[1][0].input.Entries).toEqual([{ Id: '0', ReceiptHandle: 'r0' }]);
});

test.each([{}, { errorMessage: 'runtime failure' }, { batchItemFailures: [{ itemIdentifier: 'unknown' }] },
  { batchItemFailures: [{ itemIdentifier: null }] }])('invalid Lambda responses never delete a message: %j', async (response) => {
  const { send, sqs } = setup();
  await expect(consumeBatch(sqs, consumer, source, vi.fn().mockResolvedValue(response))).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(1);
});

test('invocation errors leave all records for visibility timeout and redrive', async () => {
  const { send, sqs } = setup();
  await expect(consumeBatch(sqs, consumer, source, vi.fn().mockRejectedValue(new Error('timeout')))).rejects.toThrow('timeout');
  expect(send).toHaveBeenCalledTimes(1);
});

test('an empty poll does not invoke the function', async () => {
  const send = vi.fn().mockResolvedValue({});
  const invoke = vi.fn();
  await consumeBatch({ send } as unknown as SQSClient, consumer, source, invoke);
  expect(invoke).not.toHaveBeenCalled();
});

test('a successful batch is acknowledged in full', async () => {
  const { send, sqs } = setup();
  await consumeBatch(sqs, consumer, source, vi.fn().mockResolvedValue({ batchItemFailures: [] }));
  expect(send.mock.calls[1][0].input.Entries).toHaveLength(3);
});
