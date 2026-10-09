import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { project } from '../../../testing/bundle.mjs';

test('the type checker rejects dependency lists that do not match the constructor', async t => {
  // The decorator's dependency list replaces runtime metadata, so a mismatch must fail the build.
  const directory = await mkdtemp(path.join(tmpdir(), 'lambda-typecheck-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'tsconfig.json'), JSON.stringify({
    extends: path.join(project, 'tsconfig.json'),
    // Type libraries resolve from the fixture directory, and the fixture needs none.
    compilerOptions: { noEmit: true, rootDir: path.parse(directory).root, types: [] },
    include: ['fixture.ts'],
  }));
  await writeFile(path.join(directory, 'fixture.ts'), `
    import { Injectable } from "@kernel/decorators/injectable";
    abstract class A { abstract a(): void; }
    abstract class B { abstract b(): void; }
    @Injectable(A, B) export class Matching { constructor(a: A, b: B) {} }
    @Injectable(B, A) export class Swapped { constructor(a: A, b: B) {} }
    @Injectable(A) export class Missing { constructor(a: A, b: B) {} }
  `);

  const result = spawnSync(process.execPath, [path.join(project, 'node_modules/typescript/bin/tsc'), '-p', directory], {
    encoding: 'utf8',
  });
  const errorLines = result.stdout.split('\n').filter(line => line.includes('error TS'));

  assert.equal(errorLines.length, 2, result.stdout);
  assert.match(errorLines[0], /fixture\.ts\(6,/);
  assert.match(errorLines[1], /fixture\.ts\(7,/);
});
