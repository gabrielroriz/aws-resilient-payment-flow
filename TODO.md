# TODO

Deployment improvements:

- [ ] Add a way to build and deploy a single Lambda selected by its registry name, without redeploying the other functions.

Deferred build and deployment tests:

- [ ] **Priority:** Verify invalid registry configuration fails before deleting existing bundles.
- [ ] **Priority:** Test deployment with Terraform mocked: each registered Lambda gets its own ZIP containing only `index.js`, and a failed build never reaches Terraform.
- [ ] Verify removing a Lambda from the registry removes its stale bundle on the next build.
- [ ] Verify a handler importing a Node.js built-in such as `node:crypto` bundles and runs successfully.

Processing after rank checks:

- [ ] Once every business effect writes with its rank condition and is idempotent, investigate processing the later records of a failed message's group in the same batch instead of skipping them. Skipped records spend receives, so they can reach the dead-letter queue without being attempted; processing them gives each its own attempts, at the cost of running them out of queue order, which the rank checks make safe.

Event history and admin dashboard:

- [ ] Project events, attempts, effects, and deliveries from DynamoDB Streams into a PostgreSQL read model kept for years, partitioned by month on `occurred_at`, skipping TTL deletions.
- [ ] Backfill the read model from the table, for its first load and for gaps longer than the stream's 24-hour retention.
- [ ] Add an admin API behind operator authentication that lists events filtered by provider, event ID, processing status, subject ID, `occurred_at` interval, outdated flag, and repeated deliveries, and shows each event with its payload, attempts, effects, and deliveries.
- [ ] Build the dashboard on that API.

Gateway monitoring:

- [ ] Use DynamoDB Streams on the webhook events table to feed an external consumer that checks the health of each gateway and tracks its historical data, such as its duplicate delivery rate and malformed payload rate. Receipt rejects malformed payloads without storing them, so they must be recorded before the stream can count them.
