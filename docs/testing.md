# Testing

## Requirements

Node.js 24 and npm. The current tests run locally without Docker, SAM, Terraform, or AWS credentials.

## Run tests

From the repository root:

```bash
npm ci
npm test
```

| Command | Runs |
|---|---|
| `npm test` | Every test and type test once, as CI does |
| `npm run test:watch` | Vitest in watch mode, rerunning the tests affected by each change |
| `npx vitest run <path>` | Only the tests under a file or directory, such as `src/kernel` |

Tests build their own fixtures in temporary directories; a separate application build is not required.

## Test layout

Each test sits next to the module it covers and shares its name, such as `src/main/utils/http.ts` and `src/main/utils/http.test.ts`.

| File | Contains | Run by |
|---|---|---|
| `src/**/<module>.test.ts` | Tests for TypeScript code, which import it through the path aliases | Vitest |
| `src/**/<module>.test-d.ts` | Type tests, which pass only when type checking reports the expected errors | Vitest typecheck, through `tsc` |
| `src/**/<module>.fixtures.ts` | Helpers shared by tests, such as API Gateway test events | Imported by tests |
| `build/<script>.test.mts` | Tests for the build tooling | Vitest |

`npm run build` type-checks every `.ts` file under `src/` and every `.mts` file under `build/`, including tests. No Lambda bundle contains test files, because each bundle starts from its entry file.

## How it works

[`vitest.config.mjs`](../vitest.config.mjs) compiles tests the same way the deployed Lambdas are compiled:

| Setting | Effect |
|---|---|
| esbuild TypeScript transform | Compiles `.ts` and `.mts` files with esbuild, the production target, and `tsconfig.json`; Vite's default Oxc transform does not lower standard decorators |
| `resolve.tsconfigPaths` | Resolves `@application/*`, `@infra/*`, `@kernel/*`, and `@main/*` from `tsconfig.json` |
| `typecheck` | Checks `*.test-d.ts` files with `tsc` instead of executing them |
| `restoreMocks` | Restores `vi.spyOn` replacements after each test |

Vitest's type testing is experimental and may change outside SemVer, so `vitest` is pinned to an exact version in `package.json`.

Each test file gets its own module graph, so the `Registry` singleton starts empty in every file but is shared by the tests within a file. Declare the classes a DI test registers inside that test.

Unit tests import entries directly. [`build/bundle.test.mts`](../build/bundle.test.mts) also bundles every registered Lambda with the production settings and loads it, so a missing port binding or a bundling problem fails `npm test`.

## Current coverage

| Test file | Check | Expected behavior |
|---|---|---|
| [`build/index.test.mts`](../build/index.test.mts) | Standalone bundles | Handlers run without their original sources or installed dependencies |
| | Dependency isolation | Bundles include needed local and npm imports and exclude unrelated code |
| | Missing dependency | The build fails instead of producing a broken bundle |
| [`build/bundle.test.mts`](../build/bundle.test.mts) | Registered entries | Every Lambda in `lambdas.json` bundles with the production settings and loads with all its ports bound |
| [`src/kernel/di/Registry.test.ts`](../src/kernel/di/Registry.test.ts) | Port binding | Ports resolve to their bound adapters, with one shared instance per class |
| | Missing binding | Resolution fails with a message naming the port |
| [`src/kernel/decorators/injectable.test-d.ts`](../src/kernel/decorators/injectable.test-d.ts) | Dependency lists | Type checking rejects `@Injectable` lists that do not match the constructor |
| [`src/main/functions/health.test.ts`](../src/main/functions/health.test.ts) | Health function | The entry answers `200` through every layer |
| [`src/main/adapters/lambdaHttpAdapter.test.ts`](../src/main/adapters/lambdaHttpAdapter.test.ts) | HTTP adapter | Requests reach the controller; errors map to the documented responses and logs |
| [`src/main/utils/http.test.ts`](../src/main/utils/http.test.ts) | Body parsing | `parseHttpBody` returns any JSON value, `undefined` for an empty body, and `BadRequest` for malformed JSON |
| | JSON responses | `buildHttpResponse` serializes any body except `undefined`, which sends only the status code |

These tests do not cover API Gateway integration or payment behavior. See [TODO](../TODO.md) for planned coverage and [Development](development.md#run-locally) for manual HTTP testing with SAM.
