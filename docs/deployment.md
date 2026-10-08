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
configuration.
