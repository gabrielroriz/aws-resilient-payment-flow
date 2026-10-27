mock_provider "aws" {}

variables {
  lambdasVersion                = "local"
  CODE_VERSION                  = "test-version"
  GATEWAY_GLOBAL_SIGNING_SECRET = "test-secret"
  GATEWAY_BRAZIL_ACCESS_TOKEN   = "test-token"
}

run "subscription_grant_access_workflow" {
  command = plan

  assert {
    condition     = !contains(keys(aws_apigatewayv2_route.lambda), "wf_subscription_grant_access") && !contains(keys(aws_lambda_event_source_mapping.sqs), "wf_subscription_grant_access")
    error_message = "Only the worker starts the subscription_grant_access workflow; it has no route or queue."
  }
  assert {
    condition     = aws_lambda_function.all_lambdas["wf_subscription_grant_access"].publish && length(aws_lambda_function.all_lambdas["wf_subscription_grant_access"].durable_config) == 1
    error_message = "wf_subscription_grant_access must be a durable function with published versions for its executions."
  }
  assert {
    condition     = aws_lambda_function.all_lambdas["wf_subscription_grant_access"].durable_config[0].execution_timeout >= 4 * 60 * 60 + 11 * 60
    error_message = "An execution must outlast its step's retries, which span up to about 4 hours."
  }
  assert {
    condition = alltrue([
      for name, function in aws_lambda_function.all_lambdas :
      !function.publish && length(function.durable_config) == 0 if name != "wf_subscription_grant_access"
    ])
    error_message = "Only durable functions publish versions."
  }
  assert {
    condition     = aws_lambda_alias.durable["wf_subscription_grant_access"].name == "live"
    error_message = "The worker starts each workflow as wf_<workflow>:live, so the alias must be live."
  }
  assert {
    condition     = length(aws_lambda_function.all_lambdas["wf_subscription_grant_access"].environment) == 0
    error_message = "wf_subscription_grant_access stores nothing yet, so it needs no table or other configuration."
  }
}

// Policies name ARNs and IDs known only after apply, so the plan gets fixed ones.
run "subscription_grant_access_permissions" {
  command = plan

  override_resource {
    target          = aws_lambda_function.all_lambdas
    override_during = plan
    values = {
      arn = "arn:aws:lambda:us-east-1:000000000000:function:wf_subscription_grant_access"
    }
  }
  override_resource {
    target          = aws_lambda_alias.durable
    override_during = plan
    values = {
      arn = "arn:aws:lambda:us-east-1:000000000000:function:wf_subscription_grant_access:live"
    }
  }
  override_resource {
    target          = aws_iam_role.subscription_grant_access
    override_during = plan
    values = {
      id  = "subscription-grant-access-role"
      arn = "arn:aws:iam::000000000000:role/subscription-grant-access-role"
    }
  }
  assert {
    condition     = aws_iam_role_policy.durable_checkpoint["wf_subscription_grant_access"].role == aws_iam_role.subscription_grant_access.id && strcontains(aws_iam_role_policy.durable_checkpoint["wf_subscription_grant_access"].policy, "lambda:CheckpointDurableExecution") && strcontains(aws_iam_role_policy.durable_checkpoint["wf_subscription_grant_access"].policy, "${aws_lambda_function.all_lambdas["wf_subscription_grant_access"].arn}:*")
    error_message = "wf_subscription_grant_access must be able to checkpoint its own executions, on every version."
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.webhook_worker_start_workflows.policy).Statement[0].Resource == [aws_lambda_alias.durable["wf_subscription_grant_access"].arn]
    error_message = "The worker may invoke subscription_grant_access only through its alias."
  }
}
