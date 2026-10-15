# Simulated gateways

Simulated payment gateways stand in for real providers in tests: each sends webhooks in its own format and with its own authentication, so the system is exercised against provider differences without real accounts. A delivery simulator sends their webhooks in the patterns of the [acceptance scenarios](../requirements.md#6-acceptance-scenarios), such as duplicates, retries, and forgeries, and checks how [webhook receipt](../architecture/webhook-receipt.md) responds.

## Requirements

| Requirement | Used for |
|---|---|
| A running API, [local](development.md) or [deployed](deployment.md) | Receiving the webhooks |
| Node.js 24 and npm | Running the simulator |
| The gateways' secrets | Authenticating deliveries; the local defaults match `npm run dev` |

## Setup

| Variable | Gateway | Local default |
|---|---|---|
| `GATEWAY_GLOBAL_SIGNING_SECRET` | `gatewayGlobal` | `local-gateway-global-secret` |
| `GATEWAY_BRAZIL_ACCESS_TOKEN` | `gatewayBrazil` | `local-gateway-brazil-token` |

The webhook function and the simulator read the same variables. Locally, `npm run dev` gives the function the local defaults from [`terraform/secrets.local.tfvars`](../../terraform/secrets.local.tfvars), so the simulator needs no setup. A deployed function gets the values set during the [deployment setup](deployment.md#setup); export the same values before simulating against it.

## How the gateways differ

| | `gatewayGlobal`, Stripe-like | `gatewayBrazil`, Asaas-like |
|---|---|---|
| Authentication | `gateway-global-signature: t=<Unix seconds>,v1=<hex>` header, an HMAC-SHA256 of `<t>.<body>`; rejected when more than five minutes old; one `v1` per active secret while the secret rotates | `gateway-brazil-access-token` header with a static token |
| Event vocabulary | Lower case with dots, such as `payment.succeeded` and `refund.created` | Upper case, such as `PAYMENT_RECEIVED` and `PAYMENT_REFUNDED` |
| Structure | An envelope, with the object the event is about under `data.object` | Flat, with the `payment` or `subscription` at the top level |
| Occurrence time | `created`, in Unix seconds | `dateCreated`, as `YYYY-MM-DD HH:mm:ss` in Brasília time (UTC-3) without an offset |
| Amount | An integer in the currency's minor unit, with a `currency` code | Decimal reais, without a currency field |
| Subject | The payment or subscription; a refund or chargeback names its payment in `payment` | The `payment` or `subscription` |
| Subscription billed | A payment names it in `subscription`; a refund or chargeback names only its payment | The `payment` names it in `subscription`, on its refunds and chargebacks too |

Both identify events by `id`. Amounts stay in the stored payload; receipt does not read them.

### Statuses

Each gateway's event types map to the payment statuses that [out-of-order events](../architecture/webhook-receipt.md#out-of-order-events) are ranked by; other types report no status.

| Status | `gatewayGlobal` | `gatewayBrazil` |
|---|---|---|
| `pending` | `payment.created` | `PAYMENT_CREATED` |
| `overdue` | | `PAYMENT_OVERDUE` |
| `failed` | `payment.failed` | `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` |
| `succeeded` | `payment.succeeded` | `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` |
| `refunded` | `refund.created` | `PAYMENT_REFUNDED` |
| `charged_back` | `chargeback.opened` | `PAYMENT_CHARGEBACK_REQUESTED` |

```json
{"id":"evt_1","object":"event","type":"payment.succeeded","created":1791626400,"data":{"object":{"object":"payment","id":"pay_1","amount":1990,"currency":"usd","status":"succeeded"}}}
```

```json
{"id":"evt_1","event":"PAYMENT_RECEIVED","dateCreated":"2026-10-10 07:00:00","payment":{"object":"payment","id":"pay_1","value":19.9,"billingType":"CREDIT_CARD","status":"RECEIVED"}}
```

## How the simulator is organized

The simulator lives in `scripts/simulator/`, and `npm run simulate` runs its entry, which selects the scenarios and reports their checks. The rest is split by concern, so each part can be read and changed on its own:

| Directory | Contains |
|---|---|
| `gateways/` | One sender per simulated gateway, which writes events in its format and authenticates them with the credential it is given, and the list of gateways every scenario runs for |
| `engine/` | What scenarios share: the clock, creating events, delivering them to the API, the reply contract, checks, and running scenarios for every gateway |
| `scenarios/` | One module per scenario, named after it, and the list that sets the order they run in |

The entry is the composition root, the only place that reads the environment, the system clock, and the network. It builds a simulation, which holds the gateways, the clock, the event factory, the API client, and the checks, and passes it to every scenario. Scenarios use only what they receive, plus helpers that depend on nothing, so tests replace `fetch` and the clock without running the API. The engine follows the same conventions as the local development scripts: dependencies are passed in rather than resolved by a container, since Node.js runs these scripts without compiling the decorators that the Lambda code's [dependency injection](../architecture/code-structure.md#dependency-injection) uses.

Every reply is checked against the simulator's own copy of the API's reply contract, written apart from the API so an unintended change to its replies fails a scenario. The contract is extended with the values each step expects and with the gateway and event the reply must name, so one zod validation checks both the shape and the values.

Types live in modules of their own, named after the module that uses them, such as `checks.types.mts`. To add a scenario, write it in its own module under `scenarios/` using the simulation it receives, and add it to the list; mark it `optional` when it should run only when named. To add a gateway, write its sender under `gateways/` and add it to the list of gateways.

## Usage

```bash
npm run simulate                                         # every scenario except optional ones, against http://localhost:3000
npm run simulate -- duplicate-delivery provider-retry    # selected scenarios, including optional ones
npm run simulate -- --url https://<api-id>.execute-api.us-east-1.amazonaws.com
```

| Scenario | Checks, for each gateway |
|---|---|
| `duplicate-delivery` | The same event delivered three times is stored once, and every delivery is acknowledged |
| `provider-retry` | A delivery abandoned after 50 ms without an acknowledgment is retried 3 seconds later without storing the event twice |
| `overlapping-ids` | The same event ID from both gateways is stored as two independent events |
| `out-of-order` | A refund delivered before its payment stays the latest event: the payment that follows is accepted with `outdated=true`, and delivered again, the refund is still `outdated=false` and the payment `outdated=true` |
| `occurrence-order` | A payment's failure delivered before its creation, which has the same precedence but occurred earlier, stays the latest event: the creation is accepted with `outdated=true` |
| `precedence-over-time` | A failure that occurred after its payment succeeded is accepted with `outdated=true`, so ranking by occurrence time alone fails it |
| `same-second` | A payment and its refund from the same second end with the refund as the latest event in either order, even though the payment's event ID would win the tie |
| `overlapping-payment-ids` | A refund from the other gateway does not make a payment with the same ID outdated |
| `order-independence` | A payment's five events, created to charged back, delivered in order, reversed, and mixed, are each answered with the expected `outdated` flag and always end with the chargeback as the latest event |
| `subscription-renewal` | A subscription's two charges, each created and then paid, are all accepted with `outdated=false`, so the second charge starting pending after the first succeeded is not outdated, and each charge ends paid |
| `concurrent-burst` | Optional. A payment's five events, each delivered twice at once, are each stored once, the chargeback is never outdated, and it ends as the latest event |
| `forged-request` | Missing, forged, and, for `gatewayGlobal`, stale credentials are rejected with 401, and nothing is stored |
| `malformed-event` | An authentic body that is not a gateway event is rejected with 400 `WEBHOOK_MALFORMED_EVENT` |

Each check prints ✓ or ✗ with what it observed, followed by each problem, such as `outdated: expected false, received "false"`, and the command fails when any check fails. A scenario that stops before finishing counts as one failed check: when it cannot reach the API, it prints the reason, such as a refused connection; any other error is a defect in the simulator, and its stack is printed. Every run uses new event IDs, so earlier runs never affect the results.

Scenarios that check how a payment ended deliver each of its events again: a repeated delivery is answered with `outdated=false` only when its event is the latest, so the replies reveal the final state without reading the table. Optional scenarios run only when named; `concurrent-burst` is meant for a deployed API, where deliveries really run in parallel.

## Limitations

- Checks read HTTP responses only; locally, the stored items can be inspected in dynamodb-admin and the queued messages in the ElasticMQ UI. See [Development](development.md#usage).
- Event processing is not implemented, so the scenarios cover receipt: a payment that arrives after its refund is flagged as outdated, but no business effect is applied yet.
- Secrets live in function environment variables and in Terraform state. Rotating one means redeploying, and the receiver holds one secret per gateway at a time.
