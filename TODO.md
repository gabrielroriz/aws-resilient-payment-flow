# TODO

Deployment improvements:

- [ ] Add a way to build and deploy a single Lambda selected by its registry name, without redeploying the other functions.

Deferred build and deployment tests:

- [ ] **Priority:** Verify invalid registry configuration fails before deleting existing bundles.
- [ ] **Priority:** Test deployment with Terraform mocked: each registered Lambda gets its own ZIP containing only `index.js`, and a failed build never reaches Terraform.
- [ ] Verify removing a Lambda from the registry removes its stale bundle on the next build.
- [ ] Verify a handler importing a Node.js built-in such as `node:crypto` bundles and runs successfully.

Gateway monitoring:

- [ ] Use DynamoDB Streams on the webhook events table to feed an external consumer that checks the health of each gateway and tracks its historical data, such as its duplicate delivery rate and malformed payload rate. Receipt rejects malformed payloads without storing them, so they must be recorded before the stream can count them.
