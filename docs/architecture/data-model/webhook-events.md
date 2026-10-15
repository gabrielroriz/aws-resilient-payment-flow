# Webhook events table

The `webhook_events` DynamoDB table records the webhook events received from payment providers. It detects repeated deliveries and keeps each event's history, including its processing attempts and business effects, so operators can trace and reprocess events as the [requirements](../../requirements.md) describe. It also records which event reports the latest status of each payment, so events that arrive late are recognized. Terraform provisions it and gives the functions that use it its name in `WEBHOOK_EVENTS_TABLE_NAME`, and a repository adapter implements its access patterns behind the webhook events port.

## Access patterns

| Access pattern | Operation | Table or index | Key condition |
|---|---|---|---|
| Create an event once, or get the stored one if it exists | `PutItem` if `attribute_not_exists(PK)` | Table | `PK = event_key`, `SK = META` |
| Get an event | `GetItem` | Table | `PK = event_key`, `SK = META` |
| Record a duplicate delivery | `PutItem` | Table | `PK = event_key`, `SK = DELIVERY#{received_at}#{request_id}` |
| Get the full trace of an event | `Query` | Table | `PK = event_key` |
| Get events received in a time interval | `Query` per shard of every provider | `GSI1` | `GSI1PK = {provider}#{shard}`, `received_at` within the interval |
| Get events received in a time interval by provider and event type | `Query` per shard of one provider, filtered by `event_type` | `GSI1` | `GSI1PK = {provider}#{shard}`, `received_at` within the interval |
| Get events for a business subject in the order they occurred | `Query` | `GSI2` | `GSI2PK = {provider}#{subject_type}#{subject_id}` |
| Record a subject's latest status unless the stored one outranks it | `PutItem` if `attribute_not_exists(PK) OR rank <= :rank` | Table | `PK = subject_key`, `SK = STATUS` |

