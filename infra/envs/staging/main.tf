# Staging: Cloud Run (web, sync) in GCP project paper-chalk-staging; S3, SQS and the workers
# Lambda in AWS ap-south-1. Deployed automatically from main (.github/workflows/deploy-staging.yml).
#
#   cd infra/envs/staging && terraform init && terraform plan && terraform apply

terraform {
  required_version = ">= 1.10"
  backend "gcs" {
    bucket = "paper-chalk-staging-tfstate"
    prefix = "envs/staging"
  }
  required_providers {
    google = { source = "hashicorp/google", version = "~> 7.0" }
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "google" {
  project = "paper-chalk-staging"
  region  = "asia-south1"
}

provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = { managed-by = "terraform" }
  }
}

variable "services_enabled" {
  description = "See modules/env. False only on the very first apply of a new environment."
  type        = bool
  default     = true
}

variable "google_oauth_enabled" {
  type    = bool
  default = false
}

module "env" {
  source = "../../modules/env"

  name             = "staging"
  gcp_project_id   = "paper-chalk-staging"
  services_enabled = var.services_enabled
  # The first workers image the deploy workflow pushed (see README, New environment).
  workers_image_tag    = ""
  google_oauth_enabled = var.google_oauth_enabled

  # Staging scales to zero; production keeps a warm sync instance.
  sync_min_instances    = 0
  force_destroy_buckets = true

  github_repository_id = "1383862940"
  github_oidc_subject  = "repo:tarinagarwal@139993383/paper-and-chalk@1383862940:environment:staging"
}

output "web_url" {
  value = module.env.web_url
}

output "sync_url" {
  value = module.env.sync_url
}

output "github_variables" {
  value = module.env.github_variables
}

output "secret_ids" {
  value = module.env.secret_ids
}

output "mongodb_uri_parameter" {
  value = module.env.mongodb_uri_parameter
}
