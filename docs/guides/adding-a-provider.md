# Adding a provider

Support a new payment gateway with one adapter that authenticates and parses incoming webhooks and processes stored events. The shared registry supplies receipt adapters through `find` and dispatches stored events through `route`, so each gateway is registered once. See [Webhook receipt](../architecture/webhook-receipt.md) and [Webhook processing](../architecture/webhook-processing.md) for the two stages.

## Steps

1. Implement the `WebhookProvider` port in `src/infra/webhooks/<provider>/`, decorated with `@Injectable(...)` listing its constructor dependencies. Its `name` is the provider's path segment, as in `POST /webhooks/<provider>`.
2. In `authenticate`, verify the provider's signature or credentials against `rawBody`, the body exactly as received. Read credentials from `AppConfig`, and declare them as environment variables of the webhook function; see [Environment variables](adding-a-lambda.md#environment-variables).
3. In `parse`, map the provider's event into the fields below, or return `undefined` when the body is not one of the provider's events.
4. Implement `process` on the same adapter. It receives the original stored event and must reject on failure so SQS retries. Future business effects must be idempotent; do not authenticate the stored webhook again.
5. List the adapter in the `@Injectable` decorator of `InMemoryWebhookProviderRegistry`. This registers it for both receipt and worker routing. Keep constructors free of credential reads: authentication reads credentials only when receipt calls it.
6. Add tests for authentication, malformed requests, routing, and processor failures. See [Writing tests](testing.md#writing-tests).
7. For a simulated provider, also teach the delivery simulator to send its format; see [Simulated gateways](simulated-gateways.md).

## Mapping an event

| Field | Rule |
|---|---|
| Event ID | The provider's own event ID |
| Event type | The provider's own type, unchanged; see [Event type](../architecture/data-model/webhook-events.md#event-type) |
| Occurrence time | When the provider says the event happened, as an exact instant; apply the provider's time zone when it sends local times without an offset |
| Subject | The payment or subscription the event affects; a refund or chargeback affects the payment it reverses; none for events about anything else |
| Not an event of the provider | `undefined`, which is answered with `WEBHOOK_MALFORMED_EVENT` and stores nothing |

Amounts and other fields stay in the stored payload; receipt does not read them.
