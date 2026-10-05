# HTTP API (API Gateway v2)
resource "aws_apigatewayv2_api" "incidents" {
  name          = "${local.project}-api"
  protocol_type = "HTTP"
  description   = "OpsPilot Incidents API"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 300
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.incidents.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format          = "$context.requestId"
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${local.project}"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_apigatewayv2_integration" "ingest" {
  api_id                 = aws_apigatewayv2_api.incidents.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.ingest.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_events" {
  api_id    = aws_apigatewayv2_api.incidents.id
  route_key = "POST /events"
  target    = "integrations/${aws_apigatewayv2_integration.ingest.id}"
}

resource "aws_lambda_permission" "apigw_ingest" {
  statement_id  = "AllowAPIGatewayInvokeIngest"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.incidents.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "list_incidents" {
  api_id                 = aws_apigatewayv2_api.incidents.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.list_incidents.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_incidents" {
  api_id    = aws_apigatewayv2_api.incidents.id
  route_key = "GET /incidents"
  target    = "integrations/${aws_apigatewayv2_integration.list_incidents.id}"
}

resource "aws_lambda_permission" "apigw_list_incidents" {
  statement_id  = "AllowAPIGatewayInvokeListIncidents"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.list_incidents.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.incidents.execution_arn}/*/*"
}