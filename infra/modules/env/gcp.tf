# Google Cloud: the web app and the sync server on Cloud Run (Mumbai, scale to zero), their
# images, their secrets, and keyless deploys from GitHub.

# --- Images --------------------------------------------------------------------------------------

resource "google_artifact_registry_repository" "images" {
  project       = var.gcp_project_id
  location      = var.gcp_region
  repository_id = "images"
  format        = "DOCKER"
  description   = "web and sync images (tagged with the git SHA)"
  labels        = local.labels

  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "604800s"
    }
  }
}

# --- Service accounts (least privilege) ----------------------------------------------------------

resource "google_service_account" "web" {
  project      = var.gcp_project_id
  account_id   = "web-run"
  display_name = "Paper & Chalk web (Cloud Run)"
}

resource "google_service_account" "sync" {
  project      = var.gcp_project_id
  account_id   = "sync-run"
  display_name = "Paper & Chalk sync (Cloud Run)"
}

resource "google_service_account" "deployer" {
  project      = var.gcp_project_id
  account_id   = "github-deployer"
  display_name = "GitHub Actions deploys"
}

# --- Secrets (values are added by infra/scripts/push-secrets.mjs, never by Terraform) -------------

locals {
  # secret id => the environment variable it becomes
  web_secrets = merge(
    {
      "mongodb-uri"              = "MONGODB_URI"
      "better-auth-secret"       = "BETTER_AUTH_SECRET"
      "sync-jwt-secret"          = "SYNC_JWT_SECRET"
      "upstash-redis-rest-url"   = "UPSTASH_REDIS_REST_URL"
      "upstash-redis-rest-token" = "UPSTASH_REDIS_REST_TOKEN"
      "smtp-user"                = "SMTP_USER"
      "smtp-password"            = "SMTP_PASSWORD"
      "email-from"               = "EMAIL_FROM"
    },
    var.google_oauth_enabled ? {
      "google-client-id"     = "GOOGLE_CLIENT_ID"
      "google-client-secret" = "GOOGLE_CLIENT_SECRET"
    } : {},
  )
  all_secrets = toset(concat(keys(local.web_secrets), ["google-client-id", "google-client-secret"]))
}

resource "google_secret_manager_secret" "this" {
  for_each  = local.all_secrets
  project   = var.gcp_project_id
  secret_id = each.key
  labels    = local.labels
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "web" {
  for_each  = local.web_secrets
  project   = var.gcp_project_id
  secret_id = google_secret_manager_secret.this[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.web.email}"
}

resource "google_secret_manager_secret_iam_member" "sync" {
  project   = var.gcp_project_id
  secret_id = google_secret_manager_secret.this["sync-jwt-secret"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sync.email}"
}

# Deploys run migrations (MongoDB URI) and a smoke test that signs a sync token.
resource "google_secret_manager_secret_iam_member" "deployer" {
  for_each  = toset(["mongodb-uri", "sync-jwt-secret"])
  project   = var.gcp_project_id
  secret_id = google_secret_manager_secret.this[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}

# --- Keyless deploys from GitHub (Workload Identity Federation) ----------------------------------

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.gcp_project_id
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.gcp_project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "actions"
  display_name                       = "GitHub Actions OIDC"
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.environment"   = "assertion.environment"
  }
  # Only this repository's jobs in this GitHub environment (numeric id: survives renames).
  attribute_condition = "assertion.repository_id == '${var.github_repository_id}' && assertion.environment == '${var.name}'"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}

