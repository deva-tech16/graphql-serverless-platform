import { subscription } from "../services/events";
import { callLambda } from "../services/lambda";

export const resolvers = {
  Query: {
    users: () => callLambda("list-users"),
    user: (_: unknown, args: { id: string }) =>
      callLambda("get-user", { id: Number(args.id) }),
  },
  Mutation: {
    createUser: (_: unknown, args: { name: string; email: string }) => callLambda("create-user", args),
    updateUser: (_: unknown, args: { id: string; name?: string; email?: string }) =>
      callLambda("update-user", { ...args, id: Number(args.id) }),
    deleteUser: async (_: unknown, args: { id: string }) => {
      const r = await callLambda<{ deleted: boolean }>("delete-user", { id: Number(args.id) });
      return r.deleted;
    },
  },
  Subscription: {
    userCreated: { subscribe: () => subscription("userCreated") },
    userUpdated: { subscribe: () => subscription("userUpdated") },
  },
};
