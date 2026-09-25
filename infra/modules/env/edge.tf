# Custom domains. Google does not map custom domains to Cloud Run in Mumbai, so a small VM with a
# static IP terminates HTTPS (Caddy, automatic Let's Encrypt certificates) and passes requests,
# websockets included, to the Cloud Run services. The apps stay on Cloud Run: deploys, secrets
# and scale-to-zero are unchanged. DNS: A records for both domains -> the edge IP.
#
# The proxy tells the web app the real client IP (X-PC-Client-IP) with a shared secret the app
# checks, so rate limits keep working per visitor and nobody can fake an IP by calling Cloud Run
# directly. About $12/month (e2-micro, disk, the IPv4 address); a load balancer would be ~$18.

locals {
  edge_enabled = var.services_enabled && var.web_domain != ""
  caddyfile    = <<-EOT
    ${var.web_domain} {
      encode zstd gzip
      reverse_proxy https://web-${local.run_app} {
        header_up Host {upstream_hostport}
        header_up X-PC-Client-IP {remote_host}
        header_up X-PC-Proxy-Secret {$EDGE_PROXY_SECRET}
      }
    }
    %{if var.sync_domain != ""}
    ${var.sync_domain} {
      reverse_proxy https://sync-${local.run_app} {
        header_up Host {upstream_hostport}
      }
    }
    %{endif}
  EOT
  # Container-Optimized OS: read-only root, auto-updates, Docker included. The startup script
  # opens 80/443 in the host firewall, reads the proxy secret from Secret Manager with the VM's
  # identity (never stored in metadata), and (re)starts Caddy with the Caddyfile from metadata.
  edge_startup = <<-EOT
    #!/bin/bash
    set -euo pipefail
    iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 80 -j ACCEPT
    iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 443 -j ACCEPT
    md=http://metadata.google.internal/computeMetadata/v1
    # Retry: a new VM's permissions can take a minute to reach Secret Manager. The API answers
    # with pretty-printed JSON, so flatten it before picking fields out.
    json=""
    for attempt in $(seq 1 30); do
      token=$(curl -sf -H 'Metadata-Flavor: Google' "$md/instance/service-accounts/default/token" \
        | tr -d '\n' | sed -E 's/.*"access_token": *"([^"]+)".*/\1/')
      if json=$(curl -sf -H "Authorization: Bearer $token" \
        "https://secretmanager.googleapis.com/v1/projects/${var.gcp_project_id}/secrets/edge-proxy-secret/versions/latest:access"); then
        break
      fi
      sleep 10
    done
    secret=$(printf '%s' "$json" | tr -d '\n' | sed -E 's/.*"data": *"([^"]+)".*/\1/' | base64 -d)
    mkdir -p /var/lib/caddy/data /var/lib/caddy/config
    curl -sf -H 'Metadata-Flavor: Google' "$md/instance/attributes/caddyfile" > /var/lib/caddy/Caddyfile
    docker rm -f caddy >/dev/null 2>&1 || true
    docker run -d --name caddy --restart unless-stopped --network host \
      -e EDGE_PROXY_SECRET="$secret" \
      -v /var/lib/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
      -v /var/lib/caddy/data:/data -v /var/lib/caddy/config:/config \
      caddy:2
  EOT
}

resource "google_compute_address" "edge" {
  count   = local.edge_enabled ? 1 : 0
  project = var.gcp_project_id
  region  = var.gcp_region
  name    = "edge"
}

resource "google_service_account" "edge" {
  count        = local.edge_enabled ? 1 : 0
  project      = var.gcp_project_id
  account_id   = "edge-proxy"
  display_name = "Custom-domain edge proxy (VM)"
}

resource "google_secret_manager_secret_iam_member" "edge" {
  count     = local.edge_enabled ? 1 : 0
  project   = var.gcp_project_id
  secret_id = google_secret_manager_secret.this["edge-proxy-secret"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.edge[0].email}"
}

resource "google_project_iam_member" "edge_logs" {
  count   = local.edge_enabled ? 1 : 0
  project = var.gcp_project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.edge[0].email}"
}

resource "google_compute_firewall" "edge_https" {
  count         = local.edge_enabled ? 1 : 0
  project       = var.gcp_project_id
  name          = "edge-allow-http-https"
  network       = "default"
  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["edge-proxy"]
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

resource "google_compute_instance" "edge" {
  count        = local.edge_enabled ? 1 : 0
  project      = var.gcp_project_id
  zone         = "${var.gcp_region}-a"
  name         = "edge"
  machine_type = "e2-micro"
  tags         = ["edge-proxy"]
  labels       = local.labels

  boot_disk {
    initialize_params {
      image = "cos-cloud/cos-stable"
      size  = 10
      type  = "pd-balanced"
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.edge[0].address
    }
  }

  service_account {
    email  = google_service_account.edge[0].email
    scopes = ["cloud-platform"]
  }

  metadata = {
    caddyfile              = local.caddyfile
    startup-script         = local.edge_startup
    google-logging-enabled = "true"
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  allow_stopping_for_update = true
  depends_on                = [google_secret_manager_secret_iam_member.edge]
}
