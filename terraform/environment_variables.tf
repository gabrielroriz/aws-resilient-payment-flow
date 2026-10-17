// The Lambdas' environment variables.
// Per-deployment values, such as secrets, are Terraform variables of the same name.
// Setting them with TF_VAR_<NAME> keeps them out of the repository.
// The others come from the resources Terraform manages.

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

// The deployment sets it from its time and Git commit, so versions sort by deploy.
variable "CODE_VERSION" {
  type        = string
  description = "Deploy time and commit SHA of the deployed code"
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
      CODE_VERSION              = var.CODE_VERSION
      WEBHOOK_EVENTS_TABLE_NAME = aws_dynamodb_table.webhook_events.name
    }
  }
}
