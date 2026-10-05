data "aws_caller_identity" "current" {}

locals {
  frontend_dist_path = "${path.module}/../frontend/dist"
  frontend_bucket    = "${local.project}-frontend-${data.aws_caller_identity.current.account_id}-${var.aws_region}"

  frontend_content_types = {
    css   = "text/css; charset=utf-8"
    html  = "text/html; charset=utf-8"
    ico   = "image/x-icon"
    json  = "application/json; charset=utf-8"
    js    = "text/javascript; charset=utf-8"
    png   = "image/png"
    svg   = "image/svg+xml"
    txt   = "text/plain; charset=utf-8"
    webp  = "image/webp"
    woff  = "font/woff"
    woff2 = "font/woff2"
  }
}

resource "aws_s3_bucket" "frontend" {
  bucket = local.frontend_bucket
  tags   = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.project}-frontend-oac"
  description                       = "Private S3 access for the OpsPilot frontend distribution"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_cache_policy" "frontend" {
  name        = "${local.project}-frontend-cache"
  comment     = "Honor frontend object cache headers"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "${local.project} production frontend"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2and3"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "${local.project}-frontend-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id       = "${local.project}-frontend-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.frontend.id
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = local.common_tags
}

data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    sid    = "AllowCloudFrontReadOnly"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

resource "aws_s3_object" "frontend" {
  for_each = fileset(local.frontend_dist_path, "**")

  bucket        = aws_s3_bucket.frontend.id
  key           = each.value
  source        = "${local.frontend_dist_path}/${each.value}"
  source_hash   = filemd5("${local.frontend_dist_path}/${each.value}")
  content_type  = lookup(local.frontend_content_types, try(reverse(split(".", each.value))[0], ""), "application/octet-stream")
  cache_control = each.value == "index.html" ? "no-cache, no-store, must-revalidate" : "public, max-age=31536000, immutable"

  depends_on = [
    aws_s3_bucket_ownership_controls.frontend,
    aws_s3_bucket_server_side_encryption_configuration.frontend,
  ]
}

output "frontend_cloudfront_url" {
  description = "HTTPS URL for the OpsPilot production frontend"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "frontend_s3_bucket_name" {
  description = "Private S3 bucket hosting the OpsPilot frontend build"
  value       = aws_s3_bucket.frontend.bucket
}
