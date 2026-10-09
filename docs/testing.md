# Testing

## Requirements

Node.js 24 and npm. The current tests run locally without Docker, SAM, Terraform, or AWS credentials.

## Run tests

From the repository root:

```bash
npm ci
npm test
```

`npm test` uses Node.js's built-in test runner for every `*.test.mjs` file under `build/` and `src/`. Tests build their own fixtures in temporary directories; a separate application build is not required.

## Test layout

Each test file sits next to the module it covers and shares its name, such as `src/main/utils/http.ts` and `src/main/utils/http.test.mjs`. Test files are never bundled, because each Lambda bundle starts from its entry file, and type checking includes only `.ts` files.

Tests for TypeScript code use [`testing/bundle.mjs`](../testing/bundle.mjs), which bundles an entry file or inline source with the production esbuild settings and project path aliases, then loads it in the test process.

## Current coverage

| Test file | Check | Expected behavior |
|---|---|---|
| [`build/index.test.mjs`](../build/index.test.mjs) | Standalone bundles | Handlers run without their original sources or installed dependencies |
| | Dependency isolation | Bundles include needed local and npm imports and exclude unrelated code |
| | Missing dependency | The build fails instead of producing a broken bundle |
| [`src/kernel/di/Registry.test.mjs`](../src/kernel/di/Registry.test.mjs) | Port binding | Ports resolve to their bound adapters, with one shared instance per class |
| | Missing binding | Resolution fails with a message naming the port |
| [`src/kernel/decorators/injectable.test.mjs`](../src/kernel/decorators/injectable.test.mjs) | Dependency lists | Type checking rejects `@Injectable` lists that do not match the constructor |
| [`src/main/functions/health.test.mjs`](../src/main/functions/health.test.mjs) | Health function | The registered entry answers `200` through every layer |
| [`src/main/adapters/lambdaHttpAdapter.test.mjs`](../src/main/adapters/lambdaHttpAdapter.test.mjs) | HTTP adapter | Requests reach the controller; errors map to the documented responses and logs |
| [`src/main/utils/http.test.mjs`](../src/main/utils/http.test.mjs) | Body parsing | `parseHttpBody` returns any JSON value, `undefined` for an empty body, and `BadRequest` for malformed JSON |
| | JSON responses | `buildHttpResponse` serializes any body except `undefined`, which sends only the status code |

These tests do not cover API Gateway integration or payment behavior. See [TODO](../TODO.md) for planned coverage and [Development](development.md#run-locally) for manual HTTP testing with SAM.
