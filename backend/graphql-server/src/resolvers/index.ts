import { PubSub } from "graphql-subscriptions";
import { callLambda } from "../services/lambda";

const pubsub = new PubSub();

export const resolvers = {
  Query: {
    users: () => callLambda("list-users"),
    user: (_: unknown, args: { id: string }) =>
      callLambda("get-user", { id: Number(args.id) }),
  },
  Mutation: {
    createUser: async (_: unknown, args: { name: string; email: string }) => {
      const user = await callLambda("create-user", args);
      await pubsub.publish("USER_CREATED", { userCreated: user });
      return user;
    },
    updateUser: async (_: unknown, args: { id: string; name?: string; email?: string }) => {
      const user = await callLambda("update-user", { ...args, id: Number(args.id) });
      if (user) await pubsub.publish("USER_UPDATED", { userUpdated: user });
      return user;
    },
    deleteUser: async (_: unknown, args: { id: string }) => {
      const r = await callLambda("delete-user", { id: Number(args.id) });
      return r.deleted;
    },
  },
  Subscription: {
    userCreated: { subscribe: () => pubsub.asyncIterator(["USER_CREATED"]) },
    userUpdated: { subscribe: () => pubsub.asyncIterator(["USER_UPDATED"]) },
  },
};