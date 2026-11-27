output "app_subnet_ids" { value = module.vpc.app_subnet_ids }
output "lambda_sg_id" { value = module.security_groups.lambda_sg_id }
output "db_secret_arn" { value = module.rds.app_secret_arn }
output "db_endpoint" { value = module.rds.db_endpoint }
output "ecr_repo_url" { value = module.ecr.repository_url }

output "api_url" { value = module.api.api_url }
output "alb_dns_name" { value = module.ecs.alb_dns_name }

output "frontend_url" { value = "https://${aws_cloudfront_distribution.frontend.domain_name}" }
output "frontend_bucket" { value = aws_s3_bucket.frontend.bucket }
output "access_token_arn" { value = aws_secretsmanager_secret.graphql_access.arn }
output "ecs_cluster" { value = module.ecs.cluster_name }
output "ecs_service" { value = module.ecs.service_name }
output "ecs_task_definition" { value = module.ecs.base_task_definition }

output "release_bucket" { value = aws_s3_bucket.artifacts.bucket }
output "distribution_id" { value = aws_cloudfront_distribution.frontend.id }
