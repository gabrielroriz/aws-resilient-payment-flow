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

## Current coverage

[`tests/build.test.mjs`](../tests/build.test.mjs) exercises the real bundler:

| Check | Expected behavior |
|---|---|
| Standalone bundles | Handlers run without their original sources or installed dependencies |
| Dependency isolation | Bundles include needed local and npm imports and exclude unrelated code |
| Missing dependency | The build fails instead of producing a broken bundle |

These tests cover packaging, not API Gateway integration or payment behavior. See [TODO](../TODO.md) for planned coverage and [Development](development.md#run-locally) for manual HTTP testing with SAM.
