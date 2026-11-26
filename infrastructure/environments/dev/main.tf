module "vpc" {
  source         = "../../terraform/vpc"
  name           = "gql-dev"
  region         = "us-east-1"
  azs            = ["us-east-1a", "us-east-1b"]
  public_subnets = ["10.0.0.0/24", "10.0.1.0/24"]
  app_subnets    = ["10.0.10.0/24", "10.0.11.0/24"]
  db_subnets     = ["10.0.20.0/24", "10.0.21.0/24"]
}