resource "google_artifact_registry_repository_iam_member" "deployer" {
  project    = var.gcp_project_id
  location   = var.gcp_region
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

# Deploying a revision that runs as a service account needs actAs on it.
resource "google_service_account_iam_member" "deployer_acts_as" {
  for_each = {
    web  = google_service_account.web.name
    sync = google_service_account.sync.name
  }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# --- Cloud Run -----------------------------------------------------------------------------------

locals {
  placeholder_image = "us-docker.pkg.dev/cloudrun/container/hello"
  web_env = {
    APP_ENV                   = var.name
    BETTER_AUTH_URL           = local.web_url
    NEXT_PUBLIC_SITE_URL      = local.web_url
    EMAIL_DELIVERY            = "smtp"
    SMTP_HOST                 = var.smtp_host
    SMTP_PORT                 = tostring(var.smtp_port)
    RATE_LIMIT_STORE          = "upstash"
    S3_REGION                 = var.aws_region
    S3_BUCKET_ORIGINALS       = module.buckets.names["originals"]
    S3_BUCKET_YJS_SNAPSHOTS   = module.buckets.names["yjs-snapshots"]
    S3_BUCKET_ASSETS          = module.buckets.names["assets"]
    S3_BUCKET_EXPORTS         = module.buckets.names["exports"]
    S3_BUCKET_THUMBNAILS      = module.buckets.names["thumbnails"]
    AWS_WEB_IDENTITY_ROLE_ARN = aws_iam_role.web.arn
    AWS_WEB_IDENTITY_AUDIENCE = local.aws_web_audience
    JOBS_QUEUE_URL            = aws_sqs_queue.jobs.url
  }
}

resource "google_cloud_run_v2_service" "web" {
  count               = var.services_enabled ? 1 : 0
  project             = var.gcp_project_id
  name                = "web"
  location            = var.gcp_region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = local.labels

  template {
    service_account                  = google_service_account.web.email
    timeout                          = "60s"
    max_instance_request_concurrency = 80
    scaling {
      min_instance_count = 0
      max_instance_count = var.web_max_instances
    }
    containers {
      # The deploy workflow sets the real image; Terraform ignores it after creation.
      image = local.placeholder_image
      ports {
        container_port = 8080
      }
      resources {
        limits            = { cpu = "1", memory = "1Gi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = local.web_env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.web_secrets
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.this[env.key].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_iam_member.web]
}

resource "google_cloud_run_v2_service" "sync" {
  count               = var.services_enabled ? 1 : 0
  project             = var.gcp_project_id
  name                = "sync"
  location            = var.gcp_region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = local.labels

  template {
    service_account = google_service_account.sync.email
    # WebSocket connections live as long as the request: up to an hour, then clients reconnect.
    timeout          = "3600s"
    session_affinity = true
    scaling {
      min_instance_count = var.sync_min_instances
      max_instance_count = var.sync_max_instances
    }
    containers {
      image = local.placeholder_image
      ports {
        container_port = 8080
      }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      env {
        name = "SYNC_JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["sync-jwt-secret"].secret_id
            version = "latest"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_iam_member.sync]
}

# Public: the app does its own auth (sessions, sync tokens).
resource "google_cloud_run_v2_service_iam_member" "public" {
  for_each = var.services_enabled ? toset(["web", "sync"]) : toset([])
  project  = var.gcp_project_id
  location = var.gcp_region
  name     = each.key == "web" ? google_cloud_run_v2_service.web[0].name : google_cloud_run_v2_service.sync[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "deployer" {
  for_each = var.services_enabled ? toset(["web", "sync"]) : toset([])
  project  = var.gcp_project_id
  location = var.gcp_region
  name     = each.key == "web" ? google_cloud_run_v2_service.web[0].name : google_cloud_run_v2_service.sync[0].name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

# --- Custom domains (Cloud Run domain mappings: free, managed TLS certificates) ------------------
# The domain must first be verified for the deploying Google account (Search Console, a TXT
# record). Terraform then prints the DNS records to add at the registrar (output dns_records).

resource "google_cloud_run_domain_mapping" "web" {
  count    = var.services_enabled && var.web_domain != "" ? 1 : 0
  project  = var.gcp_project_id
  location = var.gcp_region
  name     = var.web_domain
  metadata {
    namespace = var.gcp_project_id
  }
  spec {
    route_name = google_cloud_run_v2_service.web[0].name
  }
}

resource "google_cloud_run_domain_mapping" "sync" {
  count    = var.services_enabled && var.sync_domain != "" ? 1 : 0
  project  = var.gcp_project_id
  location = var.gcp_region
  name     = var.sync_domain
  metadata {
    namespace = var.gcp_project_id
  }
  spec {
    route_name = google_cloud_run_v2_service.sync[0].name
  }
}
