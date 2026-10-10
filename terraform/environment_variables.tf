// The Lambdas' environment variables. Each one is a Terraform variable of the same name, so its
// value can be set with TF_VAR_<NAME> and never lives in the repository.

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
    }
  }
}
