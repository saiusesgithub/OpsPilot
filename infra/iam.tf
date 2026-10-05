# ──────────────────────────────────────────────────────────────────────────────
# Base Lambda execution role (shared CloudWatch Logs permissions)
# Each Lambda gets its own role, which inherits these basic permissions via
# the AWSLambdaBasicExecutionRole managed policy.
# ──────────────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ──────────────────────────────────────────────────────────────────────────────
# IngestFunction — needs events:PutEvents on the custom bus
# ──────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "ingest" {
  name               = "${local.project}-ingest"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ingest_basic" {
  role       = aws_iam_role.ingest.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "ingest_eventbridge" {
  name = "${local.project}-ingest-eventbridge"
  role = aws_iam_role.ingest.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "events:PutEvents"
        Resource = aws_cloudwatch_event_bus.ops_pilot.arn
      }
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────────────
# ProcessorFunction — needs states:StartExecution on the state machine
# ──────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "processor" {
  name               = "${local.project}-processor"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "processor_basic" {
  role       = aws_iam_role.processor.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "processor_sqs" {
  role       = aws_iam_role.processor.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_iam_role_policy" "processor_sfn" {
  name = "${local.project}-processor-sfn"
  role = aws_iam_role.processor.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "states:StartExecution"
        Resource = aws_sfn_state_machine.incident_workflow.arn
      }
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────────────
# Workflow step Lambdas — basic execution only
# (loadContext, analyzeMetrics, correlateEvents, calculateSeverity, generateAnalysis)
# ──────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "workflow_step" {
  name               = "${local.project}-workflow-step"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "workflow_step_basic" {
  role       = aws_iam_role.workflow_step.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "workflow_step_bedrock" {
  name = "${local.project}-workflow-step-bedrock"
  role = aws_iam_role.workflow_step.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-micro-v1:0"
      }
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────────────
# StoreIncidentFunction — DynamoDB read/write
# ──────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "store_incident" {
  name               = "${local.project}-store-incident"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "store_incident_basic" {
  role       = aws_iam_role.store_incident.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "store_incident_dynamodb" {
  name = "${local.project}-store-incident-dynamodb"
  role = aws_iam_role.store_incident.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem"
        ]
        Resource = aws_dynamodb_table.incidents.arn
      }
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────────────
# ListIncidentsFunction — DynamoDB Scan
# ──────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "list_incidents" {
  name               = "${local.project}-list-incidents"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "list_incidents_basic" {
  role       = aws_iam_role.list_incidents.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "list_incidents_dynamodb" {
  name = "${local.project}-list-incidents-dynamodb"
  role = aws_iam_role.list_incidents.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "dynamodb:Scan"
        Resource = aws_dynamodb_table.incidents.arn
      }
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────────────
# Step Functions execution role — invokes all workflow Lambda ARNs
# ──────────────────────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "sfn_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sfn_execution" {
  name               = "${local.project}-sfn-execution"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "sfn_invoke_lambdas" {
  name = "${local.project}-sfn-invoke-lambdas"
  role = aws_iam_role.sfn_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "lambda:InvokeFunction"
        Resource = [
          aws_lambda_function.load_context.arn,
          aws_lambda_function.analyze_metrics.arn,
          aws_lambda_function.correlate_events.arn,
          aws_lambda_function.calculate_severity.arn,
          aws_lambda_function.generate_analysis.arn,
          aws_lambda_function.store_incident.arn,
          aws_lambda_function.send_notification.arn,
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "sfn_cloudwatch_logs" {
  name = "${local.project}-sfn-cloudwatch-logs"
  role = aws_iam_role.sfn_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups"
        ]
        Resource = "*"
      }
    ]
  })
}
