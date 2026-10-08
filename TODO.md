# TODO

Deferred build and deployment tests:

- [ ] **Priority:** Verify invalid registry configuration fails before deleting existing bundles.
- [ ] **Priority:** Test deployment with Terraform mocked: each registered Lambda gets its own ZIP containing only `index.js`, and a failed build never reaches Terraform.
- [ ] Verify removing a Lambda from the registry removes its stale bundle on the next build.
- [ ] Verify a handler importing a Node.js built-in such as `node:crypto` bundles and runs successfully.
