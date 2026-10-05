locals {
  project = var.project
  region  = var.aws_region

  common_tags = {
    Project     = var.project
    Environment = "mvp"
    ManagedBy   = "terraform"
  }

  # Lambda dist paths relative to infra/ directory
  dist_path = "${path.module}/../dist"
}
