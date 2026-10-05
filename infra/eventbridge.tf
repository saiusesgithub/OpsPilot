# Custom EventBridge bus
resource "aws_cloudwatch_event_bus" "ops_pilot" {
  name = local.project
  tags = local.common_tags
}

# Rule: route ops-pilot IncidentEvent events to SQS
resource "aws_cloudwatch_event_rule" "incident_events" {
  name           = "${local.project}-incident-events"
  event_bus_name = aws_cloudwatch_event_bus.ops_pilot.name
  description    = "Route ops-pilot IncidentEvent events to the SQS incidents queue"

  event_pattern = jsonencode({
    source      = ["ops-pilot"]
    detail-type = ["IncidentEvent"]
  })

  tags = local.common_tags
}

# Target: send to SQS
resource "aws_cloudwatch_event_target" "incidents_queue" {
  rule           = aws_cloudwatch_event_rule.incident_events.name
  event_bus_name = aws_cloudwatch_event_bus.ops_pilot.name
  target_id      = "IncidentsQueue"
  arn            = aws_sqs_queue.incidents.arn
}
