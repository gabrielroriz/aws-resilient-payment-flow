variable "lambdasVersion" {
  type        = string
  description = "Version suffix of the local Lambda ZIP archive"
}

variable "ALARM_NOTIFICATION_TOPIC_ARN" {
  type        = string
  default     = null
  description = "Optional SNS topic ARN for CloudWatch alarm notifications"
}
