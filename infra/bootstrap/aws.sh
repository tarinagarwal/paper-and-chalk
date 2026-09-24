#!/usr/bin/env bash
# One-time setup for AWS-only Terraform state (infra/envs/dev), safe to re-run:
#   infra/bootstrap/aws.sh [bucket] [region]
# Creates a private, versioned, encrypted S3 bucket for Terraform state (S3 native locking).
set -euo pipefail
bucket="${1:-paper-chalk-tfstate}"
region="${2:-ap-south-1}"

if ! aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
  aws s3api create-bucket --bucket "$bucket" --region "$region" \
    --create-bucket-configuration "LocationConstraint=$region" >/dev/null
fi
aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
aws s3api put-bucket-versioning --bucket "$bucket" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$bucket" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
echo "Ready: Terraform state bucket s3://$bucket ($region)"
