import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const client = new LambdaClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

const PREFIX = process.env.FUNCTION_PREFIX ?? "gql-dev";
const ALIAS  = process.env.LAMBDA_ALIAS;

function fnName(operation: string): string {
  const base = `${PREFIX}-${operation}`;
  return ALIAS ? `${base}:${ALIAS}` : base;
}

export async function callLambda<T = unknown>(
  operation: string,
  payload?: unknown
): Promise<T> {
  const FunctionName = fnName(operation);

  const res = await client.send(new InvokeCommand({
    FunctionName,
    InvocationType: "RequestResponse",
    Payload: payload ? Buffer.from(JSON.stringify(payload)) : undefined,
  }));

  if (res.FunctionError) {
    const body = res.Payload
      ? JSON.parse(Buffer.from(res.Payload).toString())
      : {};
    throw new Error(
      `Lambda ${FunctionName} failed: ${body.errorMessage ?? res.FunctionError}`
    );
  }

  if (!res.Payload) return undefined as T;

  const parsed = JSON.parse(Buffer.from(res.Payload).toString());

  // SAM HTTP-event Lambdas wrap in { statusCode, body }; these don't, falls through
  if (parsed?.statusCode !== undefined && parsed?.body !== undefined) {
    return (typeof parsed.body === "string"
      ? JSON.parse(parsed.body)
      : parsed.body) as T;
  }

  return parsed as T;
}