# Dead-letter queue
resource "aws_sqs_queue" "incidents_dlq" {
  name                      = "${local.project}-incidents-dlq"
  message_retention_seconds = 1209600 # 14 days
  tags                      = local.common_tags
}

# Main incidents queue
resource "aws_sqs_queue" "incidents" {
  name                       = "${local.project}-incidents"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 86400 # 24 hours

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.incidents_dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.common_tags
}

# Allow EventBridge to send messages to the SQS queue
resource "aws_sqs_queue_policy" "incidents" {
  queue_url = aws_sqs_queue.incidents.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowEventBridgeSendMessage"
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.incidents.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_cloudwatch_event_rule.incident_events.arn
          }
        }
      }
    ]
  })
}
