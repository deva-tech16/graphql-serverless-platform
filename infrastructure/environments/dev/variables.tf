variable "environment" {
  type    = string
  default = "dev"
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Use dev or prod."
  }
}

variable "bootstrap_image_tag" {
  type    = string
  default = "v1"
}

variable "alarm_email" {
  type    = string
  default = ""
}

variable "github_oidc_provider_arn" {
  type    = string
  default = ""
}

variable "github_repository" {
  type    = string
  default = "deva-tech16/graphql-serverless-platform"
}

variable "enable_frontend" {
  type    = bool
  default = true
}

variable "legacy_sam_artifact_prefix_arn" {
  type        = string
  default     = ""
  description = "Optional scoped S3 object ARN pattern for artifacts referenced by the existing SAM stack."
}
