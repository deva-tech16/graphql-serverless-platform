# GraphQL Serverless Platform on AWS

This project runs a React user directory on AWS in `us-east-1`. It demonstrates GraphQL queries, mutations, and live subscriptions. Terraform provisions the dev infrastructure, AWS SAM defines the Lambda functions, and GitHub Actions releases the application.

- [Live dev application](https://d1lbwz3cl5kmzu.cloudfront.net)
- [Architecture](architecture.md) · [Deployment guide](deployment.md) · [Operations guide](operations.md)

## How the pieces fit together

[The dev Terraform configuration](../infrastructure/environments/dev/main.tf) connects the reusable VPC, security groups, RDS, ECR, ECS, and API Gateway modules. The same environment folder defines CloudFront, S3, deployment IAM, and monitoring. The [SAM template](../backend/lambda/template.yaml) and [release script](../scripts/release.sh) handle the Lambda and application releases.

### 1. React frontend

[App.tsx](../frontend/src/App.tsx) implements the directory, including listing, creating, editing, and deleting users. It sends GraphQL requests to `/graphql` and opens a WebSocket on the same path for create and update events.

[frontend.tf](../infrastructure/environments/dev/frontend.tf) serves the static build from a private S3 bucket through CloudFront. This avoids running a separate frontend server. CloudFront uses its default TLS certificate for the distribution hostname. Origin Access Control grants the distribution access to the bucket. Hashed JS and CSS are cached, while the HTML entry point and GraphQL responses use disabled caching.

### 2. TypeScript Lambda backend

[template.yaml](../backend/lambda/template.yaml) defines seven Node.js Lambda functions with `live` aliases. [handlers.ts](../backend/lambda/src/users/handlers.ts) contains five CRUD handlers, a database initializer, and a subscription readiness check. The initializer creates the user table and the trigger used for live updates. GitHub Actions builds and packages these functions with AWS SAM and deploys them through CloudFormation.

### 3. Private Apollo GraphQL server

[ecs/main.tf](../infrastructure/terraform/ecs/main.tf) defines the Fargate service, task definition, internal Application Load Balancer, and task roles. Fargate tasks run in private subnets with no public IP. CloudFront forwards GraphQL HTTP and WebSocket traffic through its VPC origin. The [API Gateway module](../infrastructure/terraform/api/main.tf) provides an additional HTTP route through a VPC link.

[Apollo's entry point](../backend/graphql-server/src/index.ts) protects GraphQL HTTP requests and WebSocket initialization with a shared demo token. For a production application with real users, the shared token would need to be replaced with per-user authentication and authorization.

### 4. Private RDS PostgreSQL

The [RDS module](../infrastructure/terraform/rds/main.tf) provisions an encrypted PostgreSQL instance with public access disabled. The [VPC module](../infrastructure/terraform/vpc/main.tf) provides private database subnets across two Availability Zones. [Security group rules](../infrastructure/terraform/security-groups/main.tf) permit port 5432 from the Lambda and ECS security groups.

**RDS Proxy was skipped to keep dev costs down.** The project contains leftover proxy-related security group definitions, but there is no deployed RDS Proxy. Lambda and ECS connect directly to PostgreSQL over TLS. [Lambda's database client](../backend/lambda/src/db.ts) uses a pool of up to one connection per execution environment. Each ECS task holds one dedicated connection for database notifications. This keeps the demo simple and makes database connection pressure something to watch as traffic grows.

### 5. GraphQL, Lambda, and database integration

- **Query or mutation** — [Apollo resolvers](../backend/graphql-server/src/resolvers/index.ts) call the corresponding Lambda `live` alias through the [Lambda client](../backend/graphql-server/src/services/lambda.ts). Lambda runs the SQL query or write and returns the result to Apollo.
- **Subscription** — Apollo calls the readiness Lambda to check that the database trigger exists. After PostgreSQL commits an insert or update, the trigger sends a notification. [Each Fargate task's listener](../backend/graphql-server/src/services/events.ts) forwards that event to its own WebSocket clients. Apollo keeps the WebSocket open and can deliver updates across multiple tasks. Subscriptions cover creates and updates. A refreshed query confirms deletes.

### 6. GitHub Actions CI/CD

[ci-cd.yml](../.github/workflows/ci-cd.yml) runs frontend lint and build, the GraphQL server build, Lambda type checking and SAM validation, and Terraform formatting and validation. The completed deployment targets **dev**. A manual release from `main` selects the `dev` environment.

[release.sh](../scripts/release.sh) pushes the backend image to ECR, deploys the Lambda stack, initializes the database, and updates ECS. The [smoke test](../frontend/scripts/smoke.mjs) checks HTTP and WebSocket authentication, CRUD, and live event delivery. The release publishes the React entry point only after the smoke test passes.

### 7. CloudWatch monitoring and alerts

[monitoring.tf](../infrastructure/environments/dev/monitoring.tf) defines alarms for Lambda errors, duration, invocations, and throttles, plus ECS CPU, load balancer target 5xx responses, and RDS connections. ECS writes to a dedicated CloudWatch log group, Lambda provides function logs, and RDS exports PostgreSQL and upgrade logs. Alarms publish to SNS. Email delivery requires a configured and confirmed subscription. Treat inbox delivery as unverified until a test notification reaches the recipient.

### 8. IAM access controls

[iam.tf](../infrastructure/environments/dev/iam.tf) scopes GitHub OIDC trust to the configured repository and environment. The release role operates the deployment, while the CloudFormation execution role manages the SAM resources. The [ECS module](../infrastructure/terraform/ecs/main.tf) separates the execution role for image pulls, logs, and startup secrets from the task role that invokes Lambda. The [SAM template](../backend/lambda/template.yaml) gives Lambda VPC access and permission to read the database secret. PostgreSQL access uses database credentials and security groups.

### 9. Environment variables and secrets

[RDS Terraform](../infrastructure/terraform/rds/main.tf) stores the database connection details in Secrets Manager. [frontend.tf](../infrastructure/environments/dev/frontend.tf) provisions a separate demo access token. Lambda retrieves its database secret at runtime. ECS receives the required secrets when the task starts. GitHub environment variables carry resource names and ARNs. The release fetches the demo token for its smoke test and masks it in the workflow logs. Terraform state also contains sensitive values and needs restricted access.

### 10. Scaling and cost decisions

[ecs/main.tf](../infrastructure/terraform/ecs/main.tf) configures ECS target tracking for CPU and memory. The dev service scales from one to four tasks. Dev Lambda functions scale within the account's shared concurrency pool. The initial per-function reservation was removed after it exceeded the account's available reservable capacity.

The [RDS module](../infrastructure/terraform/rds/main.tf) sets storage autoscaling from 20 GiB up to 50 GiB. Dev uses a single RDS instance without read replicas. Storage autoscaling increases disk capacity. Read scaling would require additional capacity and a way to route eligible reads. For this dev workload, the design uses static frontend hosting, one NAT gateway, and direct PostgreSQL connections.

### 11. Rollback

The ECS deployment circuit breaker can roll back an unhealthy ECS deployment. [The release script](../scripts/release.sh) captures the previous task definition, packaged SAM template, and frontend HTML. If a release step fails, it attempts to restore the previous versions for components that changed. Previous static assets remain available so the restored HTML can still load them. The database initializer uses backward-compatible changes, and the release rollback does not reverse database writes.

**Verified during deployment** — CloudFormation reached `UPDATE_ROLLBACK_COMPLETE` after the rejected Lambda concurrency reservation. The dev release succeeded after the reservation was removed. ECS and frontend rollback are implemented in the release flow and need a separate controlled drill to demonstrate end-to-end restoration.
