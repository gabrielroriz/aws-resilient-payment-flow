locals {
  # The builder and Terraform read the same registry of AWS names and entry files.
  lambdas = jsondecode(file("${path.module}/../lambdas.json"))
  lambda_archives = {
    for name, config in local.lambdas : name => "${path.module}/../dist/${name}_${var.lambdasVersion}.zip"
  }
  # Roles a function can select with "role" in lambdas.json; functions that select none use "default".
  lambda_roles = {
    default             = aws_iam_role.lambda_default.arn
    webhook_entry_point = aws_iam_role.webhook_entry_point.arn
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

// Functions that select no role run with this one, which grants no access to AWS services.
resource "aws_iam_role" "lambda_default" {
  name               = "lambda-default-role"
  assume_role_policy = local.lambda_assume_role_policy
}

// The webhook entry point receives every provider's webhooks; the permissions it needs attach here.
resource "aws_iam_role" "webhook_entry_point" {
  name               = "webhook-entry-point-role"
  assume_role_policy = local.lambda_assume_role_policy
}

resource "aws_lambda_function" "all_lambdas" {
  for_each = local.lambdas

  filename         = local.lambda_archives[each.key]
  source_code_hash = filebase64sha256(local.lambda_archives[each.key])
  function_name    = each.key
  // The role selected by "role" in lambdas.json; a name missing from lambda_roles fails the plan.
  role        = local.lambda_roles[lookup(each.value, "role", "default")]
  handler     = "index.handler"
  runtime     = "nodejs24.x"
  memory_size = lookup(each.value, "memory_size", 1024)
  timeout     = lookup(each.value, "timeout", 300)
}

output "lambda_functions" {
  description = "Deployed Lambda names, ARNs, and handlers, keyed by function name"
  value = {
    for name, function in aws_lambda_function.all_lambdas : name => {
      name    = function.function_name
      arn     = function.arn
      handler = function.handler
    }
  }
}
