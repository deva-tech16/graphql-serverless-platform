import express from "express";
import http from "http";
import { timingSafeEqual } from "node:crypto";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { typeDefs } from "./schema/typeDefs";
import { listenForUserEvents } from "./services/events";
import { resolvers } from "./resolvers";

async function main() {
  const token = process.env.GRAPHQL_TOKEN;
  if (!token) throw new Error("GRAPHQL_TOKEN is required");
  const expected = Buffer.from(`Bearer ${token}`);
  const authorized = (header: unknown) => {
    if (typeof header !== "string") return false;
    const actual = Buffer.from(header);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };
  const stopListening = listenForUserEvents();
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const app = express();
  const httpServer = http.createServer(app);

  const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql", maxPayload: 32 * 1024 });
  const wsCleanup = useServer({ schema, onConnect: (ctx) => authorized(ctx.connectionParams?.authorization) }, wsServer, 12000);

  const server = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await Promise.all([wsCleanup.dispose(), stopListening()]);
            },
          };
        },
      },
    ],
  });
  await server.start();

  app.get("/health", (_req, res) => res.status(200).send("ok"));
  app.use("/graphql", (req, res, next) => {
    if (!authorized(req.headers.authorization)) {
      res.status(401).json({ errors: [{ message: "Unauthorized" }] });
      return;
    }
    next();
  }, express.json({ limit: "32kb" }), expressMiddleware(server));

  const port = Number(process.env.PORT ?? 4000);
  process.once("SIGTERM", () => void server.stop());
  httpServer.listen(port, () => console.log(`GraphQL ready on :${port}/graphql`));
}

main().catch((e) => { console.error(e); process.exit(1); });
