variable "name_prefix" {
  description = "Bucket names are <prefix>-<role>, e.g. paper-chalk-staging-originals."
  type        = string
}

variable "cors_origins" {
  description = "Site origins allowed to upload and read from the browser."
  type        = list(string)
  default     = []
}

variable "force_destroy" {
  description = "Allow terraform destroy to delete non-empty buckets (never in production)."
  type        = bool
  default     = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
