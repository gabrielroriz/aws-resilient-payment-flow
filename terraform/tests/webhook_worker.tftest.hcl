mock_provider "aws" {}

variables {
  lambdasVersion                = "local"
  CODE_VERSION                  = "test-version"
  GATEWAY_GLOBAL_SIGNING_SECRET = "test-secret"
  GATEWAY_BRAZIL_ACCESS_TOKEN   = "test-token"
}

run "worker_event_source" {
  command = plan

  assert {
    condition     = !contains(keys(aws_apigatewayv2_route.lambda), "webhook_worker") && contains(keys(aws_apigatewayv2_route.lambda), "webhook_entry_point")
    error_message = "The worker must only consume SQS; the receipt HTTP route must remain available."
  }
  assert {
    condition     = aws_lambda_event_source_mapping.sqs["webhook_worker"].function_name == "webhook_worker" && contains(aws_lambda_event_source_mapping.sqs["webhook_worker"].function_response_types, "ReportBatchItemFailures")
    error_message = "The queue must invoke the worker with partial batch responses enabled."
  }
  assert {
    condition     = aws_sqs_queue.webhook_events.visibility_timeout_seconds >= 6 * aws_lambda_function.all_lambdas["webhook_worker"].timeout
    error_message = "Queue visibility must leave enough time for Lambda retries."
  }
  assert {
    condition     = output.local_sqs_consumers.webhook_worker.queue_name == "webhook_events.fifo" && output.local_sqs_consumers.webhook_worker.batch_size == aws_lambda_event_source_mapping.sqs["webhook_worker"].batch_size
    error_message = "Local consumption must follow the deployed mapping before any AWS resources exist."
  }
  assert {
    condition     = output.local_sqs_redrive["webhook_events.fifo"].queueName == "webhook_events_dlq.fifo" && output.local_sqs_redrive["webhook_events.fifo"].maxReceiveCount == 5
    error_message = "Local redrive must remain available before deploying the dead-letter queue."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.webhook_events_dlq_not_empty.dimensions.QueueName == aws_sqs_queue.webhook_events_dlq.name && aws_cloudwatch_metric_alarm.webhook_events_dlq_not_empty.metric_name == "ApproximateNumberOfMessagesVisible" && aws_cloudwatch_metric_alarm.webhook_events_dlq_not_empty.threshold == 0
    error_message = "The dead-letter queue must alarm when a message awaits attention."
  }
  assert {
    condition = alltrue([
      for name in ["webhook_entry_point", "webhook_worker"] :
      aws_lambda_function.all_lambdas[name].environment[0].variables.WEBHOOK_EVENTS_TABLE_NAME == aws_dynamodb_table.webhook_events.name
    ])
    error_message = "Receipt and the worker must read the webhook events table Terraform provisions."
  }
  assert {
    condition = alltrue([
      for name in ["health", "webhook_worker"] :
      aws_lambda_function.all_lambdas[name].environment[0].variables.CODE_VERSION == "test-version"
    ])
    error_message = "Health and the worker must receive the deployed code version."
  }
}

run "alarm_notification" {
  command = plan

  variables {
    ALARM_NOTIFICATION_TOPIC_ARN = "arn:aws:sns:us-east-1:000000000000:alerts"
  }

  assert {
    condition     = contains(aws_cloudwatch_metric_alarm.webhook_events_dlq_not_empty.alarm_actions, var.ALARM_NOTIFICATION_TOPIC_ARN)
    error_message = "A configured topic must receive dead-letter queue alarm notifications."
  }
}
