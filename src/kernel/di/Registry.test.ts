import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from '../../../testing/bundle.mjs';

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
