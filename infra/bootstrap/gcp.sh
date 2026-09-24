#!/usr/bin/env bash
# One-time setup for a GCP environment project (safe to re-run):
#   infra/bootstrap/gcp.sh <project-id> [region]
# Enables the Google APIs Terraform needs and creates the versioned bucket for Terraform state.
# The project must already exist and have billing linked (see README, "New environment").
set -euo pipefail
project="${1:?usage: gcp.sh <project-id> [region]}"
region="${2:-asia-south1}"
state_bucket="gs://${project}-tfstate"

gcloud services enable --project "$project" \
  artifactregistry.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  logging.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  serviceusage.googleapis.com \
  storage.googleapis.com \
  sts.googleapis.com

if ! gcloud storage buckets describe "$state_bucket" --project "$project" >/dev/null 2>&1; then
  gcloud storage buckets create "$state_bucket" --project "$project" --location "$region" \
    --uniform-bucket-level-access --public-access-prevention
fi
gcloud storage buckets update "$state_bucket" --versioning >/dev/null
echo "Ready: APIs enabled, Terraform state in $state_bucket"
