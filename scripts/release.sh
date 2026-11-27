#!/usr/bin/env bash
set -Eeuo pipefail
for key in ENVIRONMENT RELEASE_ID ECR_REPO_URL FRONTEND_BUCKET RELEASE_BUCKET FRONTEND_URL   ECS_CLUSTER ECS_SERVICE ECS_TASK_DEFINITION DB_SECRET_ARN ACCESS_TOKEN_ARN LAMBDA_SG_ID   APP_SUBNET_A APP_SUBNET_B SAM_EXECUTION_ROLE_ARN; do
  : "${!key:?Missing deployment variable $key}"
done

work=$(mktemp -d)
stack="gql-$ENVIRONMENT-lambda"
image="$ECR_REPO_URL:$RELEASE_ID"
sam_changed=0
ecs_changed=0
frontend_changed=0
had_stack=0
had_index=0

deploy_template() {
  aws cloudformation deploy --template-file "$1" --stack-name "$stack"     --role-arn "$SAM_EXECUTION_ROLE_ARN" --capabilities CAPABILITY_IAM     --no-fail-on-empty-changeset --parameter-overrides     "Env=$ENVIRONMENT" "SubnetA=$APP_SUBNET_A" "SubnetB=$APP_SUBNET_B"     "LambdaSgId=$LAMBDA_SG_ID" "DbSecretArn=$DB_SECRET_ARN"
}

restore_frontend() {
  if (( had_index )); then
    aws s3 cp "$work/previous-index.html" "s3://$FRONTEND_BUCKET/index.html"       --content-type text/html --cache-control no-store
  else
    aws s3 rm "s3://$FRONTEND_BUCKET/index.html"
  fi
}

on_exit() {
  local result=$?
  trap - EXIT
  if (( result != 0 )); then
    set +e
    echo 'Release failed. Restoring previous components where available.' >&2
    if (( frontend_changed )); then
      restore_frontend || echo 'Frontend rollback failed' >&2
    fi
    if (( ecs_changed )); then
      if aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE"         --task-definition "$previous_task" >/dev/null; then
        aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE"           || echo 'ECS rollback did not stabilize' >&2
      else
        echo 'ECS rollback request failed' >&2
      fi
    fi
    if (( sam_changed && had_stack )); then
      deploy_template "$work/previous-template" || echo 'Lambda rollback failed' >&2
    elif (( sam_changed )); then
      echo 'No previous Lambda stack exists. Inspect CloudFormation before retrying.' >&2
    fi
  fi
  rm -rf "$work"
  exit "$result"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

previous_task=$(aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE"   --query 'services[0].taskDefinition' --output text)
[[ $previous_task == arn:* ]]
if aws cloudformation describe-stacks --stack-name "$stack" > "$work/stack.json" 2> "$work/stack-error"; then
  had_stack=1
  aws cloudformation get-template --stack-name "$stack" --template-stage Original     --output json | jq -e -r '.TemplateBody | if type == "string" then . else tojson end' > "$work/previous-template"
elif ! grep -Fq "Stack with id $stack does not exist" "$work/stack-error"; then
  cat "$work/stack-error" >&2
  exit 1
fi
if aws s3api head-object --bucket "$FRONTEND_BUCKET" --key index.html   > /dev/null 2> "$work/index-error"; then
  aws s3 cp "s3://$FRONTEND_BUCKET/index.html" "$work/previous-index.html" --only-show-errors
  had_index=1
elif ! grep -Eq '404|Not Found' "$work/index-error"; then
  cat "$work/index-error" >&2
  exit 1
fi

aws ecr get-login-password | docker login --username AWS --password-stdin "${ECR_REPO_URL%%/*}"
docker build --platform linux/amd64 -t "$image" backend/graphql-server
docker push "$image"
(cd frontend && npm ci && npm run build)
(
  cd backend/lambda
  npm ci
  PATH="$PWD/node_modules/.bin:$PATH" sam build
  sam package --s3-bucket "$RELEASE_BUCKET" --s3-prefix "sam/$RELEASE_ID"     --output-template-file "$work/template.yaml"
)

sam_changed=1
deploy_template "$work/template.yaml"
aws lambda invoke --function-name "gql-$ENVIRONMENT-init-db:live"   --payload '{}' --cli-binary-format raw-in-base64-out "$work/db.json" > "$work/db-result.json"
jq -e 'has("FunctionError") | not' "$work/db-result.json" >/dev/null
jq -e '.ok == true' "$work/db.json" >/dev/null

aws ecs describe-task-definition --task-definition "$ECS_TASK_DEFINITION"   --query taskDefinition --output json |
  jq --arg image "$image" '
    del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
        .registeredAt, .registeredBy, .deregisteredAt)
    | (.containerDefinitions[] | select(.name == "graphql") | .image) = $image
  ' > "$work/task.json"
new_task=$(aws ecs register-task-definition --cli-input-json "file://$work/task.json"   --query 'taskDefinition.taskDefinitionArn' --output text)
ecs_changed=1
aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE"   --task-definition "$new_task" >/dev/null
aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE"
active_task=$(aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE"   --query 'services[0].taskDefinition' --output text)
[[ $active_task == "$new_task" ]]

GRAPHQL_TOKEN=$(aws secretsmanager get-secret-value --secret-id "$ACCESS_TOKEN_ARN" --query SecretString --output text)
if [[ ${GITHUB_ACTIONS:-} == true ]]; then echo "::add-mask::$GRAPHQL_TOKEN"; fi
FRONTEND_URL="$FRONTEND_URL" GRAPHQL_TOKEN="$GRAPHQL_TOKEN" node frontend/scripts/smoke.mjs
unset GRAPHQL_TOKEN

aws s3 sync frontend/dist/assets "s3://$FRONTEND_BUCKET/assets"   --cache-control 'public,max-age=31536000,immutable'
aws s3 sync frontend/dist "s3://$FRONTEND_BUCKET" --exclude 'index.html' --exclude 'assets/*'   --cache-control no-cache
frontend_changed=1
aws s3 cp frontend/dist/index.html "s3://$FRONTEND_BUCKET/index.html"   --content-type text/html --cache-control no-store
for attempt in {1..6}; do
  if curl -fsS --max-time 20 "$FRONTEND_URL/" -o "$work/served-index.html" &&
    cmp -s frontend/dist/index.html "$work/served-index.html"; then
    echo 'CloudFront is serving the released frontend'
    exit 0
  fi
  if (( attempt < 6 )); then sleep 5; fi
done
echo 'CloudFront did not serve the released frontend' >&2
exit 1
