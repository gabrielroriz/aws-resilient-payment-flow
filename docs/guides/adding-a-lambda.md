# Adding a Lambda

Each Lambda is an entry file that wires a controller into its driving adapter, registered with its trigger in [`lambdas.json`](../../lambdas.json). See [Code structure](../architecture/code-structure.md) for the layers and dependency injection rules.

## Steps

1. If the use case needs something external, define a port as an abstract class in `src/application/ports/` and implement it in `src/infra/<concern>/` with `@Injectable()`. See [Ports and contracts](../architecture/code-structure.md#ports-and-contracts) for the rules.
2. Add the use case in `src/application/usecases/<area>/`, decorated with `@Injectable(...)` listing its constructor dependencies.
3. Add a controller in `src/application/controller/<area>/` that calls the use case. HTTP controllers implement `Controller`; queue controllers implement the transport-neutral `MessageHandler` contract. Declare the shape of the request body or queue message with `@Schema` instead of checking fields in `handle`; see [Payload validation](../architecture/code-structure.md#payload-validation).
4. Add the entry in `src/main/functions/`: bind each port to its adapter, then export `handler = lambdaHttpAdapter(registry.resolve(YourController))` for HTTP, or use `lambdaSqsAdapter` for FIFO queues. Use the [health function](../../src/main/functions/health.ts) as the HTTP template, and see [Binding several ports](../architecture/code-structure.md#binding-several-ports) when the function needs more than one adapter.
5. Register the entry in `lambdas.json`; see [Registry fields](#registry-fields).
6. Add tests next to the new files, such as a `.test.ts` file beside the use case that passes fake ports to its constructor. See [Test layout](testing.md#test-layout).

## Registry fields

```json
"<function_name>": {
  "entry": "src/main/functions/<area>/<entry>.ts",
  "role": "<role>",
  "memory_size": 512,
  "timeout": 30,
  "http_method": "POST",
  "path": "/<resource>/{id}"
}
```

| Field | Meaning | Default |
|---|---|---|
| Object key | AWS function name | Required |
| `entry` | TypeScript file under `src/` exporting `handler` | Required |
| `role` | IAM role the function runs with, by its name in the Terraform `lambda_roles` local; see [Permissions](#permissions) | `default`, which grants no access to AWS services |
| `memory_size` | Memory in MB | `1024` |
| `timeout` | Function timeout in seconds | `300` |
| `trigger` | `http` creates API resources; `sqs` uses a Terraform event source mapping without an HTTP route | `http` |
| `http_method` | Client method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, or `ANY` | `ANY` |
| `path` | Route beginning with `/`; parameters such as `/<resource>/{id}` are supported | `/<function_name>` |

For `sqs`, omit `http_method` and `path`, add a consumer to the Terraform `sqs_consumers` local, grant receive, delete, and queue-attribute permissions for its queue, and add that policy to the event source mapping's `depends_on`. The shared mapping already enables `ReportBatchItemFailures`. Give the queue a visibility timeout of at least six times the function timeout, and add its dead-letter queue to the `local_sqs_redrive` output so local delivery redrives it too. The local poller uses exported mapping settings automatically; see [Development](development.md#local-functions).

HTTP method and path pairs must be unique. API Gateway always invokes the function with `POST`, whatever the route's method.

HTTP handlers receive payload format `2.0` events. `lambdaHttpAdapter` passes the path parameters, query parameters, headers, request ID, parsed JSON body, and raw body to the controller, decoding the body first when API Gateway base64-encodes it. A body that does not match the controller's schema is answered with `400` and `HTTP_INVALID_BODY` before the controller runs. Routes have no API Gateway authentication; a function that needs it authenticates requests itself.

## Permissions

Functions run with a default IAM role that grants no access to AWS services. A function that calls AWS services, such as DynamoDB, needs a dedicated role:

1. In `terraform/`, add an `aws_iam_role` that uses the shared Lambda assume-role policy.
2. Attach a policy that grants only the actions and resources the function uses.
3. Add the role to the `lambda_roles` local under a name.
4. Set the function's `role` field in `lambdas.json` to that name.

A `role` missing from `lambda_roles` fails the plan, so a typo never deploys a function without its permissions.

## Environment variables

Configuration and secrets reach a function as environment variables that Terraform sets, so the code never hardcodes them:

1. In `terraform/`, pick the value's source:

   | Value | Source | Example |
   |---|---|---|
   | Describes a resource Terraform manages | An attribute of that resource | A queue's or table's name |
   | Set per deployment | A variable with the environment variable's name, marked `sensitive` when it holds a secret, so its value never lives in the repository | A provider credential |

2. Add it to the function in the `lambda_environments` local.
3. Declare it in the environment schema under the group of code that uses it, and read it through `AppConfig`; see [Configuration](../architecture/code-structure.md#configuration).
4. Give a variable a value for deployments, as in the [deployment setup](deployment.md#setup), and for local runs; see [Local limitations](development.md#local-limitations). A resource attribute needs no value.

A variable without a value fails the plan, so a deployment never runs without its configuration. Local runs read resource attributes from the plan, so prefer attributes set in the configuration, such as names: one known only after apply, such as an ARN or a queue URL, is missing locally until the resource is deployed.

## Lifecycle

Build and test before [deploying](deployment.md). Terraform manages the function and its HTTP resources or queue event source mapping together. Removing an entry deletes its function; renaming a key can replace it.
