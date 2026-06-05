import { getDirective, MapperKind, mapSchema } from "@graphql-tools/utils";
import type { GraphQLSchema } from "graphql";
import { defaultFieldResolver } from "graphql";

export function authDirectiveTransformer(schema: GraphQLSchema, directiveName: string) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: fieldConfig => {
      const authDirective = getDirective(schema, fieldConfig, directiveName)?.[0];

      if (authDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;

        fieldConfig.resolve = async function (source, args, context, info) {
          if (!context.user) {
            throw new Error("Authentication required");
          }

          if (authDirective["role"] && context.role !== authDirective["role"]) {
            throw new Error("Unauthorized");
          }

          const result = await resolve(source, args, context, info);
          return result;
        };
        return fieldConfig;
      }
      return fieldConfig;
    },
  });
}
