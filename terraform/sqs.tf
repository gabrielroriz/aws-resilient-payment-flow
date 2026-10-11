// Stored webhook events waiting to be processed. Each provider's events form one message group,
// so they are delivered in the order they were received, one batch at a time per provider.
resource "aws_sqs_queue" "webhook_events" {
  name       = "webhook_events.fifo"
  fifo_queue = true
  // Allow Lambda's retries time to finish before a batch becomes visible again.
  visibility_timeout_seconds = 6 * local.lambdas.webhook_worker.timeout

  // A message that keeps failing moves to the dead-letter queue instead of holding back the rest
  // of its provider's events.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.webhook_events_dlq.arn
    maxReceiveCount     = local.webhook_max_receive_count
  })
}

// Events whose processing kept failing, kept for investigation and redrive. A FIFO queue needs a
// FIFO dead-letter queue.
resource "aws_sqs_queue" "webhook_events_dlq" {
  name       = "webhook_events_dlq.fifo"
  fifo_queue = true
  // FIFO redrive resets the enqueue time; keep failed events for the maximum investigation window.
  message_retention_seconds = 1209600
}

locals {
  webhook_max_receive_count = 5
  sqs_consumers = {
    webhook_worker = { queue = aws_sqs_queue.webhook_events, batch_size = 10 }
  }
}

output "local_sqs_redrive" {
  description = "Redrive targets by name, available locally before queue ARNs exist"
  value = {
    (aws_sqs_queue.webhook_events.name) = {
      queueName       = aws_sqs_queue.webhook_events_dlq.name
      maxReceiveCount = local.webhook_max_receive_count
    }
  }
}

resource "aws_lambda_event_source_mapping" "sqs" {
  for_each = local.sqs_consumers

  event_source_arn        = each.value.queue.arn
  function_name           = aws_lambda_function.all_lambdas[each.key].function_name
  batch_size              = each.value.batch_size
  function_response_types = ["ReportBatchItemFailures"]
  enabled                 = true

  depends_on = [aws_iam_role_policy.webhook_events_consume, aws_iam_role_policy.webhook_events_read, aws_iam_role_policy_attachment.webhook_worker_logs]
}

resource "aws_iam_role_policy" "webhook_events_consume" {
  name = "webhook-events-consume"
  role = aws_iam_role.webhook_worker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
      Resource = aws_sqs_queue.webhook_events.arn
    }]
  })
}

// Names are known before apply, so local polling also works for an undeployed event source.
output "local_sqs_consumers" {
  description = "Local consumers derived from the deployed event source configuration"
  value = {
    for name, mapping in aws_lambda_event_source_mapping.sqs : name => {
      function_name           = mapping.function_name
      queue_name              = local.sqs_consumers[name].queue.name
      batch_size              = mapping.batch_size
      enabled                 = mapping.enabled
      function_response_types = mapping.function_response_types
    }
  }
}

output "webhook_events_queue" {
  description = "Name and URL of the webhook events queue and of its dead-letter queue"
  value = {
    name                   = aws_sqs_queue.webhook_events.name
    url                    = aws_sqs_queue.webhook_events.url
    dead_letter_queue_name = aws_sqs_queue.webhook_events_dlq.name
    dead_letter_queue_url  = aws_sqs_queue.webhook_events_dlq.url
  }
}

// The webhook entry point dispatches each stored event to the queue, which it finds by the name in
// its environment.
resource "aws_iam_role_policy" "webhook_events_dispatch" {
  name = "webhook-events-dispatch"
  role = aws_iam_role.webhook_entry_point.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:GetQueueUrl", "sqs:SendMessage"]
        Resource = aws_sqs_queue.webhook_events.arn
      }
    ]
  })
}
