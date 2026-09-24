# AWS (Mumbai, next to Atlas): the S3 buckets, the job queue, and the workers on Lambda. File
# reads by workers stay in-region (no egress). No long-lived keys: the web app on Cloud Run
# assumes a role with its Google identity, and GitHub deploys with OIDC.

locals {
  tags          = { app = "paper-chalk", env = var.name }
  function_name = "${local.prefix}-workers"
  function_arn  = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.this.account_id}:function:${local.function_name}"
  mongodb_param = "/paper-chalk/${var.name}/mongodb-uri"
}

module "buckets" {
  source        = "../s3-buckets"
  name_prefix   = local.prefix
  cors_origins  = local.web_origins
  force_destroy = var.force_destroy_buckets
  tags          = local.tags
}

# --- Job queue -----------------------------------------------------------------------------------

resource "aws_sqs_queue" "jobs_dead" {
  name                      = "${local.prefix}-jobs-dead"
  message_retention_seconds = 1209600 # 14 days to inspect and redrive
  sqs_managed_sse_enabled   = true
  tags                      = local.tags
}

resource "aws_sqs_queue" "jobs" {
  name                       = "${local.prefix}-jobs"
  visibility_timeout_seconds = 1800 # 6x the function timeout, as AWS advises for Lambda triggers
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.jobs_dead.arn
    maxReceiveCount     = 5
  })
  tags = local.tags
}

# --- Workers image -------------------------------------------------------------------------------

resource "aws_ecr_repository" "workers" {
  name                 = "${local.prefix}-workers"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = var.force_destroy_buckets
  image_scanning_configuration {
    scan_on_push = true
  }
  tags = local.tags
}

resource "aws_ecr_lifecycle_policy" "workers" {
  repository = aws_ecr_repository.workers.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 5 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }
      action       = { type = "expire" }
    }]
  })
}

# --- Secrets for the workers (value set by infra/scripts/push-secrets.mjs) ------------------------

resource "aws_ssm_parameter" "mongodb_uri" {
  name  = local.mongodb_param
  type  = "SecureString"
  value = "unset"
  tags  = local.tags
  lifecycle {
    ignore_changes = [value]
  }
}

data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

# --- Workers on Lambda ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "workers" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_iam_role" "workers" {
  name = "${local.prefix}-workers"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy" "workers" {
  name = "workers"
  role = aws_iam_role.workers.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.workers.arn}:*"
      },
      {
        Sid      = "Queue"
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
        Resource = aws_sqs_queue.jobs.arn
      },
      {
        Sid      = "Buckets"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = module.buckets.arns
      },
      {
        Sid      = "Objects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"]
        Resource = module.buckets.object_arns
      },
      {
        Sid      = "MongoUri"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = aws_ssm_parameter.mongodb_uri.arn
      },
      {
        Sid       = "DecryptParameter"
        Effect    = "Allow"
        Action    = ["kms:Decrypt"]
        Resource  = data.aws_kms_alias.ssm.target_key_arn
        Condition = { StringEquals = { "kms:ViaService" = "ssm.${var.aws_region}.amazonaws.com" } }
      },
    ]
  })
}

resource "aws_lambda_function" "workers" {
  count         = var.workers_image_tag == "" ? 0 : 1
  function_name = local.function_name
  role          = aws_iam_role.workers.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.workers.repository_url}:${var.workers_image_tag}"
  architectures = ["arm64"] # Graviton: ~20% cheaper per GB-second
  memory_size   = 1024
  timeout       = 300
  environment {
    variables = {
      S3_REGION               = var.aws_region
      S3_BUCKET_ORIGINALS     = module.buckets.names["originals"]
      S3_BUCKET_YJS_SNAPSHOTS = module.buckets.names["yjs-snapshots"]
      S3_BUCKET_ASSETS        = module.buckets.names["assets"]
      S3_BUCKET_EXPORTS       = module.buckets.names["exports"]
      S3_BUCKET_THUMBNAILS    = module.buckets.names["thumbnails"]
      MONGODB_URI_PARAMETER   = local.mongodb_param
    }
  }
  tags = local.tags
  lifecycle {
    # The deploy workflow ships new images; Terraform only creates the function.
    ignore_changes = [image_uri]
  }
  depends_on = [aws_cloudwatch_log_group.workers, aws_iam_role_policy.workers]
}

resource "aws_lambda_event_source_mapping" "jobs" {
  count                   = var.workers_image_tag == "" ? 0 : 1
  event_source_arn        = aws_sqs_queue.jobs.arn
  function_name           = aws_lambda_function.workers[0].arn
  batch_size              = 5
  function_response_types = ["ReportBatchItemFailures"]
  scaling_config {
    # Caps parallel workers (and so MongoDB connections on the shared cluster).
    maximum_concurrency = 5
  }
}

# --- The web app's AWS role (Cloud Run, keyless) -------------------------------------------------

resource "aws_iam_role" "web" {
  name = "${local.prefix}-web"
  # Assumed with the Cloud Run service account's Google ID token (STS web identity). For Google,
  # `aud` is the token's azp (the service account's numeric id) and `oaud` its audience.
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = "accounts.google.com" }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "accounts.google.com:aud"  = google_service_account.web.unique_id
          "accounts.google.com:sub"  = google_service_account.web.unique_id
          "accounts.google.com:oaud" = local.aws_web_audience
        }
      }
    }]
  })
  max_session_duration = 43200
  tags                 = local.tags
}

resource "aws_iam_role_policy" "web" {
  name = "web"
  role = aws_iam_role.web.id
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
        Sid      = "Objects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"]
        Resource = module.buckets.object_arns
      },
      {
        Sid      = "EnqueueJobs"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.jobs.arn
      },
    ]
  })
}

# --- GitHub deploys (OIDC; the provider is account-wide and managed in envs/dev) ----------------

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "deployer" {
  name = "${local.prefix}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = var.github_oidc_subject
        }
      }
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy" "deployer" {
  name = "deploy"
  role = aws_iam_role.deployer.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "RegistryLogin"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "PushWorkers"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload",
          "ecr:GetDownloadUrlForLayer", "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart",
        ]
        Resource = aws_ecr_repository.workers.arn
      },
      {
        Sid      = "UpdateWorkers"
        Effect   = "Allow"
        Action   = ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"]
        Resource = local.function_arn
      },
    ]
  })
}
