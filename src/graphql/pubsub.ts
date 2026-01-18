import { createPubSub } from 'graphql-yoga';

export const EVENTS = {
  PLAYER_UPDATED: 'PLAYER_UPDATED',
  INVENTORY_UPDATED: 'INVENTORY_UPDATED',
  MARKET_UPDATED: 'MARKET_UPDATED',
};

export type PubSubEvents = {
  [EVENTS.PLAYER_UPDATED]: [userId: string, payload: unknown];
  [EVENTS.INVENTORY_UPDATED]: [userId: string, payload: unknown];
  [EVENTS.MARKET_UPDATED]: [id: string, payload: unknown];
};

export const pubsub = createPubSub<PubSubEvents>();
