# GraphQL Serverless Platform

A React user directory on AWS. CloudFront serves the frontend from a private S3 bucket and forwards GraphQL HTTP and WebSocket requests to Apollo on private ECS Fargate. Apollo invokes TypeScript Lambda functions deployed with SAM. The functions use private RDS PostgreSQL for CRUD. Fargate listens to PostgreSQL notifications to deliver subscriptions across tasks.

The Terraform configuration targets us-east-1. It defaults to `dev` and supports a separate `prod` deployment through an independent state key.

- [Architecture](docs/architecture.md)
- [Deployment and CI/CD](docs/deployment.md)
- [Security, monitoring, scaling and rollback](docs/operations.md)
