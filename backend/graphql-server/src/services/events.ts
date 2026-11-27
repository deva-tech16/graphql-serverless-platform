import { readFileSync } from "node:fs";
import { Client } from "pg";
import { GraphQLError } from "graphql";
import { PubSub } from "graphql-subscriptions";
import { callLambda } from "./lambda";

type UserEvent = "userCreated" | "userUpdated";
const pubsub = new PubSub();
let listening = false;

export async function subscription(event: UserEvent) {
  const { ready } = await callLambda<{ ready: boolean }>("subscription-ready");
  if (!ready || !listening) throw new GraphQLError("Subscriptions are temporarily unavailable");
  return pubsub.asyncIterator(event);
}

export function listenForUserEvents() {
  const secret = JSON.parse(process.env.DB_SECRET_JSON ?? "{}");
  const ca = readFileSync("certs/us-east-1-bundle.pem", "utf8");

  let stopped = false;
  let currentClient: Client | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  async function connect() {
    const client = new Client({
      host: secret.host,
      port: secret.port,
      database: secret.database,
      user: secret.username,
      password: secret.password,
      ssl: { ca, rejectUnauthorized: true },
      connectionTimeoutMillis: 5000,
      keepAlive: true,
    });

    currentClient = client;
    let retrying = false;
    function reconnect(error?: Error) {
      if (stopped || retrying) return;
      retrying = true;
      listening = false;
      console.error("PostgreSQL listener disconnected", error?.name);
      void client.end().catch(() => {});
      retryTimer = setTimeout(() => void connect(), 3000);
    }

    client.on("error", reconnect);
    client.on("end", reconnect);
    client.on("notification", ({ payload }) => {
      if (!payload) return;
      try {
        const { event, user } = JSON.parse(payload);
        if (event === "userCreated" || event === "userUpdated") {
          void pubsub.publish(event, { [event]: user });
        }
      } catch {
        console.error("Invalid PostgreSQL user notification");
      }
    });

    try {
      await client.connect();
      await client.query("LISTEN graphql_users");
      if (!stopped && !retrying) listening = true;
    } catch (error) {
      reconnect(error instanceof Error ? error : undefined);
    }
  }

  void connect();
  return async () => {
    stopped = true;
    listening = false;
    clearTimeout(retryTimer);
    await currentClient?.end().catch(() => {});
  };
}
