variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "ops-pilot"
}

variable "bedrock_model_id" {
  description = "Amazon Bedrock model identifier for AI analysis"
  type        = string
  default     = "amazon.nova-micro-v1:0"
}
