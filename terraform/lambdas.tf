locals {
  # The builder and Terraform read the same registry of AWS names and entry files.
  lambdas = jsondecode(file("${path.module}/../lambdas.json"))
  lambda_archives = {
    for name, config in local.lambdas : name => "${path.module}/../dist/${name}_${var.lambdasVersion}.zip"
  }
}

resource "aws_iam_role" "ts_lambda_role" {
  name = "ts_lambda-role"
  assume_role_policy = jsonencode({
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
resource "aws_lambda_function" "ts_lambda" {
  for_each = local.lambdas

  filename         = local.lambda_archives[each.key]
  source_code_hash = filebase64sha256(local.lambda_archives[each.key])
  function_name    = each.key
  role             = aws_iam_role.ts_lambda_role.arn
  handler          = "index.handler"
  runtime          = "nodejs24.x"
  memory_size      = lookup(each.value, "memory_size", 1024)
  timeout          = lookup(each.value, "timeout", 300)
}

output "lambda_functions" {
  description = "Deployed Lambda names, ARNs, and handlers, keyed by function name"
  value = {
    for name, function in aws_lambda_function.ts_lambda : name => {
      name    = function.function_name
      arn     = function.arn
      handler = function.handler
    }
  }
}
