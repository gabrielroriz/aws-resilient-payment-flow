// Durable functions run business workflows that other functions start.

// The worker starts executions through this alias, which follows each new version.
// Running executions stay on the version that started them.
// The worker derives each alias's qualified name, `wf_<workflow>:live`.
resource "aws_lambda_alias" "durable" {
  for_each = local.durable_lambdas

  name             = "live"
  function_name    = aws_lambda_function.all_lambdas[each.key].function_name
  function_version = aws_lambda_function.all_lambdas[each.key].version

  // No execution starts before its function can checkpoint.
  depends_on = [aws_iam_role_policy.durable_checkpoint]
}

// A durable function records each step's result and reads it back on replay.
// Only its qualified ARNs match, so the policy names every version.
resource "aws_iam_role_policy" "durable_checkpoint" {
  for_each = local.durable_lambdas

  name = "${replace(each.key, "_", "-")}-checkpoint"
  role = local.lambda_roles[lookup(each.value, "role", "default")].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:CheckpointDurableExecution", "lambda:GetDurableExecutionState"]
      Resource = "${aws_lambda_function.all_lambdas[each.key].arn}:*"
    }]
  })
}

// The worker starts each workflow through its alias, the only name it may invoke.
resource "aws_iam_role_policy" "webhook_worker_start_workflows" {
  name = "webhook-worker-start-workflows"
  role = aws_iam_role.webhook_worker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = [for alias in aws_lambda_alias.durable : alias.arn]
    }]
  })
}
