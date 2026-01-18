import type { GraphQLContext } from '../../context';
import { EVENTS } from '../../pubsub';
import { MarketService } from './market.service';
import { WorldService } from './world.service';

export const adminResolvers = {
  Query: {
    marketData: async (_: unknown, __: unknown, context: GraphQLContext) => {
      const host = context.request.headers.get('host') || undefined;
      const data = await MarketService.getMarketData(host);
      
      // Periodically broadcast updates to all subscribers
      context.pubsub.publish(EVENTS.MARKET_UPDATED, 'global', data);
      
      return data;
    },
    gameWorld: (_: unknown, { chunkX, chunkZ, radius = 1 }: { chunkX: number, chunkZ: number, radius?: number }) => {
      const chunks = WorldService.getChunks(chunkX, chunkZ, radius);
      return { chunks };
    },
  },
  Subscription: {
    marketDataUpdated: {
      subscribe: (_: unknown, __: unknown, context: GraphQLContext) => {
        return context.pubsub.subscribe(EVENTS.MARKET_UPDATED, 'global');
      },
      resolve: (payload: unknown) => payload,
    },
  },
};
