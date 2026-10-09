import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import options from '../build/esbuild.config.mjs';

export const project = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

// Bundle with the production esbuild settings and the project tsconfig, so tests run the
// same decorator lowering and path aliases as the deployed Lambdas.
async function load(t, input) {
  const result = await build({
    ...options,
    ...input,
    absWorkingDir: project,
    tsconfig: path.join(project, 'tsconfig.json'),
  });
  const directory = await mkdtemp(path.join(tmpdir(), 'lambda-unit-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'index.js');
  await writeFile(file, result.outputFiles[0].contents);
  return require(file);
}

/** Load a project entry file, such as a registered Lambda handler. */
export const loadEntry = (t, entry) => load(t, { entryPoints: [entry] });

/** Load inline TypeScript that may import project code through its path aliases. */
export const loadSource = (t, contents) =>
  load(t, { stdin: { contents, loader: 'ts', resolveDir: project, sourcefile: 'fixture.ts' } });

/** A minimal API Gateway HTTP API (payload 2.0) event. */
export const httpEvent = (overrides = {}) => ({
  routeKey: 'GET /test',
  rawPath: '/test',
  headers: {},
  requestContext: { requestId: 'test-request' },
  ...overrides,
});
