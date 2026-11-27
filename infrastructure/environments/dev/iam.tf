locals {
  account_id      = data.aws_caller_identity.current.account_id
  sam_stack       = "arn:aws:cloudformation:us-east-1:${local.account_id}:stack/${local.name}-lambda/*"
  lambda_resource = "arn:aws:lambda:us-east-1:${local.account_id}:function:${local.name}-*"
  sam_lambda_role = "arn:aws:iam::${local.account_id}:role/${local.name}-lambda-LambdaRole-*"
}

resource "aws_iam_role" "sam_execution" {
  count = var.github_oidc_provider_arn == "" ? 0 : 1
  name  = "${local.name}-sam-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudformation.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "sam_execution" {
  count = length(aws_iam_role.sam_execution)
  role  = aws_iam_role.sam_execution[0].name
  name  = "manage-sam-stack-resources"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:CreateFunction", "lambda:DeleteFunction", "lambda:GetFunction",
          "lambda:GetFunctionConfiguration", "lambda:UpdateFunctionConfiguration", "lambda:UpdateFunctionCode",
          "lambda:PublishVersion", "lambda:ListVersionsByFunction", "lambda:TagResource", "lambda:UntagResource",
          "lambda:ListTags", "lambda:CreateAlias", "lambda:GetAlias", "lambda:UpdateAlias", "lambda:DeleteAlias",
          "lambda:PutFunctionConcurrency", "lambda:GetFunctionConcurrency", "lambda:DeleteFunctionConcurrency"
        ]
        Resource = [local.lambda_resource]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
          "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy", "iam:UpdateAssumeRolePolicy",
          "iam:TagRole", "iam:UntagRole"
        ]
        Resource = [local.sam_lambda_role]
      },
      {
        Effect   = "Allow"
        Action   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
        Resource = [local.sam_lambda_role]
        Condition = {
          ArnEquals = { "iam:PolicyARN" = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole" }
        }
      },
      {
        Effect    = "Allow"
        Action    = "iam:PassRole"
        Resource  = [local.sam_lambda_role]
        Condition = { StringEquals = { "iam:PassedToService" = "lambda.amazonaws.com" } }
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:GetObjectVersion"]
        Resource = compact(["${aws_s3_bucket.artifacts.arn}/sam/*", var.legacy_sam_artifact_prefix_arn])
      },
      {
        Effect   = "Allow"
        Action   = ["ec2:DescribeSubnets", "ec2:DescribeSecurityGroups", "ec2:DescribeVpcs"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role" "github_release" {
  count = length(aws_iam_role.sam_execution)
  name  = "${local.name}-github-release"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.github_oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:${var.environment}"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_release" {
  count = length(aws_iam_role.github_release)
  role  = aws_iam_role.github_release[0].name
  name  = "release-${var.environment}"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken", "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:CompleteLayerUpload", "ecr:InitiateLayerUpload",
          "ecr:PutImage", "ecr:UploadLayerPart", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"
        ]
        Resource = "arn:aws:ecr:us-east-1:${local.account_id}:repository/${local.name}-graphql-server"
      },
      {
        Effect   = "Allow"
        Action   = ["ecs:DescribeServices", "ecs:UpdateService"]
        Resource = "arn:aws:ecs:us-east-1:${local.account_id}:service/${module.ecs.cluster_name}/${module.ecs.service_name}"
      },
      {
        Effect    = "Allow"
        Action    = "iam:PassRole"
        Resource  = [module.ecs.task_role_arn, module.ecs.execution_role_arn]
        Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = [aws_s3_bucket.frontend.arn, aws_s3_bucket.artifacts.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = ["${aws_s3_bucket.frontend.arn}/*", "${aws_s3_bucket.artifacts.arn}/sam/*"]
      },
      {
        Effect   = "Allow"
        Action   = "s3:DeleteObject"
        Resource = "${aws_s3_bucket.frontend.arn}/index.html"
      },
      {
        Effect = "Allow"
        Action = [
          "cloudformation:CreateChangeSet", "cloudformation:DescribeChangeSet", "cloudformation:ExecuteChangeSet",
          "cloudformation:DeleteChangeSet", "cloudformation:DescribeStacks", "cloudformation:GetTemplate",
          "cloudformation:DescribeStackEvents"
        ]
        Resource = [local.sam_stack, "arn:aws:cloudformation:us-east-1:aws:transform/Serverless-2016-10-31"]
      },
      {
        Effect    = "Allow"
        Action    = "iam:PassRole"
        Resource  = aws_iam_role.sam_execution[0].arn
        Condition = { StringEquals = { "iam:PassedToService" = "cloudformation.amazonaws.com" } }
      },
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = "arn:aws:lambda:us-east-1:${local.account_id}:function:${local.name}-init-db:live"
      },
      {
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = aws_secretsmanager_secret.graphql_access.arn
      }
    ]
  })
}

output "aws_deploy_role_arn" { value = try(aws_iam_role.github_release[0].arn, null) }
output "sam_execution_role_arn" { value = try(aws_iam_role.sam_execution[0].arn, null) }
