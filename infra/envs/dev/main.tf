# Dev (AWS only): the S3 buckets that `pnpm dev`, tests and CI use, the dev app's IAM user, and
# GitHub OIDC for CI. Dev's database and Redis are the founder's Atlas and Upstash (outside
# Terraform). The GitHub OIDC provider is account-wide: staging's deploy role uses it too.
#
#   cd infra/envs/dev && terraform init && terraform plan && terraform apply
#
# These resources were created by scripts in step 5 and imported here (imports.tf).

terraform {
  required_version = ">= 1.10"
  backend "s3" {
    bucket       = "paper-chalk-tfstate"
    key          = "envs/dev/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = true
    encrypt      = true
  }
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = { managed-by = "terraform" }
  }
}

locals {
  tags = { app = "paper-chalk", env = "dev" }
  # CI and tests may only touch these keys; a lifecycle rule deletes them after a day.
  test_prefix = "test/"
}

module "buckets" {
  source       = "../../modules/s3-buckets"
  name_prefix  = "paper-chalk-dev"
  cors_origins = ["http://localhost:3000", "http://localhost:3100"]
  tags         = local.tags
}

# --- The dev app's IAM user (keys live only in the developer's .env) ------------------------------

resource "aws_iam_user" "app" {
  name = "paper-chalk-dev-app"
  tags = local.tags
}

resource "aws_iam_user_policy" "app" {
  name = "paper-chalk-dev-buckets"
  user = aws_iam_user.app.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Buckets"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:ListBucketMultipartUploads"]
        Resource = module.buckets.arns
      },
      {
        Sid      = "Objects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"]
        Resource = module.buckets.object_arns
      },
    ]
  })
}

# --- GitHub OIDC (account-wide) and the CI role ---------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
  tags            = local.tags
}

resource "aws_iam_role" "ci" {
  name        = "paper-chalk-ci"
  description = "GitHub Actions for paper-and-chalk: test/ objects in the dev buckets"
  # GitHub issues immutable subjects for this repository (owner and repository ids).
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        StringLike   = { "token.actions.githubusercontent.com:sub" = "repo:tarinagarwal@139993383/paper-and-chalk@1383862940:*" }
      }
    }]
  })
  max_session_duration = 3600
  tags                 = merge(local.tags, { env = "ci" })
}

resource "aws_iam_role_policy" "ci" {
  name = "paper-chalk-ci-test-objects"
  role = aws_iam_role.ci.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Buckets"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = module.buckets.arns
      },
      {
        Sid      = "TestObjectsOnly"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"]
        Resource = [for arn in module.buckets.arns : "${arn}/${local.test_prefix}*"]
      },
    ]
  })
}

output "ci_role_arn" {
  value = aws_iam_role.ci.arn
}
