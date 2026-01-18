import { makeExecutableSchema } from '@graphql-tools/schema';
import { adminResolvers } from '../modules/admin/admin.resolvers';
import { adminTypeDefs } from '../modules/admin/admin.typeDefs';
import { inventoryResolvers } from '../modules/inventory/inventory.resolvers';
import { inventoryTypeDefs } from '../modules/inventory/inventory.typeDefs';
import { playerResolvers } from '../modules/player/player.resolvers';
import { playerTypeDefs } from '../modules/player/player.typeDefs';
import { authDirectiveTransformer } from './directives/auth';
import { DateTime } from './scalars/DateTime';

const rootTypeDefs = `
  scalar DateTime

  type Query {
    health: String!
  }

  type Mutation {
    ping: String!
  }

  type Subscription {
    _empty: String
  }

  directive @auth(role: String) on FIELD_DEFINITION
`;

const rootResolvers = {
  DateTime,
  Query: {
    health: () => 'OK',
  },
  Mutation: {
    ping: () => 'pong',
  },
  Subscription: {},
};

let schema = makeExecutableSchema({
  typeDefs: [rootTypeDefs, playerTypeDefs, inventoryTypeDefs, adminTypeDefs],
  resolvers: [rootResolvers, playerResolvers, inventoryResolvers, adminResolvers],
});

// Apply directives
schema = authDirectiveTransformer(schema, 'auth');

export { schema };
