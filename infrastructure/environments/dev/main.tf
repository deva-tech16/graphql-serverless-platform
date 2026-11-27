module "vpc" {
  source         = "../../terraform/vpc"
  name           = "gql-dev"
  region         = "us-east-1"
  azs            = ["us-east-1a", "us-east-1b"]
  public_subnets = ["10.0.0.0/24", "10.0.1.0/24"]
  app_subnets    = ["10.0.10.0/24", "10.0.11.0/24"]
  db_subnets     = ["10.0.20.0/24", "10.0.21.0/24"]
}

module "security_groups" {
  source = "../../terraform/security-groups"
  name   = "gql-dev"
  vpc_id = module.vpc.vpc_id
}

module "rds" {
  source           = "../../terraform/rds"
  name             = "gql-dev"
  env              = "dev"
  db_subnet_ids    = module.vpc.db_subnet_ids
  proxy_subnet_ids = module.vpc.app_subnet_ids
  rds_sg_id        = module.security_groups.rds_sg_id
  rds_proxy_sg_id  = module.security_groups.rds_proxy_sg_id
}
module "ecr" {
  source = "../../terraform/ecr"
  name   = "gql-dev"
}

module "ecs" {
  source         = "../../terraform/ecs"
  name           = "gql-dev"
  env            = "dev"
  region         = "us-east-1"
  vpc_id         = module.vpc.vpc_id
  app_subnet_ids = module.vpc.app_subnet_ids
  alb_sg_id      = module.security_groups.alb_sg_id
  ecs_sg_id      = module.security_groups.ecs_sg_id
  image          = "${module.ecr.repository_url}:v1"
}

module "api" {
  source           = "../../terraform/api"
  name             = "gql-dev"
  app_subnet_ids   = module.vpc.app_subnet_ids
  vpc_link_sg_id   = module.security_groups.vpc_link_sg_id
  alb_listener_arn = module.ecs.listener_arn
}
