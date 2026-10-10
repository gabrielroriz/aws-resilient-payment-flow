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

The webhook function and the simulator read the same variables. Locally, `npm run dev` gives the function these values, using the defaults when they are unset. A deployed function gets the values set during the [deployment setup](deployment.md#setup); export the same values before simulating against it.

## How the gateways differ

| | `gatewayGlobal`, Stripe-like | `gatewayBrazil`, Asaas-like |
|---|---|---|
| Authentication | `gateway-global-signature: t=<Unix seconds>,v1=<hex>` header, an HMAC-SHA256 of `<t>.<body>`; rejected when more than five minutes old; one `v1` per active secret while the secret rotates | `gateway-brazil-access-token` header with a static token |
| Event vocabulary | Lower case with dots, such as `payment.succeeded` and `refund.created` | Upper case, such as `PAYMENT_RECEIVED` and `PAYMENT_REFUNDED` |
| Structure | An envelope, with the object the event is about under `data.object` | Flat, with the `payment` or `subscription` at the top level |
| Occurrence time | `created`, in Unix seconds | `dateCreated`, as `YYYY-MM-DD HH:mm:ss` in Brasília time (UTC-3) without an offset |
| Amount | An integer in the currency's minor unit, with a `currency` code | Decimal reais, without a currency field |
| Subject | The payment or subscription; a refund or chargeback names its payment in `payment` | The `payment` or `subscription` |

Both identify events by `id`. Amounts stay in the stored payload; receipt does not read them.

```json
{"id":"evt_1","object":"event","type":"payment.succeeded","created":1791626400,"data":{"object":{"object":"payment","id":"pay_1","amount":1990,"currency":"usd","status":"succeeded"}}}
```

```json
{"id":"evt_1","event":"PAYMENT_RECEIVED","dateCreated":"2026-10-10 07:00:00","payment":{"object":"payment","id":"pay_1","value":19.9,"billingType":"PIX","status":"RECEIVED"}}
```

## Usage

```bash
npm run simulate                                         # every scenario, against http://localhost:3000
npm run simulate -- duplicate-delivery provider-retry    # selected scenarios
npm run simulate -- --url https://<api-id>.execute-api.us-east-1.amazonaws.com
```

| Scenario | Checks, for each gateway |
|---|---|
| `duplicate-delivery` | The same event delivered three times is stored once, and every delivery is acknowledged |
| `provider-retry` | A delivery abandoned after 50 ms without an acknowledgment is retried 3 seconds later without storing the event twice |
| `overlapping-ids` | The same event ID from both gateways is stored as two independent events |
| `out-of-order` | A refund delivered before its payment is accepted, and so is the payment |
| `forged-request` | Missing, forged, and, for `gatewayGlobal`, stale credentials are rejected with 401, and nothing is stored |
| `malformed-event` | An authentic body that is not a gateway event is rejected with 400 `MALFORMED_WEBHOOK_EVENT` |

Each check prints ✓ or ✗ with the response it got, and the command fails when any check fails. Every run uses new event IDs, so earlier runs never affect the results.

## Limitations

- Checks read HTTP responses only; locally, the stored items can be inspected in dynamodb-admin. See [Development](development.md#usage).
- Event processing is not implemented, so the scenarios cover receipt: a refund that arrives first is accepted, but no business effect is applied yet.
- Secrets live in function environment variables and in Terraform state. Rotating one means redeploying, and the receiver holds one secret per gateway at a time.
