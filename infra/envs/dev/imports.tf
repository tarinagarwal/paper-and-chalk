# Step 5 created these with scripts; Terraform adopted them on its first apply. Kept so a fresh
# checkout plans against the real resources instead of trying to create them again.

locals {
  dev_buckets      = ["originals", "yjs-snapshots", "assets", "exports", "thumbnails"]
  dev_cors_buckets = ["originals", "assets", "exports", "thumbnails"]
}

import {
  for_each = toset(local.dev_buckets)
  to       = module.buckets.aws_s3_bucket.this[each.key]
  id       = "paper-chalk-dev-${each.key}"
}

import {
  for_each = toset(local.dev_buckets)
  to       = module.buckets.aws_s3_bucket_public_access_block.this[each.key]
  id       = "paper-chalk-dev-${each.key}"
}

import {
  for_each = toset(local.dev_buckets)
  to       = module.buckets.aws_s3_bucket_ownership_controls.this[each.key]
  id       = "paper-chalk-dev-${each.key}"
}

import {
  for_each = toset(local.dev_buckets)
  to       = module.buckets.aws_s3_bucket_server_side_encryption_configuration.this[each.key]
  id       = "paper-chalk-dev-${each.key}"
}

import {
  for_each = toset(local.dev_buckets)
  to       = module.buckets.aws_s3_bucket_lifecycle_configuration.this[each.key]
  id       = "paper-chalk-dev-${each.key}"
}

import {
  for_each = toset(local.dev_cors_buckets)
  to       = module.buckets.aws_s3_bucket_cors_configuration.this[each.key]
  id       = "paper-chalk-dev-${each.key}"
}

import {
  to = aws_iam_user.app
  id = "paper-chalk-dev-app"
}

import {
  to = aws_iam_user_policy.app
  id = "paper-chalk-dev-app:paper-chalk-dev-buckets"
}

data "aws_caller_identity" "this" {}

import {
  to = aws_iam_openid_connect_provider.github
  id = "arn:aws:iam::${data.aws_caller_identity.this.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

import {
  to = aws_iam_role.ci
  id = "paper-chalk-ci"
}

import {
  to = aws_iam_role_policy.ci
  id = "paper-chalk-ci:paper-chalk-ci-test-objects"
}
