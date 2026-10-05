output "api_endpoint" {
  description = "API Gateway endpoint URL"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "event_bus_name" {
  description = "EventBridge custom bus name"
  value       = aws_cloudwatch_event_bus.ops_pilot.name
}

output "sqs_queue_url" {
  description = "SQS incidents queue URL"
  value       = aws_sqs_queue.incidents.url
}

output "state_machine_arn" {
  description = "Step Functions state machine ARN"
  value       = aws_sfn_state_machine.incident_workflow.arn
}

output "dynamodb_table_name" {
  description = "DynamoDB incidents table name"
  value       = aws_dynamodb_table.incidents.name
}
