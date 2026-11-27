import express from "express";
import http from "http";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { typeDefs } from "./schema/typeDefs";
import { resolvers } from "./resolvers";

async function main() {
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const app = express();
  const httpServer = http.createServer(app);

  const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" });
  const wsCleanup = useServer({ schema }, wsServer);

  const server = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      { async serverWillStart() { return { async drainServer() { await wsCleanup.dispose(); } }; } },
    ],
  });
  await server.start();

  app.get("/health", (_req, res) => res.status(200).send("ok"));
  app.use("/graphql", cors(), express.json(), expressMiddleware(server));

  const port = Number(process.env.PORT ?? 4000);
  httpServer.listen(port, () => console.log(`GraphQL ready on :${port}/graphql`));
}

main().catch((e) => { console.error(e); process.exit(1); });