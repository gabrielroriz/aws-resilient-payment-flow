import { GetQueueAttributesCommand, GetQueueUrlCommand, SQSClient } from '@aws-sdk/client-sqs';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { consumersFromPlan, consumeBatch } from './sqs-consumers.mts';
import type { Invoke } from './sqs-consumers.types.mts';

const [planFile, lambdaEndpoint] = process.argv.slice(2);
if (!planFile || !lambdaEndpoint) {
  throw new Error('Usage: node scripts/dev/poll-sqs.mts <plan.json> <local-lambda-endpoint>');
}

const region = 'us-east-1';
const sqs = new SQSClient({
  region,
  endpoint: 'http://localhost:9324',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const consumers = consumersFromPlan(JSON.parse(await readFile(planFile, 'utf8')));

// Wait for SAM first, so its startup does not spend the queues' receive attempts.
for (let attempt = 0; ; attempt++) {
  try {
    await fetch(lambdaEndpoint, { signal: AbortSignal.timeout(1000) });
    break;
  } catch (error) {
    if (attempt >= 59)
      throw new Error('Local Lambda server did not start within 60 seconds.', { cause: error });
    await setTimeout(1000);
  }
}

const invoke: Invoke = async (functionName, event) => {
  const response = await fetch(
    `${lambdaEndpoint}/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
      // Covers container startup; SAM enforces the function's own timeout.
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!response.ok || response.headers.has('x-amz-function-error')) {
    throw new Error(`Local invocation of ${functionName} failed (${response.status}).`);
  }
  return response.json();
};

await Promise.all(
  consumers.map(async (consumer) => {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: consumer.queue_name }));
    const { Attributes } = await sqs.send(
      new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ['QueueArn'] }),
    );
    if (!QueueUrl || !Attributes?.QueueArn)
      throw new Error(`Local queue missing: ${consumer.queue_name}`);
    const source = { url: QueueUrl, arn: Attributes.QueueArn, region };
    console.log(`Polling ${consumer.queue_name} -> ${consumer.function_name}`);
    while (true) {
      try {
        await consumeBatch(sqs, consumer, source, invoke);
      } catch (error) {
        console.error(`Local SQS consumer ${consumer.function_name}:`, error);
        await setTimeout(1000);
      }
    }
  }),
);
