# The five buckets from SPEC.md section 2, on S3. One definition for every environment:
# private (public access blocked, owner-enforced), encrypted (SSE-S3), CORS for the site's
# origins, and lifecycle rules. Browsers upload to originals and assets and read everything but
# yjs-snapshots (server only).

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

locals {
  buckets = {
    originals     = { cors = "upload", expire_days = null }
    yjs-snapshots = { cors = "none", expire_days = null }
    assets        = { cors = "upload", expire_days = null }
    exports       = { cors = "read", expire_days = 7 }
    thumbnails    = { cors = "read", expire_days = 30 }
  }
  cors_buckets = {
    for name, bucket in local.buckets : name => bucket
    if bucket.cors != "none" && length(var.cors_origins) > 0
  }
}

resource "aws_s3_bucket" "this" {
  for_each      = local.buckets
  bucket        = "${var.name_prefix}-${each.key}"
  force_destroy = var.force_destroy
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = aws_s3_bucket.this
  bucket                  = each.value.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "this" {
  for_each = local.cors_buckets
  bucket   = aws_s3_bucket.this[each.key].id
  cors_rule {
    id              = each.value.cors == "upload" ? "browser-upload-and-read" : "browser-read"
    allowed_origins = var.cors_origins
    allowed_methods = each.value.cors == "upload" ? ["GET", "HEAD", "PUT"] : ["GET", "HEAD"]
    # The checksum header lets S3 verify single-PUT uploads; range is for partial reads (PDFs).
    allowed_headers = each.value.cors == "upload" ? ["content-type", "x-amz-checksum-sha256", "range"] : ["range"]
    # Multipart uploads need each part's ETag.
    expose_headers  = ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id

  # Tests, CI and e2e write only under test/; nothing there outlives a day.
  rule {
    id     = "delete-test-objects"
    status = "Enabled"
    filter {
      prefix = "test/"
    }
    expiration {
      days = 1
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {
      prefix = ""
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  dynamic "rule" {
    for_each = local.buckets[each.key].expire_days == null ? [] : [local.buckets[each.key].expire_days]
    content {
      id     = "expire-${each.key}"
      status = "Enabled"
      filter {
        prefix = ""
      }
      expiration {
        days = rule.value
      }
    }
  }
}
