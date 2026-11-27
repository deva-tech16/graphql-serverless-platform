resource "aws_sns_topic" "alarms" {
  name = "${local.name}-alarms"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

locals {
  lambda_operations = toset(["init-db", "create-user", "get-user", "list-users", "update-user", "delete-user", "subscription-ready"])
  lambda_metrics = {
    Errors      = { statistic = "Sum", threshold = 1, period = 60 }
    Duration    = { statistic = "Maximum", threshold = 5000, period = 60 }
    Invocations = { statistic = "Sum", threshold = 500, period = 300 }
    Throttles   = { statistic = "Sum", threshold = 1, period = 60 }
  }
  lambda_alarms = {
    for pair in setproduct(local.lambda_operations, keys(local.lambda_metrics)) :
    "${pair[0]}-${lower(pair[1])}" => {
      operation = pair[0]
      metric    = pair[1]
      config    = local.lambda_metrics[pair[1]]
    }
  }
  service_alarms = {
    "ecs-cpu" = {
      namespace  = "AWS/ECS", metric = "CPUUtilization", threshold = 85, statistic = "Average"
      dimensions = { ClusterName = module.ecs.cluster_name, ServiceName = module.ecs.service_name }
    }
    "alb-5xx" = {
      namespace  = "AWS/ApplicationELB", metric = "HTTPCode_Target_5XX_Count", threshold = 5, statistic = "Sum"
      dimensions = { LoadBalancer = module.ecs.alb_arn_suffix, TargetGroup = module.ecs.target_group_arn_suffix }
    }
    "rds-connections" = {
      namespace  = "AWS/RDS", metric = "DatabaseConnections", threshold = 40, statistic = "Maximum"
      dimensions = { DBInstanceIdentifier = module.rds.db_instance_id }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda" {
  for_each            = local.lambda_alarms
  alarm_name          = "${local.name}-${each.key}"
  namespace           = "AWS/Lambda"
  metric_name         = each.value.metric
  statistic           = each.value.config.statistic
  threshold           = each.value.config.threshold
  period              = each.value.config.period
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { FunctionName = "${local.name}-${each.value.operation}" }
  alarm_actions       = [aws_sns_topic.alarms.arn]
}

resource "aws_cloudwatch_metric_alarm" "service" {
  for_each            = local.service_alarms
  alarm_name          = "${local.name}-${each.key}"
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.statistic
  threshold           = each.value.threshold
  period              = 60
  evaluation_periods  = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = each.value.dimensions
  alarm_actions       = [aws_sns_topic.alarms.arn]
}
