# AWS resilient payment flow

[![Terraform](https://img.shields.io/badge/Terraform-844FBA?style=flat&logo=terraform&logoColor=white)](https://developer.hashicorp.com/terraform)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![AWS Lambda](https://img.shields.io/badge/AWS_Lambda-FF9900?style=flat)](https://aws.amazon.com/lambda/)
[![Amazon API Gateway](https://img.shields.io/badge/Amazon_API_Gateway-FF4F8B?style=flat)](https://aws.amazon.com/api-gateway/)

An AWS project for reliable payment and subscription event processing. The current
setup builds and deploys two example TypeScript Lambdas behind an API Gateway
HTTP API; the payment flow is
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

This command automatically applies the Terraform plan and outputs each Lambda's
HTTP endpoint. See [Calling the API](docs/deployment.md#calling-the-api) for examples.

## Documentation

- [Development](docs/development.md): local builds, tests, and adding a Lambda.
- [Deployment](docs/deployment.md): prerequisites, packaging, and Terraform behavior.
- [Requirements](docs/REQUIREMENTS.md): project scope and acceptance criteria.
- [TODO](TODO.md): deferred work.
