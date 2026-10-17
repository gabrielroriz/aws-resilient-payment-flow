locals {
  # The builder and Terraform read the same registry of AWS names and entry files.
  lambdas = jsondecode(file("${path.module}/../lambdas.json"))
  lambda_archives = {
    for name, config in local.lambdas : name => "${path.module}/../dist/${name}_${var.lambdasVersion}.zip"
  }
  # Roles a function can select with "role" in lambdas.json; functions that select none use "default".
  lambda_roles = {
    default             = aws_iam_role.lambda_default
    webhook_entry_point = aws_iam_role.webhook_entry_point
    webhook_worker      = aws_iam_role.webhook_worker
  }
  # Lets the Lambda service run functions with a role; shared by every Lambda role.
  lambda_assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

// Functions that select no role run with this one, which only lets them write their logs.
resource "aws_iam_role" "lambda_default" {
  name               = "lambda-default-role"
  assume_role_policy = local.lambda_assume_role_policy
}

// The webhook entry point receives every provider's webhooks; the permissions it needs attach here.
resource "aws_iam_role" "webhook_entry_point" {
  name               = "webhook-entry-point-role"
  assume_role_policy = local.lambda_assume_role_policy
}

resource "aws_iam_role" "webhook_worker" {
  name               = "webhook-worker-role"
  assume_role_policy = local.lambda_assume_role_policy
}

// Every role can write its function's logs, so no function fails silently in AWS.
resource "aws_iam_role_policy_attachment" "lambda_logs" {
  for_each = local.lambda_roles

  role       = each.value.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

// Moves the worker's existing attachment rather than replacing it, so it never loses log access.
moved {
  from = aws_iam_role_policy_attachment.webhook_worker_logs
  to   = aws_iam_role_policy_attachment.lambda_logs["webhook_worker"]
}

resource "aws_lambda_function" "all_lambdas" {
  for_each = local.lambdas

  filename         = local.lambda_archives[each.key]
  source_code_hash = filebase64sha256(local.lambda_archives[each.key])
  function_name    = each.key
  // The role selected by "role" in lambdas.json; a name missing from lambda_roles fails the plan.
  role        = local.lambda_roles[lookup(each.value, "role", "default")].arn
  handler     = "index.handler"
  runtime     = "nodejs24.x"
  memory_size = lookup(each.value, "memory_size", 1024)
  timeout     = lookup(each.value, "timeout", 300)

  // Lambda filters the functions' JSON lines by level and writes its own records as JSON too.
  logging_config {
    log_format            = "JSON"
    application_log_level = "INFO"
    system_log_level      = "INFO"
  }

  // Only functions listed in lambda_environments get an environment.
  // The condition reads names only, because Terraform cannot decide which blocks to create from
  // sensitive values.
  dynamic "environment" {
    for_each = contains(keys(local.lambda_environments), each.key) ? [each.key] : []
    content {
      variables = local.lambda_environments[environment.value]
    }
  }
}

output "lambda_functions" {
  description = "Deployed Lambda names, ARNs, handlers, package sizes, and memory sizes, keyed by function name"
  value = {
    for name, function in aws_lambda_function.all_lambdas : name => {
      name        = function.function_name
      arn         = function.arn
      handler     = function.handler
      code_size   = format("%.1f KiB", function.source_code_size / 1024)
      memory_size = "${function.memory_size} MB"
    }
  }
}
