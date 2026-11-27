# Deployment and validation

## Release the existing dev environment

1. Merge the change into `main` after validation passes. The application-only release uses the existing AWS infrastructure.
2. Open **Actions → Validate and deploy → Run workflow**, then select branch `main` and environment `dev`.
3. Confirm that **Configure AWS credentials** passes and **Release application** reaches the GraphQL smoke test and published frontend check.
4. Open the [deployed frontend](https://d1lbwz3cl5kmzu.cloudfront.net). Test with synthetic data and keep the demo token out of logs and screenshots.

After a workflow or app code fix, dispatch a new run so GitHub checks out the latest commit. For a live IAM-only fix, rerunning the failed job can reuse the existing commit with the updated AWS permissions.

## Prerequisites

Use AWS CLI v2, Terraform 1.14, AWS SAM CLI, Docker, Node.js 24, and a GitHub repository with Actions enabled. Run infrastructure provisioning from an authorized AWS administrator or infrastructure role. The deploy workflow uses a separate scoped role. The stack creates billable resources including NAT Gateway, ALB, Fargate, and RDS.

## 1. Prepare infrastructure

Run from the repository root. The examples use Bash, such as Git Bash or WSL on Windows.

1. For a new account, provision the state bucket with `terraform -chdir=infrastructure/bootstrap init` and `terraform -chdir=infrastructure/bootstrap apply`. For an existing deployment, reuse its state bucket and state key. Confirm `aws sts get-caller-identity` before proceeding.
2. Ensure the AWS account has a GitHub OIDC provider for `https://token.actions.githubusercontent.com` with audience `sts.amazonaws.com`. Supply its ARN as `github_oidc_provider_arn`. The dev repository uses GitHub's immutable subject format. Set `TF_VAR_github_repository` to the `OWNER@OWNER_ID/REPO@REPO_ID` portion, using `gh api repos/OWNER/REPO --jq '{owner_id: .owner.id, repo_id: .id}'` to look up the IDs. Terraform adds `repo:` and `:environment:dev` to build the full subject. Preserve this input for future plans.
3. Set `TF_VAR_github_oidc_provider_arn`, `TF_VAR_github_repository`, `TF_VAR_alarm_email`, and `TF_VAR_bootstrap_image_tag`. Set the image tag to a new value such as `bootstrap-$(git rev-parse --short HEAD)`. Also set `TF_VAR_environment=prod` when provisioning production. Leave it at the default `dev` for the assessment environment.
4. Initialize state. For production, use a separate state key and a separate checkout or `TF_DATA_DIR`. Verify the workspace is pointing at the intended state before planning.

   ```bash
   export AWS_REGION=us-east-1
   export ENVIRONMENT=dev
   export STATE_BUCKET="<state-bucket>"
   tf() { terraform -chdir=infrastructure/environments/dev "$@"; }
   tf init -reconfigure -backend-config="bucket=$STATE_BUCKET" \
     -backend-config="key=$ENVIRONMENT/terraform.tfstate"
   ```

5. For a fresh stack, create ECR first and push the bootstrap image. For an existing stack, get the existing `ecr_repo_url` from state and push the new image to it.

   ```bash
   tf apply -target=module.ecr
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   REPO="$ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/gql-$ENVIRONMENT-graphql-server"
   aws ecr get-login-password | docker login --username AWS --password-stdin "${REPO%%/*}"
   docker build --platform linux/amd64 -t "$REPO:$TF_VAR_bootstrap_image_tag" backend/graphql-server
   docker push "$REPO:$TF_VAR_bootstrap_image_tag"
   ```

6. Review `tf plan -out=platform.plan`, then apply with `tf apply platform.plan`. Confirm the SNS subscription by email. Preserve the selected bootstrap image tag and other environment inputs for future infrastructure applies.

### Migrate the original unauthenticated ECS deployment

The original task accepted anonymous GraphQL. This migration sequence was used when introducing the authenticated task and is only relevant if starting from that older deployment. Before adding the CloudFront route, set `TF_VAR_enable_frontend=false`, apply the infrastructure changes with the new bootstrap image, then update the ECS service explicitly to the new Terraform task definition. Terraform ignores service task revisions so routine plans preserve the versions published by CI/CD.

```bash
aws ecs update-service --cluster "$(tf output -raw ecs_cluster)" \
  --service "$(tf output -raw ecs_service)" \
  --task-definition "$(tf output -raw ecs_task_definition)"
aws ecs wait services-stable --cluster "$(tf output -raw ecs_cluster)" \
  --services "$(tf output -raw ecs_service)"
```

Confirm the active task revision is the new one and that an unauthenticated POST to the existing API Gateway `/graphql` returns 401. Then set `TF_VAR_enable_frontend=true` and apply again. Use the same existing SAM stack name `gql-<environment>-lambda` if it already matches. If the previous SAM template references objects in another bucket, set `TF_VAR_legacy_sam_artifact_prefix_arn` to the scoped object ARN pattern before enabling GitHub deployment so the CloudFormation service role can read those packages during rollback. If the deployed stack uses a different name, adjust the workflow script and IAM resource patterns to that name before deploying to avoid Lambda name conflicts.

## 2. Configure GitHub Actions

Create the GitHub environments `dev` and optionally `prod`. Restrict deployment branches to `main`. Set production approvals if supported by your GitHub plan. Add these variables in each environment using its own Terraform outputs.

| Environment variable | Terraform output |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `aws_deploy_role_arn` |
| `SAM_EXECUTION_ROLE_ARN` | `sam_execution_role_arn` |
| `ECR_REPO_URL` | `ecr_repo_url` |
| `ECS_CLUSTER` | `ecs_cluster` |
| `ECS_SERVICE` | `ecs_service` |
| `ECS_TASK_DEFINITION` | `ecs_task_definition` |
| `FRONTEND_BUCKET` | `frontend_bucket` |
| `FRONTEND_URL` | `frontend_url` |
| `RELEASE_BUCKET` | `release_bucket` |
| `DB_SECRET_ARN` | `db_secret_arn` |
| `ACCESS_TOKEN_ARN` | `access_token_arn` |
| `LAMBDA_SG_ID` | `lambda_sg_id` |
| `APP_SUBNET_A` and `APP_SUBNET_B` | First and second values from `app_subnet_ids` |

Pull requests run frontend lint and build, TypeScript checks, SAM validation and build, and Terraform validation. The validation job sets the AWS region independently of the deploy job so SAM validation also runs on pull requests. Dispatch **Validate and deploy** from `main` to release to the chosen environment. Set the repository variable `AUTO_DEPLOY_DEV=true` to enable automatic dev releases on pushes to `main`.

The release publishes SAM functions, runs the database initializer through its Lambda alias, deploys the Fargate image, and checks the API through CloudFront before publishing the new frontend entry point. When Terraform creates a new base task revision, refresh `ECS_TASK_DEFINITION` in GitHub.

## 3. Verify submission evidence

- Retain a successful Actions run showing the API smoke test and the served frontend check. The smoke test waits for a real update event through WebSocket and deletes its test row.
- Open the CloudFront URL in two browsers and enter the access token from Secrets Manager. Create a synthetic user in one browser, confirm it appears in both, edit it, then remove it. Confirm the S3 website objects are inaccessible anonymously through a direct S3 request.
- Capture the private ECS service and RDS subnet configuration, Lambda aliases, CloudWatch alarms and confirmed SNS subscription. Use synthetic data and redact account identifiers where needed.
- For full release rollback evidence, run a controlled dev drill and confirm the previous Lambda template, ECS revision, and frontend index are restored. The earlier `UPDATE_ROLLBACK_COMPLETE` event demonstrates Lambda stack rollback.

## Troubleshooting

| Symptom | Where to look |
|---|---|
| OIDC role assumption denied | Check the GitHub repository IDs, exact `dev` environment name, and role trust subject in [iam.tf](../infrastructure/environments/dev/iam.tf). |
| `GetTemplateSummary` denied | Check the GitHub release role's CloudFormation policy. |
| SAM transform denied | Check `cloudformation:CreateChangeSet` on the SAM transform ARN in the CloudFormation execution role. |
| CloudFormation update failed | Run `aws cloudformation describe-stack-events --region us-east-1 --stack-name gql-dev-lambda` and inspect the first concrete resource failure. The dev SAM template uses shared Lambda concurrency after the original reservation was rejected. |

Production is outside the deployed assessment scope.
