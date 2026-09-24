output "web_url" {
  value = local.web_url
}

output "sync_url" {
  value = local.sync_url
}

output "github_variables" {
  description = "Variables for the GitHub environment the deploy workflow runs in."
  value = {
    GCP_PROJECT_ID         = var.gcp_project_id
    GCP_REGION             = var.gcp_region
    GCP_WIF_PROVIDER       = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOYER_SA        = google_service_account.deployer.email
    GCP_IMAGE_REPOSITORY   = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.images.repository_id}"
    AWS_REGION             = var.aws_region
    AWS_DEPLOY_ROLE_ARN    = aws_iam_role.deployer.arn
    WORKERS_ECR_REPOSITORY = aws_ecr_repository.workers.repository_url
    WORKERS_FUNCTION       = local.function_name
    WEB_URL                = local.web_url
    SYNC_URL               = local.sync_url
  }
}

output "secret_ids" {
  value = sort(tolist(local.all_secrets))
}

output "mongodb_uri_parameter" {
  value = local.mongodb_param
}

output "dns_records" {
  description = "Records to add at the registrar for the custom domains (empty without domains)."
  value = flatten([
    for m in concat(google_cloud_run_domain_mapping.web, google_cloud_run_domain_mapping.sync) : [
      for r in m.status[0].resource_records : "${m.name} ${r.type} ${r.rrdata}"
    ]
  ])
}
