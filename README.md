# AWS resilient payment flow

[![Terraform](https://img.shields.io/badge/Terraform-844FBA?style=flat&logo=terraform&logoColor=white)](https://developer.hashicorp.com/terraform)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![AWS Lambda](https://img.shields.io/badge/AWS_Lambda-FF9900?style=flat)](https://aws.amazon.com/lambda/)
[![Amazon API Gateway](https://img.shields.io/badge/Amazon_API_Gateway-FF4F8B?style=flat)](https://aws.amazon.com/api-gateway/)

An AWS project for reliable payment and subscription event processing. The [requirements](docs/REQUIREMENTS.md) set the context and constraints for the payment flow under development. The current setup builds the TypeScript Lambdas registered in `lambdas.json` and deploys them behind an API Gateway HTTP API.

## Get started

Use Node.js 24 and npm. From the repository root:

```bash
npm ci
npm run build
npm test
```

Each registered Lambda builds to `dist/bundles/<function-name>/index.js`.

To run the HTTP endpoints locally, complete the
[SAM and Docker setup](docs/development.md#run-locally), then run `npm run dev`.

To deploy, follow the [AWS and Terraform setup](docs/deployment.md), then run:

```bash
npm run deploy
```

This command automatically applies the Terraform plan and outputs each Lambda's
HTTP endpoint. See [Calling the API](docs/deployment.md#calling-the-api) for endpoint details.

## Documentation

- [Development](docs/development.md): local setup and builds.
- [Testing](docs/testing.md): running tests and current coverage.
- [Architecture](docs/architecture.md): hexagonal layers, dependency injection, and error handling.
- [Adding a Lambda](docs/adding-a-lambda.md): creating a function and configuring its route.
- [Deployment](docs/deployment.md): requirements, setup, and the AWS deployment workflow.
- [Requirements](docs/REQUIREMENTS.md): project scope and acceptance criteria.
- [TODO](TODO.md): deferred work.
