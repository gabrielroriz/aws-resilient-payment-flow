# AWS resilient payment flow

An AWS project for reliable payment and subscription event processing. The current
setup builds and deploys two example TypeScript Lambdas; the payment flow is
specified in the [requirements](docs/REQUIREMENTS.md).

## Get started

Use Node.js 24 and npm. From the repository root:

```bash
npm ci
npm run build
npm test
```

Each registered Lambda builds to `dist/bundles/<function-name>/index.js`.

To deploy, follow the [AWS and Terraform setup](docs/deployment.md), then run:

```bash
npm run deploy
```

This command automatically applies the Terraform plan.

## Documentation

- [Development](docs/development.md): local builds, tests, and adding a Lambda.
- [Deployment](docs/deployment.md): prerequisites, packaging, and Terraform behavior.
- [Requirements](docs/REQUIREMENTS.md): project scope and acceptance criteria.
- [TODO](TODO.md): deferred work.
