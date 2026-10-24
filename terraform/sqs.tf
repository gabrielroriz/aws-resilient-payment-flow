// Stored webhook events waiting to be processed.
// Each subject's events form one message group, so they keep their arrival order.
// Each group is delivered one batch at a time.
resource "aws_sqs_queue" "webhook_events" {
  name       = "webhook_events.fifo"
  fifo_queue = true
  // High throughput spreads subjects over partitions, lifting the 300 sends/s cap.
  // An event always lands in one group, so per-group deduplication catches repeats.
  deduplication_scope   = "messageGroup"
  fifo_throughput_limit = "perMessageGroupId"
  // Allow Lambda's retries time to finish before a batch becomes visible again.
  visibility_timeout_seconds = 6 * local.lambdas.webhook_worker.timeout

  // A message that keeps failing is dead-lettered instead of blocking its subject.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.webhook_events_dlq.arn
    maxReceiveCount     = local.webhook_max_receive_count
  })
}

// Events whose processing kept failing, kept for investigation and redrive.
// The worker also parks events that can never succeed here at once.
// A FIFO queue needs a FIFO dead-letter queue.
resource "aws_sqs_queue" "webhook_events_dlq" {
  name       = "webhook_events_dlq.fifo"
  fifo_queue = true
  // FIFO redrive resets the enqueue time; keep failed events as long as SQS allows.
  message_retention_seconds = 1209600
}

// Alert when failed messages are waiting for inspection or redrive.
resource "aws_cloudwatch_metric_alarm" "webhook_events_dlq_not_empty" {
  alarm_name          = "webhook-events-dlq-not-empty"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.ALARM_NOTIFICATION_TOPIC_ARN == null ? [] : [var.ALARM_NOTIFICATION_TOPIC_ARN]

  dimensions = {
    QueueName = aws_sqs_queue.webhook_events_dlq.name
  }
}

locals {
  webhook_max_receive_count = 5
  # Concurrency grows with active message groups, so each mapping caps it.
  sqs_consumers = {
    webhook_worker = { queue = aws_sqs_queue.webhook_events, batch_size = 10, max_concurrency = 50 }
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

  scaling_config {
    maximum_concurrency = each.value.max_concurrency
  }

  depends_on = [
    aws_iam_role_policy.webhook_events_consume,
    aws_iam_role_policy.webhook_events_park,
    aws_iam_role_policy.webhook_events_read,
    aws_iam_role_policy.webhook_events_process,
    aws_iam_role_policy_attachment.lambda_logs
  ]
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

// The worker parks messages that can never succeed in the queue it finds by name.
resource "aws_iam_role_policy" "webhook_events_park" {
  name = "webhook-events-park"
  role = aws_iam_role.webhook_worker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:GetQueueUrl", "sqs:SendMessage"]
      Resource = aws_sqs_queue.webhook_events_dlq.arn
    }]
  })
}

// Names are known before apply, so local polling works without a deployed mapping.
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

// The webhook entry point dispatches stored events to the queue it finds by name.
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
