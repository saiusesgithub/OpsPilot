resource "aws_sfn_state_machine" "incident_workflow" {
  name     = "${local.project}-incident-workflow"
  role_arn = aws_iam_role.sfn_execution.arn

  definition = jsonencode({
    Comment = "OpsPilot Incident Processing Workflow"
    StartAt = "LoadContext"
    States = {
      LoadContext = {
        Type     = "Task"
        Resource = aws_lambda_function.load_context.arn
        Next     = "AnalyzeInParallel"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "States.TaskFailed"]
            MaxAttempts     = 3
            IntervalSeconds = 2
            BackoffRate     = 2
          }
        ]
      }
      AnalyzeInParallel = {
        Type = "Parallel"
        Branches = [
          {
            StartAt = "AnalyzeMetrics"
            States = {
              AnalyzeMetrics = {
                Type     = "Task"
                Resource = aws_lambda_function.analyze_metrics.arn
                End      = true
                Retry = [
                  {
                    ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "States.TaskFailed"]
                    MaxAttempts     = 3
                    IntervalSeconds = 2
                    BackoffRate     = 2
                  }
                ]
              }
            }
          },
          {
            StartAt = "CorrelateEvents"
            States = {
              CorrelateEvents = {
                Type     = "Task"
                Resource = aws_lambda_function.correlate_events.arn
                End      = true
                Retry = [
                  {
                    ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "States.TaskFailed"]
                    MaxAttempts     = 3
                    IntervalSeconds = 2
                    BackoffRate     = 2
                  }
                ]
              }
            }
          }
        ]
        ResultSelector = {
          "metricsAnalysis.$"   = "$[0].metricsAnalysis"
          "correlationResult.$" = "$[1].correlationResult"
        }
        ResultPath = "$.parallelResults"
        Next       = "MergeParallelResults"
      }
      MergeParallelResults = {
        Type = "Pass"
        Parameters = {
          "incidentId.$"        = "$.incidentId"
          "telemetry.$"         = "$.telemetry"
          "context.$"           = "$.context"
          "metricsAnalysis.$"   = "$.parallelResults.metricsAnalysis"
          "correlationResult.$" = "$.parallelResults.correlationResult"
        }
        Next = "CalculateSeverity"
      }
      CalculateSeverity = {
        Type     = "Task"
        Resource = aws_lambda_function.calculate_severity.arn
        Next     = "GenerateAnalysis"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "States.TaskFailed"]
            MaxAttempts     = 3
            IntervalSeconds = 2
            BackoffRate     = 2
          }
        ]
      }
      GenerateAnalysis = {
        Type     = "Task"
        Resource = aws_lambda_function.generate_analysis.arn
        Next     = "StoreIncident"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "States.TaskFailed"]
            MaxAttempts     = 3
            IntervalSeconds = 2
            BackoffRate     = 2
          }
        ]
      }
      StoreIncident = {
        Type     = "Task"
        Resource = aws_lambda_function.store_incident.arn
        Next     = "SendNotification"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "States.TaskFailed"]
            MaxAttempts     = 3
            IntervalSeconds = 2
            BackoffRate     = 2
          }
        ]
      }
      SendNotification = {
        Type     = "Task"
        Resource = aws_lambda_function.send_notification.arn
        Next     = "WorkflowSuccess"
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            Next        = "WorkflowSuccess"
            ResultPath  = "$.notificationError"
          }
        ]
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException"]
            MaxAttempts     = 1
            IntervalSeconds = 2
            BackoffRate     = 1
          }
        ]
      }
      WorkflowSuccess = {
        Type = "Succeed"
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.sfn_workflow.arn}:*"
    include_execution_data = true
    level                  = "ALL"
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "sfn_workflow" {
  name              = "/aws/states/${local.project}-incident-workflow"
  retention_in_days = 7
  tags              = local.common_tags
}
