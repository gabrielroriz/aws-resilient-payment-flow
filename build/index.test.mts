import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, onTestFinished, test } from 'vitest';
import type { LambdaRegistry } from './lambdas.mts';

const project = fileURLToPath(new URL('../', import.meta.url));

async function fixture(files: Record<string, string>, registry: LambdaRegistry): Promise<string> {
  // Exercise the real build in an isolated project without touching application artifacts.
  const root = await mkdtemp(path.join(tmpdir(), 'lambda-build-test-'));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(project, 'build'), path.join(root, 'build'), { recursive: true });
  await mkdir(path.join(root, 'node_modules'));
  // Reuse the installed build tool while keeping each scenario's dependencies independent.
  await symlink(path.join(project, 'node_modules/esbuild'), path.join(root, 'node_modules/esbuild'), 'dir');
  await writeFile(path.join(root, 'lambdas.json'), JSON.stringify(registry));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  return root;
}

test('each bundle runs alone with local and npm imports, excluding unrelated code', async () => {
  // Distinct markers reveal dependency leakage between handlers and from unused files.
  const root = await fixture({
    'src/first.ts': 'import { message } from "./shared"; export const handler = () => message();',
    'src/shared.ts': 'import { value } from "fixture-dependency"; export const message = () => value;',
    'src/second.ts': 'export const handler = () => "SECOND_HANDLER_ONLY";',
    'src/unused.ts': 'throw new Error("UNRELATED_FILE_MUST_NOT_BE_BUNDLED");',
    'node_modules/fixture-dependency/package.json': '{"name":"fixture-dependency","type":"module","main":"index.js"}',
    'node_modules/fixture-dependency/index.js': 'export const value = "BUNDLED_DEPENDENCY";',
  }, { first: { entry: 'src/first.ts' }, second: { entry: 'src/second.ts' } });

  // Deployment can invoke the build from outside the project directory.
  execFileSync(process.execPath, [path.join(root, 'build/index.mts')], { cwd: tmpdir() });
  // Remove the original sources and dependencies to prove runtime independence.
  await rm(path.join(root, 'src'), { recursive: true });
  await rm(path.join(root, 'node_modules'), { recursive: true });
  for (const [name, expected, excluded] of [
    ['first', 'BUNDLED_DEPENDENCY', 'SECOND_HANDLER_ONLY'],
    ['second', 'SECOND_HANDLER_ONLY', 'BUNDLED_DEPENDENCY'],
  ]) {
    const directory = path.join(root, 'dist/bundles', name);
    expect(await readdir(directory)).toEqual(['index.js']);
    const source = await readFile(path.join(directory, 'index.js'), 'utf8');
    expect(source).not.toContain(excluded);
    expect(source).not.toContain('UNRELATED_FILE_MUST_NOT_BE_BUNDLED');
    // A fresh process must execute the packaged handler without the original project.
    expect(execFileSync(process.execPath, ['-e', 'process.stdout.write(require("./index.js").handler())'], {
      cwd: directory, encoding: 'utf8',
    })).toBe(expected);
  }
});

test('a missing dependency stops bundling instead of leaving a broken runtime import', async () => {
  // Surface missing imports during the build, before an unusable package reaches AWS.
  const root = await fixture({
    'src/handler.ts': 'import value from "missing-dependency"; export const handler = () => value;',
  }, { broken: { entry: 'src/handler.ts' } });
  const result = spawnSync(process.execPath, [path.join(root, 'build/index.mts')], { encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Could not resolve "missing-dependency"/);
});
