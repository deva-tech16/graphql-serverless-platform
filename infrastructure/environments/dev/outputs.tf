output "app_subnet_ids" { value = module.vpc.app_subnet_ids }
output "lambda_sg_id" { value = module.security_groups.lambda_sg_id }
output "db_secret_arn" { value = module.rds.app_secret_arn }
output "db_endpoint" { value = module.rds.db_endpoint }
output "ecr_repo_url" { value = module.ecr.repository_url }

output "api_url" { value = module.api.api_url }
output "alb_dns_name" { value = module.ecs.alb_dns_name }
