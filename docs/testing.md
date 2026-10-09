# Testing

## Requirements

Node.js 24 and npm. The current tests run locally without Docker, SAM, Terraform, or AWS credentials.

## Run tests

From the repository root:

```bash
npm ci
npm test
```

`npm test` uses Node.js's built-in test runner for `tests/*.test.mjs`. Tests build their own fixtures in temporary directories; a separate application build is not required.

Tests for TypeScript code use [`tests/support/bundle.mjs`](../tests/support/bundle.mjs), which bundles an entry file or inline source with the production esbuild settings and project path aliases, then loads it in the test process.

## Current coverage

| Test file | Check | Expected behavior |
|---|---|---|
| [`build.test.mjs`](../tests/build.test.mjs) | Standalone bundles | Handlers run without their original sources or installed dependencies |
| | Dependency isolation | Bundles include needed local and npm imports and exclude unrelated code |
| | Missing dependency | The build fails instead of producing a broken bundle |
| [`di.test.mjs`](../tests/di.test.mjs) | Port binding | Ports resolve to their bound adapters, with one shared instance per class |
| | Missing binding | Resolution fails with a message naming the port |
| | Dependency lists | Type checking rejects `@Injectable` lists that do not match the constructor |
| [`http.test.mjs`](../tests/http.test.mjs) | Health function | The registered entry answers `200` through every layer |
| | HTTP adapter | Requests reach the controller; errors map to the documented responses and logs |
| [`http-utils.test.mjs`](../tests/http-utils.test.mjs) | Body parsing | `parseHttpBody` returns any JSON value, `undefined` for an empty body, and `BadRequest` for malformed JSON |
| | JSON responses | `buildHttpResponse` serializes any body except `undefined`, which sends only the status code |

These tests do not cover API Gateway integration or payment behavior. See [TODO](../TODO.md) for planned coverage and [Development](development.md#run-locally) for manual HTTP testing with SAM.
