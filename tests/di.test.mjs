import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadSource, project } from './support/bundle.mjs';

test('resolves ports to bound adapters and shares one instance per class', async t => {
  const result = await loadSource(t, `
    import { Injectable } from "@kernel/decorators/injectable";
    import { Registry } from "@kernel/di/Registry";

    abstract class Port { abstract id(): number; }
    let created = 0;
    @Injectable() class Adapter implements Port { readonly n = ++created; id() { return this.n; } }
    @Injectable(Port) class Inner { constructor(readonly port: Port) {} }
    @Injectable(Port, Inner) class Outer { constructor(readonly port: Port, readonly inner: Inner) {} }

    const registry = Registry.getInstance();
    registry.bind(Port, Adapter);
    const outer = registry.resolve(Outer);
    export const usesAdapter = outer.port instanceof Adapter;
    export const shared = outer.port === outer.inner.port && registry.resolve(Outer) === outer;
    export const instances = created;
  `);

  assert.equal(result.usesAdapter, true);
  assert.equal(result.shared, true);
  assert.equal(result.instances, 1);
});

test('an unbound port fails with a message naming the port', async t => {
  const result = await loadSource(t, `
    import { Injectable } from "@kernel/decorators/injectable";
    import { Registry } from "@kernel/di/Registry";

    abstract class PaymentGateway { abstract charge(): void; }
    @Injectable(PaymentGateway) class UseCase { constructor(readonly gateway: PaymentGateway) {} }

    export const resolve = () => Registry.getInstance().resolve(UseCase);
  `);

  assert.throws(result.resolve, /No provider for PaymentGateway/);
});

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
