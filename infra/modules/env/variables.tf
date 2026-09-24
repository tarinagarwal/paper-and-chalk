variable "name" {
  description = "Environment name: staging, production."
  type        = string
}

# --- Google Cloud --------------------------------------------------------------------------------

variable "gcp_project_id" {
  type = string
}

variable "gcp_region" {
  description = "Next to the data: Atlas and S3 are in Mumbai."
  type        = string
  default     = "asia-south1"
}

variable "services_enabled" {
  description = <<-EOT
    Create the Cloud Run services. Off for the very first apply of a new environment: their
    secrets need values first (infra/scripts/push-secrets.mjs), then turn this on.
  EOT
  type        = bool
  default     = true
}

variable "google_oauth_enabled" {
  description = "Pass the Google OAuth client to the web app (only once its secrets have values)."
  type        = bool
  default     = false
}

variable "web_domain" {
  description = "Custom domain for the web app, e.g. staging.paperandchalk.lol. Empty: the run.app URL."
  type        = string
  default     = ""
}

variable "sync_domain" {
  description = "Custom domain for the sync server. Empty: the run.app URL."
  type        = string
  default     = ""
}

variable "web_max_instances" {
  type    = number
  default = 3
}

variable "sync_min_instances" {
  description = "0 in staging (first connection after idle waits ~2 s); 1 in production."
  type        = number
  default     = 0
}

variable "sync_max_instances" {
  description = "1 until the sync server shares documents between instances (Redis extension)."
  type        = number
  default     = 1
}

# --- AWS -----------------------------------------------------------------------------------------

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "workers_image_tag" {
  description = <<-EOT
    Tag (git SHA) of a workers image already in this environment's ECR repository. Empty until the
    deploy workflow has pushed the first one; the Lambda function and its SQS trigger are created
    from it. After that the workflow ships new images and this value only needs to stay set.
  EOT
  type        = string
  default     = ""
}

variable "force_destroy_buckets" {
  type    = bool
  default = false
}

# --- GitHub (deploys) ----------------------------------------------------------------------------

variable "github_repository_id" {
  description = "Numeric id of the GitHub repository allowed to deploy."
  type        = string
}

variable "github_oidc_subject" {
  description = <<-EOT
    The `sub` claim of the deploy job's GitHub token, in GitHub's immutable form, e.g.
    repo:owner@<owner-id>/repo@<repo-id>:environment:staging.
  EOT
  type        = string
}

# --- App settings (not secret) -------------------------------------------------------------------

variable "smtp_host" {
  type    = string
  default = "smtp.gmail.com"
}

variable "smtp_port" {
  type    = number
  default = 465
}
