resource "aws_dynamodb_table" "incidents" {
  name         = "${local.project}-incidents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "incidentId"

  attribute {
    name = "incidentId"
    type = "S"
  }

  tags = local.common_tags
}
