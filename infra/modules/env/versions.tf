terraform {
  required_version = ">= 1.10"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 7.0" }
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

data "google_project" "this" {
  project_id = var.gcp_project_id
}

data "aws_caller_identity" "this" {}

locals {
  prefix = "paper-chalk-${var.name}"

  # Cloud Run URLs are https://<service>-<project number>.<region>.run.app, known before the
  # service exists, which the web app needs for its own settings.
  run_app  = "${data.google_project.this.number}.${var.gcp_region}.run.app"
  web_url  = var.web_domain != "" ? "https://${var.web_domain}" : "https://web-${local.run_app}"
  sync_url = var.sync_domain != "" ? "wss://${var.sync_domain}" : "wss://sync-${local.run_app}"

  # Origins the browser app is served from (CORS on the buckets, trusted by auth).
  web_origins = distinct(compact([
    local.web_url,
    "https://web-${local.run_app}",
  ]))

  aws_web_audience = "${local.prefix}-aws"
  labels           = { app = "paper-chalk", env = var.name }
}
