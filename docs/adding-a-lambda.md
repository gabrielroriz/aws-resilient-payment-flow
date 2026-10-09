# Adding a Lambda

Export `handler` from a TypeScript file under `src/`, then register it in
[`lambdas.json`](../lambdas.json):

```json
"ts_lambda_3": {
  "entry": "src/lambdas/lambda_3.ts",
  "memory_size": 512,
  "timeout": 30,
  "http_method": "POST",
  "path": "/example"
}
```

| Field | Meaning | Default |
|---|---|---|
| Object key | AWS function name | Required |
| `entry` | TypeScript handler file | Required |
| `memory_size` | Memory in MB | `1024` |
| `timeout` | Lambda timeout in seconds | `300` |
| `http_method` | Client method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, or `ANY` | `ANY` |
| `path` | Route beginning with `/`; parameters such as `/events/{id}` are supported | `/<function-name>` |

Method/path pairs must be unique. Replace path parameters when calling routes.
Backend Lambda invocation always uses `POST`, regardless of `http_method`.

Handlers receive payload format `2.0` events and return `statusCode`, optional
`headers`, and a string `body`. The current routes have no authentication.

Build and test before [deploying](deployment.md). Terraform manages the function,
route, and invocation permission together. Removing an entry deletes its function;
renaming a key can replace it.
