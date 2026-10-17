# TODO

Deployment improvements:

- [ ] Add a way to build and deploy a single Lambda selected by its registry name, without redeploying the other functions.

Deferred build and deployment tests:

- [ ] **Priority:** Verify invalid registry configuration fails before deleting existing bundles.
- [ ] **Priority:** Test deployment with Terraform mocked: each registered Lambda gets its own ZIP containing only `index.js`, and a failed build never reaches Terraform.
- [ ] Verify removing a Lambda from the registry removes its stale bundle on the next build.
- [ ] Verify a handler importing a Node.js built-in such as `node:crypto` bundles and runs successfully.

Processing status:

- [ ] Move routing from the provider registry into a process use case, so the worker's status changes live in the application layer.
- [ ] Give the worker the deployed code version, to record as each attempt's `handler_version`.
- [ ] Record each processing attempt: write its attempt item, then move the event to `processing`, and afterwards to `processed` or `failed`, with conditional updates. Avoid transactions, which bill every write twice.
- [ ] Make the worker skip `processed` and `dead_lettered` events, and take over a `processing` event whose attempt started longer ago than the worker timeout.
- [ ] Add a dead-letter queue consumer that marks events `dead_lettered`, from any status that is not final, since a message can reach the queue without ever being attempted.
- [ ] Process events stored before processing statuses existed, which have no `processing_status`, until TTL removes them.
- [ ] Check the processing statuses end to end with the simulator, including a failure that ends in the dead-letter queue.
- [ ] Consider moving the payload into its own item, so a status update costs one write unit whatever the payload size.

Event history and admin dashboard:

- [ ] Project events, attempts, effects, and deliveries from DynamoDB Streams into a PostgreSQL read model kept for years, partitioned by month on `occurred_at`, skipping TTL deletions.
- [ ] Backfill the read model from the table, for its first load and for gaps longer than the stream's 24-hour retention.
- [ ] Add an admin API behind operator authentication that lists events filtered by provider, event ID, processing status, subject ID, `occurred_at` interval, outdated flag, and repeated deliveries, and shows each event with its payload, attempts, effects, and deliveries.
- [ ] Build the dashboard on that API.

Gateway monitoring:

- [ ] Use DynamoDB Streams on the webhook events table to feed an external consumer that checks the health of each gateway and tracks its historical data, such as its duplicate delivery rate and malformed payload rate. Receipt rejects malformed payloads without storing them, so they must be recorded before the stream can count them.
