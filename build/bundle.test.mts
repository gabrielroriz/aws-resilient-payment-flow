import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, onTestFinished, test, vi } from 'vitest';
import { bundleLambdas } from './bundle.mts';
import { extractAndValidateLambdas } from './lambdas.mts';

const project = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

test('every registered Lambda bundles with the production settings and loads', async () => {
  // Unit tests import entries directly; this proves the minified production bundles load too.
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'lambda-bundle-test-'));
  onTestFinished(() => rm(outputRoot, { recursive: true, force: true }));
  vi.spyOn(console, 'log').mockImplementation(() => {});

  const registry = await extractAndValidateLambdas(project);
  await bundleLambdas(project, registry, outputRoot);
  // Bundles load the AWS SDK at run time, as the Lambda runtime provides it; the installed copy stands in.
  await symlink(path.join(project, 'node_modules'), path.join(outputRoot, 'node_modules'), 'dir');

  for (const name of Object.keys(registry)) {
    // Entries bind ports and resolve their controllers on load, so a missing binding throws here.
    const { handler } = require(path.join(outputRoot, name, 'index.js'));
    expect(handler, name).toBeTypeOf('function');
  }
});
