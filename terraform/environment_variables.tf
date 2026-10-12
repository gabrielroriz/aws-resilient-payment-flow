// The Lambdas' environment variables. Values set per deployment, such as secrets, are Terraform
// variables of the same name, so they can be set with TF_VAR_<NAME> and never live in the
// repository; the others come from the resources Terraform manages.

variable "GATEWAY_GLOBAL_SIGNING_SECRET" {
  type        = string
  sensitive   = true
  description = "Secret gatewayGlobal signs its webhooks with"
}

variable "GATEWAY_BRAZIL_ACCESS_TOKEN" {
  type        = string
  sensitive   = true
  description = "Access token gatewayBrazil sends with its webhooks"
}

locals {
  # Environment variables of each function by its name in lambdas.json.
  lambda_environments = {
    webhook_entry_point = {
      GATEWAY_GLOBAL_SIGNING_SECRET = var.GATEWAY_GLOBAL_SIGNING_SECRET
      GATEWAY_BRAZIL_ACCESS_TOKEN   = var.GATEWAY_BRAZIL_ACCESS_TOKEN
      WEBHOOK_EVENTS_QUEUE_NAME     = aws_sqs_queue.webhook_events.name
      WEBHOOK_EVENTS_TABLE_NAME     = aws_dynamodb_table.webhook_events.name
    }
    webhook_worker = {
      WEBHOOK_EVENTS_TABLE_NAME = aws_dynamodb_table.webhook_events.name
    }
  }
}
