output "vpc_link_sg_id" { value = aws_security_group.vpc_link.id }
output "alb_sg_id" { value = aws_security_group.alb.id }
output "ecs_sg_id" { value = aws_security_group.ecs.id }
output "lambda_sg_id" { value = aws_security_group.lambda.id }
output "rds_proxy_sg_id" { value = aws_security_group.rds_proxy.id }
output "rds_sg_id" { value = aws_security_group.rds.id }