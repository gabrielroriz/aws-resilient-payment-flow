# Adding a provider

Support a new payment gateway by adding an adapter that authenticates its webhooks and reads its events into the shared event model. Adding a provider changes no business rule, route, or other provider. See [Webhook receipt](../architecture/webhook-receipt.md) for how adapters are used.

## Steps

1. Implement the `WebhookProvider` port in `src/infra/webhooks/<provider>/`, decorated with `@Injectable(...)` listing its constructor dependencies. Its `name` is the provider's path segment, as in `POST /webhooks/<provider>`.
2. In `authenticate`, verify the provider's signature or credentials against `rawBody`, the body exactly as received. Read credentials from `AppConfig`, and declare them as environment variables of the webhook function; see [Environment variables](adding-a-lambda.md#environment-variables).
3. In `parse`, map the provider's event into the fields below, or return `undefined` when the body is not one of the provider's events.
4. List the adapter in the `@Injectable` decorator of the provider catalog, `InMemoryWebhookProviderCatalog`.
5. Add tests next to the adapter, covering authentic, forged, and malformed requests. See [Writing tests](testing.md#writing-tests).
6. For a simulated provider, also teach the delivery simulator to send its format; see [Simulated gateways](simulated-gateways.md).

## Mapping an event

| Field | Rule |
|---|---|
| Event ID | The provider's own event ID |
| Event type | The provider's own type, unchanged; see [Event type](../architecture/data-model/webhook-events.md#event-type) |
| Occurrence time | When the provider says the event happened, as an exact instant; apply the provider's time zone when it sends local times without an offset |
| Subject | The payment or subscription the event affects; a refund or chargeback affects the payment it reverses; none for events about anything else |
| Not an event of the provider | `undefined`, which is answered with `MALFORMED_WEBHOOK_EVENT` and stores nothing |

Amounts and other fields stay in the stored payload; receipt does not read them.
