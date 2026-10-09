# Development

Use Node.js 24 and npm. Install dependencies with `npm ci`, build with
`npm run build`, and run the bundling tests with `npm test` from the repository root.

## Run locally

Install [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html),
Docker, Terraform, Bash, and `zip`, in addition to Node.js 24 and npm. Use a recent
SAM CLI with Node.js 24 support and ensure the Docker daemon is running.
This workflow was verified with SAM CLI 1.167.0. Run `npm ci` once to install the
project's build tools.

SAM's Terraform hook initializes and plans the existing configuration. Configure
AWS credentials with access to the S3 backend and the deployed resources, as for
[deployment](deployment.md#prerequisites). This workflow requires network access
and is not an entirely offline environment.

```bash
npm run dev
```

The script builds the registered functions, packages `dist/<function-name>_local.zip`,
and runs `sam local start-api --hook-name terraform` from `terraform/` with
`TF_VAR_lambdasVersion=local`. SAM discovers functions and routes from Terraform;
there is no manually maintained SAM template or second route registry. Its
generated metadata is ignored under `.aws-sam-iacs/` (or `.aws-sam/`, depending on
SAM version). The local workflow does not run `terraform apply` or deploy the
ZIPs to AWS.

In another terminal, call the current GET routes:

```bash
curl --fail-with-body http://127.0.0.1:3000/ts_lambda
curl --fail-with-body http://127.0.0.1:3000/ts_lambda_2
```

Expect JSON strings `"Hello World from Lambda 1!"` and `"Hello World from Lambda 2!"`.
SAM pulls the runtime container image on first invocation, which can take longer.
Stop with Ctrl+C. After changing code or the registry, stop and rerun `npm run dev`
to rebuild the ZIPs and regenerate the Terraform metadata. Run one local server
per checkout. Additional SAM options can be passed through, for example
`npm run dev -- --port 3001`.

The hook has limitations resolving resource relationships, especially for new,
undeployed resources. If SAM reports unresolved attributes, inspect its output
and a Terraform plan before deciding whether to deploy those changes. Local
execution does not verify AWS IAM permissions or emulate other AWS services;
SDK calls made by handlers can still reach AWS. See
[SAM's Terraform integration and limitations](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-samcli-terraform.html).

## Add a Lambda

Create a TypeScript file under `src/` that exports `handler`. Add an entry to the
existing object in [`lambdas.json`](../lambdas.json), for example:

```json
"ts_lambda_3": {
  "entry": "src/lambdas/lambda_3.ts",
  "memory_size": 512,
  "timeout": 30,
  "http_method": "POST",
  "path": "/example"
}
```

The key is the AWS function name. Memory and timeout are optional, defaulting to
1024 MB and 300 seconds. The builder and Terraform both read this registry, so
there is no second list to update. A source file alone does not register a Lambda.

`http_method` controls the client-facing route. Use an uppercase method such as
`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`, or `ANY` to accept all
methods. It defaults to `ANY` when omitted. Both example functions explicitly
use `GET`. The backend `integration_method` stays fixed at `POST` for Lambda
invocation, independently of the route's method.

`path` sets the public route path independently of the function name. Include a
leading `/`, for example `/example` or `/events/payment`. It defaults to
`/<function-name>` when omitted. Route parameters such as `/events/{id}` are
supported; substitute their values when calling an endpoint from the outputs.
Each method/path combination must be unique across the registry.

Run `npm run build` and `npm test` before [deploying](deployment.md). Removing a
registry entry plans deletion of its function; renaming a key can replace it.
Each entry also gets an API Gateway route using its configured path and HTTP
method. Adding, removing, or renaming an entry updates its route and invocation
permission along with the function.

HTTP handlers receive the API Gateway payload format `2.0` event. Return a proxy
response with `statusCode`, optional `headers`, and a string `body`, as the example
handlers do. The API currently exposes these routes without authentication.

## Build output

The build checks types with TypeScript, then uses esbuild to create one minified
`dist/bundles/<function-name>/index.js` per registry entry. Each bundle contains
the handler and its imported dependencies. Shared code is included in each bundle
that needs it; unrelated handlers are excluded unless imported.

A local build replaces `dist/bundles/` and preserves archived ZIPs elsewhere in
`dist/`. Build responsibilities are separated in these files:

- [`build/index.mjs`](../build/index.mjs): coordinates validation, cleanup, and bundling.
- [`build/lambdas.mjs`](../build/lambdas.mjs): reads and validates the registry.
- [`build/bundle.mjs`](../build/bundle.mjs): builds and checks each output.
- [`build/esbuild.config.mjs`](../build/esbuild.config.mjs): esbuild settings.

Unused code is removed where esbuild can safely do so; imports with side effects
may remain. Node.js built-ins remain runtime imports. Native addons,
runtime-loaded files, and computed import paths may need a different packaging
approach. The builder rejects extra output files, external non-built-in imports,
and unsupported dynamic import or require calls reported by esbuild.

## Tests

[`tests/build.test.mjs`](../tests/build.test.mjs) runs the real builder in temporary
projects. It checks that bundles work without their original sources or installed
dependencies, exclude unrelated code, and fail on a missing dependency.
Additional planned coverage is listed in [TODO.md](../TODO.md).
