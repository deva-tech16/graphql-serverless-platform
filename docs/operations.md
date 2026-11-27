# Operations

## Access and secrets

CloudFront signs S3 requests through origin access control scoped to the distribution ARN. Direct public S3 access is blocked. CloudFront connects to the internal ALB as a VPC origin. The ALB forwards to Fargate on port 4000, and only the ALB security group can reach that port. RDS has no public endpoint and allows PostgreSQL traffic from the Lambda and ECS security groups. The existing VPC uses a shared NAT Gateway for private app subnet egress.

The ECS task role can invoke the six application Lambda aliases. The task execution role pulls the container, writes ECS logs, and reads the two task secrets. The Lambda execution role has VPC access and reads the database secret by ARN. GitHub OIDC trust is restricted to the configured repository and deployment environment. The release role passes specific ECS and CloudFormation roles, and the CloudFormation role manages the environment's SAM resources.

The Terraform-created PostgreSQL secret and shared tester token contain generated values. Terraform state contains these values and needs restricted access. Lambda retrieves the DB secret at runtime. ECS injects both secrets at startup. GitHub environment variables carry identifiers. The smoke test retrieves the access token from AWS and masks it. The browser keeps its entered token in memory. The same token protects HTTP GraphQL and WebSocket initialization. The CloudFront hostname and React application shell are public.

The assessment setup uses a shared operator token and the existing PostgreSQL owner credential. Use synthetic data. A production rollout with real users needs per-user authentication and authorization plus separate migration, CRUD and listener database roles. Both clients verify PostgreSQL TLS certificates. Rotate a token by publishing a new Secrets Manager version and forcing a new ECS deployment. Update the infrastructure's secret configuration if Terraform manages the value. Existing WebSockets close as old tasks drain.

## CloudWatch and scaling

| Component | Logs or metrics | Alert |
|---|---|---|
| Lambda | `/aws/lambda/gql-<env>-*` | Errors, maximum duration, invocation volume, and throttles |
| Fargate and ALB | `/ecs/gql-<env>-graphql`, Container Insights, and ALB target metrics | ECS CPU and ALB target 5xx |
| PostgreSQL | RDS PostgreSQL and upgrade logs, `AWS/RDS` | Database connections |

Confirm the SNS email endpoint and send a test SNS notification with synthetic content to verify delivery. ECS scales from one to four tasks by CPU and memory. Lambda scales on demand within four reserved executions per function. Each Lambda environment uses a one-connection pool, and each Fargate task uses one dedicated PostgreSQL listener. Compare throttles against database connections and tune the limits together. PostgreSQL storage grows from 20 GiB to a configured maximum of 50 GiB. The demo uses one database instance with no read replica. Add read capacity and route eligible read-only operations explicitly when measured load requires it. Review snapshot, backup and availability settings before handling production data.

## Rollback

ECS has a deployment circuit breaker with rollback enabled. The release script also snapshots the current task definition, original packaged SAM template, and published frontend HTML. Failed smoke tests restore the previous task definition and SAM template, and restore the original HTML if the entry point was replaced. The workflow retains the old hashed assets and release packages because the previous versions reference them. Keep ECR images referenced by live or rollback task definitions.

An initial release has no previous Lambda stack or frontend index. Inspect the failed steps and CloudFormation state before rerunning. Cancelled runners or permission failures can interrupt automatic restoration. Recover with the prior successful workflow revision and known-good task ARN or matching S3 object versions. The automatic rollback operates on application code. The database initializer performs backward-compatible schema changes and does not reverse data changes during rollback.
