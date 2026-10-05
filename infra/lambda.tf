# ──────────────────────────────────────────────────────────────────────────────
# Archive data sources — zip each function's built output
# ──────────────────────────────────────────────────────────────────────────────
data "archive_file" "ingest" {
  type        = "zip"
  source_file = "${local.dist_path}/ingest/index.js"
  output_path = "${local.dist_path}/ingest.zip"
}

data "archive_file" "processor" {
  type        = "zip"
  source_file = "${local.dist_path}/processor/index.js"
  output_path = "${local.dist_path}/processor.zip"
}

data "archive_file" "load_context" {
  type        = "zip"
  source_file = "${local.dist_path}/loadContext/index.js"
  output_path = "${local.dist_path}/loadContext.zip"
}

data "archive_file" "analyze_metrics" {
  type        = "zip"
  source_file = "${local.dist_path}/analyzeMetrics/index.js"
  output_path = "${local.dist_path}/analyzeMetrics.zip"
}

data "archive_file" "correlate_events" {
  type        = "zip"
  source_file = "${local.dist_path}/correlateEvents/index.js"
  output_path = "${local.dist_path}/correlateEvents.zip"
}

data "archive_file" "calculate_severity" {
  type        = "zip"
  source_file = "${local.dist_path}/calculateSeverity/index.js"
  output_path = "${local.dist_path}/calculateSeverity.zip"
}

data "archive_file" "generate_analysis" {
  type        = "zip"
  source_file = "${local.dist_path}/generateAnalysis/index.js"
  output_path = "${local.dist_path}/generateAnalysis.zip"
}

data "archive_file" "store_incident" {
  type        = "zip"
  source_file = "${local.dist_path}/storeIncident/index.js"
  output_path = "${local.dist_path}/storeIncident.zip"
}

data "archive_file" "list_incidents" {
  type        = "zip"
  source_file = "${local.dist_path}/listIncidents/index.js"
  output_path = "${local.dist_path}/listIncidents.zip"
}

data "archive_file" "send_notification" {
  type        = "zip"
  source_file = "${local.dist_path}/sendNotification/index.js"
  output_path = "${local.dist_path}/sendNotification.zip"
}

