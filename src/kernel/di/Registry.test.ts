import { Injectable } from "@kernel/decorators/injectable";
import { Registry } from "@kernel/di/Registry";
import { expect, test } from "vitest";

test("resolves ports to bound adapters and shares one instance per class", () => {
  abstract class Port {
    abstract id(): number;
  }
  let created = 0;
  @Injectable()
  class Adapter implements Port {
    readonly n = ++created;
    id() {
      return this.n;
    }
  }
  @Injectable(Port)
  class Inner {
    constructor(readonly port: Port) {}
  }
  @Injectable(Port, Inner)
  class Outer {
    constructor(
      readonly port: Port,
      readonly inner: Inner,
    ) {}
  }

  const registry = Registry.getInstance();
  registry.bind(Port, Adapter);
  const outer = registry.resolve(Outer);

  expect(outer.port).toBeInstanceOf(Adapter);
  expect(outer.inner.port).toBe(outer.port);
  expect(registry.resolve(Outer)).toBe(outer);
  expect(created).toBe(1);
});

test("an unbound port fails with a message naming the port", () => {
  abstract class PaymentGateway {
    abstract charge(): void;
  }
  @Injectable(PaymentGateway)
  class UseCase {
    constructor(readonly gateway: PaymentGateway) {}
  }

  expect(() => Registry.getInstance().resolve(UseCase)).toThrow(/No provider for PaymentGateway/);
});
