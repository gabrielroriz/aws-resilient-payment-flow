# Webhook events table

The `webhook_events` DynamoDB table records the webhook events received from payment providers. It detects repeated deliveries and keeps each event's processing attempts and business effects, so operators can trace and reprocess events as the [requirements](../REQUIREMENTS.md) describe. Terraform does not provision it yet.

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

- When the conditional `PutItem` fails, `ReturnValuesOnConditionCheckFailure=ALL_OLD` returns the stored event, so detecting a duplicate needs no extra read. The duplicate delivery is recorded next.
- Time-interval queries merge the results of every shard by `received_at`; see [GSI1 sharding](#gsi1-sharding).

## Keys

| Key | Attribute | Type | Value |
|---|---|---|---|
| Partition key | `PK` | String | `event_key`, which is `{provider}#{provider_event_id}` so events from different providers never collide |
| Sort key | `SK` | String | Item type; see [Items](#items) |

All items of an event share its `event_key`, so one `Query` returns the whole event.

## Items

| Item | `SK` | Written |
|---|---|---|
| [Event](#event) | `META` | Once, at receipt, by the conditional `PutItem` |
| [Attempt](#attempt) | `ATTEMPT#{started_at}#{attempt_id}` | Once per processing attempt |
| [Effect](#effect) | `EFFECT#{effect}` | When a business effect of the event completes or fails |
| [Delivery](#delivery) | `DELIVERY#{received_at}#{request_id}` | On each duplicate delivery |

Timestamps are UTC ISO 8601 strings with fixed millisecond precision, so they sort correctly in keys. `expires_at` is the exception: DynamoDB TTL requires a number of epoch seconds.

### Event

| Attribute | Type | Description |
|---|---|---|
| `provider` | String | Provider name, such as `stripe` |
| `provider_event_id` | String | Event ID assigned by the provider |
| `event_type` | String | The provider's own event type, such as Stripe's `invoice.paid`; see [Event type](#event-type) |
| `occurred_at` | String | When the provider says the event happened |
| `received_at` | String | When the webhook reached the API |
| `subject_type` | String | Business object the event affects, such as `payment` or `subscription` |
| `subject_id` | String | The provider's ID for the subject; a refund uses its payment's ID |
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
| `error_code` | String | Stable code from [`ErrorCode`](../../src/application/errors/ErrorCode.ts), present when the attempt failed |
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

`event_type` stores the provider's own type, and no normalized type is stored.

> **Note:** Unsupported events still have a type, and fixing the mapping from provider types to business types never leaves stale data behind. A query across providers translates a business type into each provider's types with the adapters' mapping and filters with `event_type IN (...)`.

### Retention

Every item's `expires_at` is the event's `received_at` plus 90 days, so DynamoDB TTL deletes all items of an event together.

> **Note:** The 90-day period is an assumption until [retention is clarified](../REQUIREMENTS.md#7-business-requirements-to-clarify). It outlasts provider retries and the 30-day Stripe event history used for reconciliation. A redelivery after expiry is treated as a new event, and `business_key` keeps it from repeating business effects. Items are not archived before deletion.

### Payload size

`payload` stores the exact request bytes, gzip-compressed.

> **Note:** Compression also reduces write units. A body that still exceeds the 400 KB item limit is rejected with a 5xx response and an alarm, so the provider keeps retrying; there is no overflow storage in S3.
