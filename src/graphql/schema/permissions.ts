import { rule, shield } from 'graphql-shield';
import type { GraphQLContext } from '../context';

// Rules
const isAuthenticated = rule({ cache: 'contextual' })(
  (_parent, _args, context: GraphQLContext) => {
    return context.user !== null;
  }
);

const isAdmin = rule({ cache: 'contextual' })(
  (_parent, _args, context: GraphQLContext) => {
    return context.role === 'admin';
  }
);

// Permissions
export const permissions = shield({
  Query: {
    me: isAuthenticated,
    playerData: isAuthenticated,
    userInventory: isAuthenticated,
  },
  Mutation: {
    addCoins: isAdmin,
    useConsumableItem: isAuthenticated,
    consumeProtectionBottle: isAuthenticated,
  },
}, {
  allowExternalErrors: true,
  fallbackError: 'Access Denied',
});
