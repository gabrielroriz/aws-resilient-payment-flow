// Stored webhook events waiting to be processed. Each provider's events form one message group,
// so they are delivered in the order they were received, one batch at a time per provider.
resource "aws_sqs_queue" "webhook_events" {
  name       = "webhook_events.fifo"
  fifo_queue = true

  // A message that keeps failing moves to the dead-letter queue instead of holding back the rest
  // of its provider's events.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.webhook_events_dlq.arn
    maxReceiveCount     = 5
  })
}

// Events whose processing kept failing, kept for investigation and redrive. A FIFO queue needs a
// FIFO dead-letter queue.
resource "aws_sqs_queue" "webhook_events_dlq" {
  name       = "webhook_events_dlq.fifo"
  fifo_queue = true
  // Moved messages keep their original enqueue time, so this queue keeps them longer than the
  // source queue does; 14 days is the SQS maximum.
  message_retention_seconds = 1209600
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
