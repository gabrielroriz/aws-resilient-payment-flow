# AWS resilient payment flow

[![Terraform](https://img.shields.io/badge/Terraform-844FBA?style=flat&logo=terraform&logoColor=white)](https://developer.hashicorp.com/terraform)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![esbuild](https://img.shields.io/badge/esbuild-FFCF00?style=flat&logo=esbuild&logoColor=black)](https://esbuild.github.io/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat&logo=vitest&logoColor=white)](https://vitest.dev/)
[![AWS Lambda](https://img.shields.io/badge/AWS_Lambda-FF9900?style=flat)](https://aws.amazon.com/lambda/)
[![Amazon API Gateway](https://img.shields.io/badge/Amazon_API_Gateway-FF4F8B?style=flat)](https://aws.amazon.com/api-gateway/)
[![AWS SAM](https://img.shields.io/badge/AWS_SAM-FF9900?style=flat)](https://aws.amazon.com/serverless/sam/)
[![Amazon DynamoDB](https://img.shields.io/badge/Amazon_DynamoDB-4053D6?style=flat)](https://aws.amazon.com/dynamodb/)
[![AWS SDK for JavaScript](https://img.shields.io/badge/AWS_SDK_for_JavaScript-FF9900?style=flat)](https://aws.amazon.com/sdk-for-javascript/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat&logo=githubactions&logoColor=white)](https://github.com/gabrielroriz/aws-resilient-payment-flow/actions/workflows/ci.yml)

> [!IMPORTANT]
> **Under development.** Only the build and deployment foundation works so far; the payment flow below is the goal, not yet the current behavior. See [Current state](#current-state).

Subscription payments reach this platform as webhooks from external payment providers. This project is building the AWS backend that will turn those webhooks into correct, auditable business outcomes (payment records, customer access, financial records, and notifications) across several gateways, currencies, and countries. Simulated providers, load tests, and failure scenarios will demonstrate the results.

## The challenge

Webhook delivery is unreliable, but the business outcomes must not be. Each event can change money and customer access, so a mistake can grant access without payment, credit a customer twice, or lose a refund.

```mermaid
flowchart LR
    Providers["Payment providers<br/>Stripe, a Brazilian gateway, a simulated gateway"]
    API["Webhook API"]
    subgraph Effects["Business effects, each applied once"]
        Payments["Payment records"]
        Access["Customer access"]
        Ledger["Financial records per currency"]
        Notifications["Localized notifications"]
    end
    Providers -->|"duplicated, late, or out-of-order deliveries"| API
    API --> Effects
```

| What can go wrong | What the system must guarantee |
|---|---|
| A provider delivers the same event twice, or retries after a slow acknowledgment | Each business effect happens once |
| A refund arrives before the payment it refunds | The final state is correct, and an older event never reverses a newer outcome |
| Processing stops halfway, for example after granting access but before notifying the customer | Recovery completes the remaining steps without repeating finished ones |
| Gateways differ in authentication, event names, payload shapes, and amount formats | Equivalent events follow the same business rules, and adding a gateway does not change them |
| One gateway fails or sends a traffic burst | The other gateways keep processing |
| A defect mishandles events, or a provider event never arrives | Operators can trace each event, safely reprocess the affected ones, and detect missing events from provider history |

Success is measurable: a webhook acknowledgment p99 below one second under the declared load, no acknowledged event lost, zero duplicate business effects, and automatic recovery from a two-hour downstream outage. The [requirements](docs/REQUIREMENTS.md) define the full scope, including currencies, country pricing, localization, and the acceptance scenarios.

## Current state

`npm run deploy` builds the TypeScript Lambdas and deploys them with Terraform behind an API Gateway HTTP API. Besides a health check, a [webhook receipt function](docs/webhooks.md) accepts `POST /webhooks/{provider}`: the provider adapter named in the URL authenticates the request and reads its event, which is stored once in the [webhook events table](docs/data-model/webhook-events.md) for deduplication and tracing. No provider adapter exists yet, so every provider is rejected for now. Event processing and the gateway integrations are not implemented yet.

## Architecture

The project follows a hexagonal (ports and adapters) architecture with dependency injection. See [Architecture](docs/architecture.md) for details.

## Get started

Use Node.js 24 and npm. From the repository root:

```bash
npm ci
npm run build
npm test
```

Each registered Lambda builds to `dist/bundles/<function-name>/index.js`.

To run the HTTP endpoints locally against DynamoDB Local, complete the [SAM and Docker setup](docs/development.md#run-locally), then run `npm run dev`.

To deploy, follow the [AWS and Terraform setup](docs/deployment.md), then run:

```bash
npm run deploy
```

This command automatically applies the Terraform plan and outputs each Lambda's HTTP endpoint. See [Calling the API](docs/deployment.md#calling-the-api) for endpoint details.

## Documentation

- [Development](docs/development.md): local setup, DynamoDB Local, and builds.
- [Testing](docs/testing.md): running tests, test layout, and how to write new tests.
- [Architecture](docs/architecture.md): hexagonal model, layers, ports, dependency injection, and error handling.
- [Receiving webhooks](docs/webhooks.md): the webhook route, its responses, and adding a payment provider.
- [Webhook events table](docs/data-model/webhook-events.md): DynamoDB access patterns, keys, items, and indexes for received webhooks.
- [Adding a Lambda](docs/adding-a-lambda.md): creating a function and configuring its route.
- [Deployment](docs/deployment.md): requirements, setup, and the AWS deployment workflow.
- [Requirements](docs/REQUIREMENTS.md): project scope and acceptance criteria.
- [TODO](TODO.md): deferred work.
