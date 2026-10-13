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

test('HTTP and SQS functions are accepted, with http as the default trigger', async () => {
  const registry = {
    api: { entry: 'src/api.ts', http_method: 'POST', path: '/api' },
    explicit: { entry: 'src/explicit.ts', trigger: 'http' },
    worker: { entry: 'src/worker.ts', trigger: 'sqs' },
  };
  await expect(extractAndValidateLambdas(await registryOf(registry))).resolves.toEqual(registry);
});

test('an unknown trigger is rejected', async () => {
  const root = await registryOf({ worker: { entry: 'src/worker.ts', trigger: 'sns' } });
  await expect(extractAndValidateLambdas(root)).rejects.toThrow(
    'Invalid trigger for worker: expected http or sqs',
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
