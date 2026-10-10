// Webhook events, their processing attempts, effects, and duplicate deliveries.
// Keys, items, and access patterns are documented in docs/data-model/webhook-events.md.
resource "aws_dynamodb_table" "webhook_events" {
  name = "webhook_events"
  // On-demand capacity absorbs provider bursts without capacity planning.
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  // Only key attributes of the table and its indexes are declared; DynamoDB is schemaless otherwise.
  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "received_at"
    type = "S"
  }

  attribute {
    name = "GSI2PK"
    type = "S"
  }

  attribute {
    name = "occurred_at"
    type = "S"
  }

  // Events by receipt time. GSI1PK is sharded per provider so one provider's burst cannot throttle writes.
  global_secondary_index {
    name = "GSI1"
    key_schema {
      attribute_name = "GSI1PK"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "received_at"
      key_type       = "RANGE"
    }
    projection_type = "INCLUDE"
    // Projections leave out the payload so each index entry stays within one write unit.
    non_key_attributes = ["provider", "event_type", "occurred_at", "subject_type", "subject_id"]
  }

  // Events of one payment or subscription, in the order the provider says they occurred.
  global_secondary_index {
    name = "GSI2"
    key_schema {
      attribute_name = "GSI2PK"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "occurred_at"
      key_type       = "RANGE"
    }
    projection_type    = "INCLUDE"
    non_key_attributes = ["provider", "event_type", "received_at"]
  }

  // Every item of an event shares one expiry, so TTL removes the whole event together.
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}

output "webhook_events_table" {
  description = "Name and ARN of the webhook events table"
  value = {
    name = aws_dynamodb_table.webhook_events.name
    arn  = aws_dynamodb_table.webhook_events.arn
  }
}
