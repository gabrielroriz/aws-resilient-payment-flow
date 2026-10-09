# Deployment

## Prerequisites

Install Node.js 24, npm, Bash, `zip`, and Terraform matching the version constraint
in [`terraform/terraform.tf`](../terraform/terraform.tf). Configure AWS credentials
for the target account with access to the backend and the resources Terraform manages.

Review the account-specific S3 backend, region, and resource names in that file
before deploying. The backend bucket must already exist before `terraform init`.
The configuration also manages that bucket as a resource; for an existing bucket,
ensure it is tracked in this Terraform state before applying.

## Deploy

From the repository root:

```bash
npm run deploy
```

You can also invoke `scripts/deploy.sh` using its absolute path from any directory.
The script:

1. Installs locked dependencies and builds all registered functions in a temporary directory.
2. Creates `dist/<function-name>_<version>.zip` for each function, containing only `index.js`.
3. Runs Terraform init and plan, passing the archive version as `lambdasVersion`.
4. Automatically applies the saved plan, including all infrastructure changes it contains.

The version is a UTC timestamp with a unique suffix. The script stops on failure
and removes its temporary build directory and saved plan on exit. ZIPs remain in
`dist/`; local build output and installed dependencies are preserved.

## Terraform behavior

[`terraform/lambdas.tf`](../terraform/lambdas.tf) reads the same registry used by
the builder and manages one AWS Lambda per entry. Each function references its own
ZIP and content hash, uses Node.js 24, and runs `index.handler`. Terraform uploads
the archives directly to Lambda and outputs each function's name, ARN, and handler.

See [Development](development.md#add-a-lambda) for registry fields and the effects
of adding, renaming, or removing entries. Functions currently share the existing
execution role. Event triggers and service-specific permissions require separate
configuration, except for the HTTP API integration described below.

## Calling the API

[`terraform/api_gateway.tf`](../terraform/api_gateway.tf) creates one API Gateway
HTTP API with an automatically deployed `$default` stage. Each registered Lambda
gets a `<http_method> <path>` route from `lambdas.json`, a Lambda proxy integration
using payload format `2.0`, and permission scoped to its path in this API's default
stage. The method defaults to `ANY` and the path to `/<function-name>` when omitted.
The `lambda_endpoints` output reflects each configured path.
There is no stage prefix in the URL. These example endpoints are public and have
no authentication; payment-provider authenticity checks are not implemented yet.

After deployment, inspect the endpoint outputs and invoke the example functions:

```bash
terraform -chdir=terraform output lambda_endpoints
API_URL="$(terraform -chdir=terraform output -raw api_endpoint)"
curl --fail-with-body -X POST "$API_URL/ts_lambda"
curl --fail-with-body -X POST "$API_URL/ts_lambda_2"
```

The responses are HTTP 200 with JSON strings `"Hello World from Lambda 1!"` and
`"Hello World from Lambda 2!"`, respectively. Both example routes accept only
POST. Requests with unmatched methods or paths return HTTP 404.

The HTTP integration waits up to 30 seconds even though a Lambda's configured
timeout may be longer. Handlers should respond within that window; longer work
needs asynchronous processing. See the AWS documentation for
[HTTP API Lambda integrations](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html).
