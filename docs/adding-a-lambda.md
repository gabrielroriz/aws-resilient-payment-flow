# Adding a Lambda

Each Lambda is an entry file that wires one controller into the HTTP adapter. See [Architecture](architecture.md) for the layers and dependency injection rules.

## Steps

1. If the use case needs something external, define a port as an abstract class in `src/application/ports/` and implement it in `src/infra/<concern>/` with `@Injectable()`. See [Ports and contracts](architecture.md#ports-and-contracts) for the rules.
2. Add the use case in `src/application/usecases/<area>/`, decorated with `@Injectable(...)` listing its constructor dependencies.
3. Add a controller in `src/application/controller/<area>/` that implements `Controller` and calls the use case.
4. Add the entry in `src/main/functions/`: bind each port to its adapter, then export `handler = lambdaHttpAdapter(registry.resolve(YourController))`. Use [`health.ts`](../src/main/functions/health.ts) as the template, and see [Binding several ports](architecture.md#binding-several-ports) when the function needs more than one adapter.
5. Register the entry in [`lambdas.json`](../lambdas.json).
6. Add tests next to the new files, such as a `.test.ts` file beside the use case that passes fake ports to its constructor. See [Test layout](testing.md#test-layout).

## Registry fields

```json
"payment_webhook": {
  "entry": "src/main/functions/paymentWebhook.ts",
  "memory_size": 512,
  "timeout": 30,
  "http_method": "POST",
  "path": "/webhooks/{provider}"
}
```

| Field | Meaning | Default |
|---|---|---|
| Object key | AWS function name | Required |
| `entry` | TypeScript file under `src/` exporting `handler` | Required |
| `memory_size` | Memory in MB | `1024` |
| `timeout` | Lambda timeout in seconds | `300` |
| `http_method` | Client method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, or `ANY` | `ANY` |
| `path` | Route beginning with `/`; parameters such as `/events/{id}` are supported | `/<function-name>` |

Method/path pairs must be unique. Replace path parameters when calling routes. Backend Lambda invocation always uses `POST`, regardless of `http_method`.

Handlers receive payload format `2.0` events; `lambdaHttpAdapter` passes path parameters, query parameters, headers, and the parsed JSON body to the controller. The current routes have no authentication.

## Lifecycle

Build and test before [deploying](deployment.md). Terraform manages the function, route, and invocation permission together. Removing an entry deletes its function; renaming a key can replace it.