# ──────────────────────────────────────────────────────────────────────────────
# CloudWatch Log Groups (one per Lambda)
# ──────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "ingest" {
  name              = "/aws/lambda/${local.project}-ingest"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "processor" {
  name              = "/aws/lambda/${local.project}-processor"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "load_context" {
  name              = "/aws/lambda/${local.project}-load-context"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "analyze_metrics" {
  name              = "/aws/lambda/${local.project}-analyze-metrics"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "correlate_events" {
  name              = "/aws/lambda/${local.project}-correlate-events"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "calculate_severity" {
  name              = "/aws/lambda/${local.project}-calculate-severity"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "generate_analysis" {
  name              = "/aws/lambda/${local.project}-generate-analysis"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "store_incident" {
  name              = "/aws/lambda/${local.project}-store-incident"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "list_incidents" {
  name              = "/aws/lambda/${local.project}-list-incidents"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "send_notification" {
  name              = "/aws/lambda/${local.project}-send-notification"
  retention_in_days = 7
  tags              = local.common_tags
}

# ──────────────────────────────────────────────────────────────────────────────
# Lambda Functions
# ──────────────────────────────────────────────────────────────────────────────
resource "aws_lambda_function" "ingest" {
  function_name    = "${local.project}-ingest"
  role             = aws_iam_role.ingest.arn
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  handler          = "index.handler"
  filename         = data.archive_file.ingest.output_path
  source_code_hash = data.archive_file.ingest.output_base64sha256
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      EVENT_BUS_NAME = aws_cloudwatch_event_bus.ops_pilot.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.ingest]
  tags       = local.common_tags
}

resource "aws_lambda_function" "processor" {
  function_name    = "${local.project}-processor"
  role             = aws_iam_role.processor.arn
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  handler          = "index.handler"
  filename         = data.archive_file.processor.output_path
  source_code_hash = data.archive_file.processor.output_base64sha256
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      STATE_MACHINE_ARN = aws_sfn_state_machine.incident_workflow.arn
    }
  }

  depends_on = [aws_cloudwatch_log_group.processor]
  tags       = local.common_tags
}

resource "aws_lambda_function" "load_context" {
  function_name    = "${local.project}-load-context"
  role             = aws_iam_role.workflow_step.arn
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  handler          = "index.handler"
  filename         = data.archive_file.load_context.output_path
  source_code_hash = data.archive_file.load_context.output_base64sha256
  timeout          = 10
  memory_size      = 256

  depends_on = [aws_cloudwatch_log_group.load_context]
  tags       = local.common_tags
}

resource "aws_lambda_function" "analyze_metrics" {
  function_name    = "${local.project}-analyze-metrics"
  role             = aws_iam_role.workflow_step.arn
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  handler          = "index.handler"
  filename         = data.archive_file.analyze_metrics.output_path
  source_code_hash = data.archive_file.analyze_metrics.output_base64sha256
  timeout          = 10
  memory_size      = 256

  depends_on = [aws_cloudwatch_log_group.analyze_metrics]
  tags       = local.common_tags
}

resource "aws_lambda_function" "correlate_events" {
  function_name    = "${local.project}-correlate-events"
  role             = aws_iam_role.workflow_step.arn
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  handler          = "index.handler"
  filename         = data.archive_file.correlate_events.output_path
  source_code_hash = data.archive_file.correlate_events.output_base64sha256
  timeout          = 10
  memory_size      = 256

  depends_on = [aws_cloudwatch_log_group.correlate_events]
  tags       = local.common_tags
}

resource "aws_lambda_function" "calculate_severity" {
  function_name    = "${local.project}-calculate-severity"
  role             = aws_iam_role.workflow_step.arn
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  handler          = "index.handler"
  filename         = data.archive_file.calculate_severity.output_path
  source_code_hash = data.archive_file.calculate_severity.output_base64sha256
  timeout          = 10
  memory_size      = 256

  depends_on = [aws_cloudwatch_log_group.calculate_severity]
  tags       = local.common_tags
}

resource "aws_lambda_function" "generate_analysis" {
  function_name    = "${local.project}-generate-analysis"
  role             = aws_iam_role.workflow_step.arn
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  handler          = "index.handler"
  filename         = data.archive_file.generate_analysis.output_path
  source_code_hash = data.archive_file.generate_analysis.output_base64sha256
  timeout          = 35
  memory_size      = 256

  environment {
    variables = {
      BEDROCK_MODEL_ID = var.bedrock_model_id
      BEDROCK_ENABLED  = "true"
    }
  }

  depends_on = [aws_cloudwatch_log_group.generate_analysis]
  tags       = local.common_tags
}

resource "aws_lambda_function" "store_incident" {
  function_name    = "${local.project}-store-incident"
  role             = aws_iam_role.store_incident.arn
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  handler          = "index.handler"
  filename         = data.archive_file.store_incident.output_path
  source_code_hash = data.archive_file.store_incident.output_base64sha256
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      INCIDENTS_TABLE = aws_dynamodb_table.incidents.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.store_incident]
  tags       = local.common_tags
}

resource "aws_lambda_function" "list_incidents" {
  function_name    = "${local.project}-list-incidents"
  role             = aws_iam_role.list_incidents.arn
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  handler          = "index.handler"
  filename         = data.archive_file.list_incidents.output_path
  source_code_hash = data.archive_file.list_incidents.output_base64sha256
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      INCIDENTS_TABLE = aws_dynamodb_table.incidents.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.list_incidents]
  tags       = local.common_tags
}

resource "aws_lambda_function" "send_notification" {
  function_name    = "${local.project}-send-notification"
  role             = aws_iam_role.workflow_step.arn
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  handler          = "index.handler"
  filename         = data.archive_file.send_notification.output_path
  source_code_hash = data.archive_file.send_notification.output_base64sha256
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      # SNS_TOPIC_ARN is intentionally not set -- the Lambda will skip
      # notification gracefully if this var is absent.
      # Set this to an SNS topic ARN when you are ready to enable alerts.
      SNS_TOPIC_ARN = ""
    }
  }

  depends_on = [aws_cloudwatch_log_group.send_notification]
  tags       = local.common_tags
}

# ──────────────────────────────────────────────────────────────────────────────
# SQS → Processor Lambda event source mapping
# ──────────────────────────────────────────────────────────────────────────────
resource "aws_lambda_event_source_mapping" "processor_sqs" {
  event_source_arn = aws_sqs_queue.incidents.arn
  function_name    = aws_lambda_function.processor.arn
  batch_size       = 1
  enabled          = true
}