- When the conditional `PutItem` fails, `ReturnValuesOnConditionCheckFailure=ALL_OLD` returns the stored event, so detecting a duplicate needs no extra read. The duplicate delivery is recorded next.
- Time-interval queries merge the results of every shard by `received_at`; see [GSI1 sharding](#gsi1-sharding).

## Keys

| Key | Attribute | Type | Value |
|---|---|---|---|
| Partition key | `PK` | String | `event_key`, which is `{provider}#{provider_event_id}` so events from different providers never collide; or `subject_key`, which is `SUBJECT#{provider}#{subject_type}#{subject_id}`, for a subject's status |
| Sort key | `SK` | String | Item type; see [Items](#items) |

All items of an event share its `event_key`, so one `Query` returns the whole event. A subject's status has a key of its own, so it never appears among an event's items.

## Items

| Item | `SK` | Written |
|---|---|---|
| [Event](#event) | `META` | Once, at receipt, by the conditional `PutItem` |
| [Attempt](#attempt) | `ATTEMPT#{started_at}#{attempt_id}` | Once per processing attempt |
| [Effect](#effect) | `EFFECT#{effect}` | When a business effect of the event completes or fails |
| [Delivery](#delivery) | `DELIVERY#{received_at}#{request_id}` | On each duplicate delivery |
| [Subject status](#subject-status) | `STATUS` | At receipt, when an event reports a status that outranks its subject's latest |

Webhook receipt writes events, deliveries, and subject statuses. The [worker](../webhook-processing.md) reads events and routes them to gateway-specific classes; recording processing attempts and business effects is not implemented yet.

Timestamps are UTC ISO 8601 strings with fixed millisecond precision, so they sort correctly in keys. `expires_at` is the exception: DynamoDB TTL requires a number of epoch seconds.

### Event

| Attribute | Type | Description |
|---|---|---|
| `provider` | String | Provider name, as in the webhook path |
| `provider_event_id` | String | Event ID assigned by the provider |
| `event_type` | String | The provider's own event type, such as `payment.succeeded`; see [Event type](#event-type) |
| `occurred_at` | String | When the provider says the event happened |
| `received_at` | String | When the webhook reached the API |
| `subject_type` | String | Business object the event affects, such as `payment` or `subscription` |
| `subject_id` | String | The provider's ID for the subject; a refund uses its payment's ID |
| `subscription_id` | String | The subscription a payment bills, when the event names it; see [Subscription status](#subscription-status) |
| `status` | String | The payment status the event reports, the same for every provider, such as `refunded`; omitted when it reports none; see [Event type](#event-type) |
| `payload` | Binary | Exact request body, gzip-compressed; see [Payload size](#payload-size) |
| `GSI1PK` | String | `GSI1` partition key; see [Indexes](#indexes) |
| `GSI2PK` | String | `GSI2` partition key, omitted when the event has no subject |
| `expires_at` | Number | TTL in epoch seconds; see [Retention](#retention) |

### Attempt

| Attribute | Type | Description |
|---|---|---|
| `attempt_id` | String | Unique ID of the attempt |
| `started_at` | String | When processing started |
| `finished_at` | String | When processing finished |
| `outcome` | String | `succeeded` or `failed` |
| `error_code` | String | Stable machine-readable error code, present when the attempt failed |
| `handler_version` | String | Code version that ran the attempt, used to select events for reprocessing after a defect |
| `trace_id` | String | Links the attempt to its logs and traces |
| `expires_at` | Number | TTL in epoch seconds |

### Effect

| Attribute | Type | Description |
|---|---|---|
| `effect` | String | Name of the business effect, such as recording the payment or granting access |
| `status` | String | `completed` or `failed` |
| `business_key` | String | Idempotency key of the business write, linking the effect to the record it changed |
| `updated_at` | String | When `status` last changed |
| `expires_at` | Number | TTL in epoch seconds |

### Delivery

| Attribute | Type | Description |
|---|---|---|
| `received_at` | String | When the duplicate delivery reached the API |
| `request_id` | String | API Gateway request ID of the delivery |
| `expires_at` | Number | TTL in epoch seconds |

### Subject status

| Attribute | Type | Description |
|---|---|---|
| `provider_event_id` | String | The event that reports the latest status |
| `status` | String | The latest status |
| `occurred_at` | String | When that event occurred |
| `rank` | String | `{precedence}#{occurred_at}#{provider_event_id}`, with the precedence in two digits; see [Event order](#event-order) |
| `expires_at` | Number | TTL in epoch seconds, the same as the event that reports the status |

## Indexes

| Index | Partition key | Sort key | Projected attributes |
|---|---|---|---|
| `GSI1`, by receipt time | `GSI1PK` = `{provider}#{shard}` | `received_at` | `provider`, `event_type`, `occurred_at`, `subject_type`, `subject_id` |
| `GSI2`, by subject | `GSI2PK` = `{provider}#{subject_type}#{subject_id}` | `occurred_at` | `provider`, `event_type`, `received_at` |

- Only event items have `GSI1PK` and `GSI2PK`, so attempts, effects, and deliveries stay out of both indexes.
- Projections leave out `payload`, keeping each index entry under 1 KB, which costs one write unit; read the payload with `GetItem`.
- `GSI1` projects `event_type` because a query filter can only use projected attributes.

### GSI1 sharding

DynamoDB accepts about 1,000 writes per second for a single partition key value, and a table write fails when its index cannot keep up. `GSI1` therefore spreads each provider's events over `N` partition keys, `{provider}#0` to `{provider}#{N-1}`, choosing one with `hash(event_key) mod N`. A time-interval query runs once per shard and merges the results by `received_at`. `N` can grow later as long as queries cover every shard up to the largest `N` used. `GSI2` needs no sharding because each subject receives only a few events.

## Decisions

### Shard count

`N = 4` for every provider, defined once and shared by the code that writes events and the code that queries them.

> **Note:** Four shards let one provider take about 4,000 writes per second, leaving room for bursts above the 500–1,000 events per second target and for uneven hashing. The cost falls only on reads, as four queries per provider for each time interval. Revisit `N` after the load test.

### Event type

`event_type` stores the provider's own type, and no normalized type is stored. The one exception is `status`, the normalized status of a payment event.

> **Note:** Unsupported events still have a type, and fixing the mapping from provider types to business types never leaves stale data behind. A query across providers translates a business type into each provider's types with the adapters' mapping and filters with `event_type IN (...)`. `status` is stored because receipt ranks events by it, and a repeated delivery must be ranked with the status its first delivery reported; a corrected status mapping applies only to events received afterwards.

### Event order

`rank` joins the status precedence, the occurrence time, and the event ID. The precedence has two digits and the timestamps a fixed width, so comparing ranks as strings compares precedence first, then occurrence, then event ID, as [out-of-order events](../webhook-receipt.md#out-of-order-events) require. The conditional `PutItem` replaces a subject's status only when the stored rank is not higher, and a failed condition means the event is outdated.

> **Note:** The condition makes ranking atomic without a read first, so concurrent deliveries for one subject cannot both become the latest. An equal rank is the same event again, which rewrites the same item, so a repeated delivery of the latest event is not outdated. The precedence of each status is a business rule, kept with the code that ingests events rather than in the table.

### Subscription status

A subscription has no status item, and its events are never ranked. Its status is the platform's to derive from the payments that bill it, so each payment event stores the subscription it names in `subscription_id`.

> **Note:** Gateways model subscriptions differently, such as Stripe's `past_due` and `unpaid` and the retry settings that end them, so copying their statuses would leave grace periods and access rules to each gateway's configuration. Payment events are alike across providers, and each billing cycle is a payment of its own, ranked on its own, so a renewal's charge that starts `pending` after the previous one succeeded is not outdated. Subscription events are still stored and dispatched, because some facts, such as a cancellation made at the gateway, arrive only through them. Some providers name the subscription only on the payment itself, not on its refunds and chargebacks, so a reversal's subscription is found through the events of its payment. `subscription_id` is not projected into the indexes, so reading it needs `GetItem`.

### Retention

Every item's `expires_at` is the event's `received_at` plus 90 days, so DynamoDB TTL deletes all items of an event together.

> **Note:** The 90-day period is an assumption until [retention is clarified](../../requirements.md#7-business-requirements-to-clarify). It outlasts provider retries and the provider event histories used for reconciliation, such as Stripe's 30 days. A redelivery after expiry is treated as a new event, and `business_key` keeps it from repeating business effects. A subject's status expires with the event that reports it, so an older event that arrives more than 90 days after the latest one becomes the latest. Items are not archived before deletion.

### Payload size

`payload` stores the exact request bytes, gzip-compressed.

> **Note:** Compression also reduces write units. A body that still exceeds the 400 KB item limit is rejected with a 5xx response and an alarm, so the provider keeps retrying; there is no overflow storage in S3.
