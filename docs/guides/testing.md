# Testing

How the automated tests are organized, how they run, and how to write new ones. See [Development](development.md) for running the API by hand.

## Requirements

Node.js 24 and npm. Tests need no Docker, SAM, Terraform, AWS credentials, or network access.

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

Each test sits next to the module it covers and shares its name, such as `<module>.ts` and `<module>.test.ts`.

| File | Contains | Run by |
|---|---|---|
| `src/**/<module>.test.ts` | Tests for TypeScript code, which import it through the path aliases | Vitest |
| `src/**/<module>.test-d.ts` | Type tests, which pass only when type checking reports the expected errors | Vitest typecheck, through `tsc` |
| `src/**/<module>.fixtures.ts` | Helpers shared by several test files, such as API Gateway test events | Imported by tests |
| `build/<script>.test.mts` | Tests for the build tooling | Vitest |

`npm run build` type-checks every `.ts` file under `src/` and every `.mts` file under `build/`, including tests. No Lambda bundle contains test files, because each bundle starts from its entry file.

## How it works

[`vitest.config.mjs`](../../vitest.config.mjs) compiles tests the same way the deployed Lambdas are compiled:

| Setting | Effect |
|---|---|
| esbuild TypeScript transform | Compiles `.ts` and `.mts` files with esbuild, the production target, and `tsconfig.json`; Vite's default Oxc transform does not lower standard decorators |
| `resolve.tsconfigPaths` | Resolves `@application/*`, `@infra/*`, `@kernel/*`, and `@main/*` from `tsconfig.json` |
| `typecheck` | Checks `*.test-d.ts` files with `tsc` instead of executing them |
| `restoreMocks` | Restores `vi.spyOn` replacements after each test |
| `unstubEnvs` | Restores environment variables set with `vi.stubEnv` after each test |

Vitest's type testing is experimental and may change outside SemVer, so `vitest` is pinned to an exact version in `package.json`.

Each test file gets its own module graph, so the `Registry` singleton starts empty in every file but is shared by the tests within a file.

A build test bundles every Lambda registered in `lambdas.json` with the production settings and loads it, so a missing port binding or a bundling problem fails `npm test` without a test per function.

## Writing tests

| Practice | Reason |
|---|---|
| Test a use case by passing fake ports to its constructor, without the registry | The test covers business rules only and does not depend on adapters |
| Test an adapter by replacing the layer directly below it: SDK calls for a shared client, the shared client's methods for a repository | The test checks the requests sent without AWS, Docker, or network access |
| Replace dependencies with `vi.spyOn`, not module mocks | `restoreMocks` undoes each spy after its test, so replacements never leak |
| Set environment variables with `vi.stubEnv` | `unstubEnvs` restores them after each test, so a configured or missing variable never leaks |
| Declare the classes a DI test registers inside that test | The registry is shared by every test in the file |
| Use fixed dates and values instead of the current time | Results stay deterministic; code that needs the time receives it through the clock port |
| Assert the exact shape a contract defines, such as a table's items or an HTTP response | A change that breaks the documented contract fails a test |
| Name each test as a sentence describing one behavior | The list of tests reads as a specification |
| Move helpers used by several test files into `<module>.fixtures.ts`; keep single-file helpers in that file | Tests stay short without a global utilities module |
| Express compile-time guarantees as type tests in `.test-d.ts` files | Mistakes such as a wrong `@Injectable` dependency list fail type checking |

## Limitations

Tests replace AWS services and the Lambda runtime, so they do not exercise API Gateway or DynamoDB. The [delivery simulator](simulated-gateways.md) checks webhook receipt end to end against a [local](development.md) or deployed API, and [TODO](../../TODO.md) lists planned coverage.
