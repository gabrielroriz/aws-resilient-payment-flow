import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { extractAndValidateLambdas } from './lambdas.mts';

async function registryOf(registry: unknown): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'lambda-registry-test-'));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'lambdas.json'), JSON.stringify(registry));
  return root;
}

test('HTTP, SQS, and durable functions are accepted, with http as the default trigger', async () => {
  const registry = {
    api: { entry: 'src/api.ts', http_method: 'POST', path: '/api' },
    explicit: { entry: 'src/explicit.ts', trigger: 'http' },
    worker: { entry: 'src/worker.ts', trigger: 'sqs' },
    wf_workflow: { entry: 'src/workflow.ts', trigger: 'durable' },
    wf_configured: {
      entry: 'src/configured.ts',
      trigger: 'durable',
      execution_timeout: 3600,
      retention_period: 7,
    },
  };
  await expect(extractAndValidateLambdas(await registryOf(registry))).resolves.toEqual(registry);
});

test('an unknown trigger is rejected', async () => {
  const root = await registryOf({ worker: { entry: 'src/worker.ts', trigger: 'sns' } });
  await expect(extractAndValidateLambdas(root)).rejects.toThrow(
    'Invalid trigger for worker: expected http, sqs, or durable',
  );
});

test.each([{ http_method: 'POST' }, { path: '/worker' }])(
  'an SQS function with an HTTP route is rejected: %j',
  async (route) => {
    const root = await registryOf({ worker: { entry: 'src/worker.ts', trigger: 'sqs', ...route } });
    await expect(extractAndValidateLambdas(root)).rejects.toThrow(
      'SQS Lambda worker must not declare an HTTP route.',
    );
  },
);

test.each([{ http_method: 'POST' }, { path: '/workflow' }])(
  'a durable function with an HTTP route is rejected: %j',
  async (route) => {
    const root = await registryOf({
      wf_workflow: { entry: 'src/workflow.ts', trigger: 'durable', ...route },
    });
    await expect(extractAndValidateLambdas(root)).rejects.toThrow(
      'Durable Lambda wf_workflow must not declare an HTTP route.',
    );
  },
);

test.each(['execution_timeout', 'retention_period'])(
  'a non-durable function with %s is rejected',
  async (field) => {
    const root = await registryOf({
      worker: { entry: 'src/worker.ts', trigger: 'sqs', [field]: 1 },
    });
    await expect(extractAndValidateLambdas(root)).rejects.toThrow(
      `Lambda worker declares ${field}, which only durable functions use.`,
    );
  },
);

test.each([0, 1.5, '86400'])(
  'a durable function with execution_timeout %j is rejected',
  async (value) => {
    const root = await registryOf({
      wf_workflow: { entry: 'src/workflow.ts', trigger: 'durable', execution_timeout: value },
    });
    await expect(extractAndValidateLambdas(root)).rejects.toThrow(
      'Invalid execution_timeout for wf_workflow: expected a positive integer',
    );
  },
);

test.each([
  ['workflow', { entry: 'src/workflow.ts', trigger: 'durable' }],
  ['wf_worker', { entry: 'src/worker.ts', trigger: 'sqs' }],
  ['wf_api', { entry: 'src/api.ts' }],
])('%s is rejected, since only durable functions start with wf_', async (name, config) => {
  const root = await registryOf({ [name]: config });
  await expect(extractAndValidateLambdas(root)).rejects.toThrow(
    `Lambda ${name} must be durable exactly when its name starts with wf_.`,
  );
});
