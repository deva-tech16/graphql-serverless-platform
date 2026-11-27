terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 5.0" }
  }
  backend "s3" {
    bucket       = "tfstate-731738810098-gql"
    key          = "dev/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = { Project = "graphql-serverless-platform", Env = var.environment }
  }
}