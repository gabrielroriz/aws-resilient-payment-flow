locals {
  lambda_paths = {
    for name, config in local.lambdas : name => lookup(config, "path", "/${name}")
  }
}

// HTTP API Gateway for Lambda functions
resource "aws_apigatewayv2_api" "lambdas" {
  name = "aws-resilient-payment-flow"
  // HTTP APIs are cheaper and faster than REST APIs, but have fewer features.
  protocol_type = "HTTP"
}

// Create a default stage for the API Gateway
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.lambdas.id
  name        = "$default"
  auto_deploy = true
}

// Integrate Lambdas with API Gateway
resource "aws_apigatewayv2_integration" "lambda" {
  for_each = aws_lambda_function.all_lambdas

  api_id           = aws_apigatewayv2_api.lambdas.id
  integration_type = "AWS_PROXY"
  integration_uri  = each.value.invoke_arn
  # Lambda invocation uses POST independently of the public route's HTTP method.
  integration_method     = "POST"
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000 // 30 seconds (max for HTTP APIs)
}

// Route methods and paths come from the shared Lambda registry.
resource "aws_apigatewayv2_route" "lambda" {
  for_each = aws_lambda_function.all_lambdas

  api_id             = aws_apigatewayv2_api.lambdas.id
  route_key          = "${lookup(local.lambdas[each.key], "http_method", "ANY")} ${local.lambda_paths[each.key]}"
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.lambda[each.key].id}"
}

// Allow API Gateway to invoke the Lambda functions
resource "aws_lambda_permission" "api_gateway" {
  for_each = aws_lambda_function.all_lambdas

  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = each.value.function_name
  principal     = "apigateway.amazonaws.com"
  # Match actual request paths, including values substituted for route parameters.
  source_arn = "${aws_apigatewayv2_api.lambdas.execution_arn}/${aws_apigatewayv2_stage.default.name}/*${replace(local.lambda_paths[each.key], "/\\{[^}]+\\}/", "*")}"
}

output "api_endpoint" {
  description = "Base URL of the HTTP API"
  value       = aws_apigatewayv2_api.lambdas.api_endpoint
}

output "lambda_endpoints" {
  description = "HTTP endpoint for each registered Lambda (method and path configured in lambdas.json)"
  value = {
    for name, function in aws_lambda_function.all_lambdas :
    name => "${aws_apigatewayv2_api.lambdas.api_endpoint}${local.lambda_paths[name]}"
  }
}
