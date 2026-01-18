import { checkGraphQLMutationRateLimit } from '@/lib/graphql-rate-limiter';
import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../../context';
import { EVENTS } from '../../pubsub';
import { PlayerService } from './player.service';

export const playerResolvers = {
  Query: {
    me: async (_: unknown, __: unknown, context: GraphQLContext) => {
      if (!context.user) return null;
      // Pass context for DataLoader usage
      const data = await PlayerService.getPlayerData(context.user.id, context);
      return data;
    },
    playerData: async (_: unknown, { userId }: { userId: string }, context: GraphQLContext) => {
      try {
        const data = await PlayerService.getPlayerData(userId, context);
        return { success: true, playerData: data };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch player data' };
      }
    },
  },
  Mutation: {
    addCoins: async (_: unknown, { amount }: { amount: number }, context: GraphQLContext) => {
      try {
        if (!context.user) throw new GraphQLError('Authentication required');

        // Rate Limit Check
        const clientIp = context.request.headers.get('x-forwarded-for') || 'unknown';
        await checkGraphQLMutationRateLimit(clientIp, 'addCoins', context.user.id);

        const newBalance = await PlayerService.addCoins(context.user.id, amount);
        
        // Broadcast update
        // We can reuse the loader via getPlayerData(..., context), 
        // but since we just wrote, we might want fresh data. 
        // DataLoader by default caches for the request.
        // However, addCoins logic is separate from getter.
        const playerData = await PlayerService.getPlayerData(context.user.id, context);
        if (playerData) {
          context.pubsub.publish(EVENTS.PLAYER_UPDATED, context.user.id, playerData);
        }

        return { success: true, newBalance };
      } catch (error) {
        // preserve error message
        const message = error instanceof Error ? error.message : 'Failed to add coins';
        return { success: false, newBalance: 0, error: message };
      }
    },
  },
  Subscription: {
    playerUpdated: {
      subscribe: (_: unknown, { userId }: { userId: string }, context: GraphQLContext) => {
        return context.pubsub.subscribe(EVENTS.PLAYER_UPDATED, userId);
      },
      resolve: (payload: unknown) => payload,
    },
  },
};
