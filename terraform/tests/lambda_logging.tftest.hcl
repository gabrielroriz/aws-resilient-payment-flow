mock_provider "aws" {}

variables {
  lambdasVersion                = "local"
  GATEWAY_GLOBAL_SIGNING_SECRET = "test-secret"
  GATEWAY_BRAZIL_ACCESS_TOKEN   = "test-token"
}

run "lambda_logging" {
  command = plan

  assert {
    condition     = toset(keys(aws_iam_role_policy_attachment.lambda_logs)) == toset(keys(local.lambda_roles))
    error_message = "Every Lambda role must be able to write its function's logs."
  }
  assert {
    condition = alltrue([
      for function in aws_lambda_function.all_lambdas :
      function.logging_config[0].log_format == "JSON" && function.logging_config[0].application_log_level == "INFO"
    ])
    error_message = "Every function must log in JSON format, filtered at INFO."
  }
}
