output "db_endpoint" { value = aws_db_instance.this.address }
output "app_secret_arn" { value = aws_secretsmanager_secret.app.arn }
output "db_instance_id" { value = aws_db_instance.this.identifier }