import { Injectable } from "@kernel/decorators/injectable";
import { test } from "vitest";

// The decorator's dependency list replaces runtime metadata, so a list that does not match the
// constructor must fail type checking. Unused @ts-expect-error directives fail it too.
test("the type checker rejects dependency lists that do not match the constructor", () => {
  abstract class A {
    abstract a(): void;
  }
  abstract class B {
    abstract b(): void;
  }

  @Injectable(A, B)
  class Matching {
    constructor(a: A, b: B) {}
  }

  // @ts-expect-error: the dependencies are listed in the wrong order.
  @Injectable(B, A)
  class Swapped {
    constructor(a: A, b: B) {}
  }

  // @ts-expect-error: a constructor dependency is missing from the list.
  @Injectable(A)
  class Missing {
    constructor(a: A, b: B) {}
  }
});
