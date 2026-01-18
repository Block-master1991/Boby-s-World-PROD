export const adminTypeDefs = `
  type MarketData {
    bobyPrice: Float!
    volume24h: Float!
    priceChange24h: Float!
    lastUpdated: String!
  }

  type GameWorld {
    chunks: [WorldChunk!]!
  }

  type WorldObject {
    id: ID!
    type: String!
    x: Float!
    z: Float!
  }

  type WorldChunk {
    x: Int!
    z: Int!
    terrainType: String!
    objects: [WorldObject!]!
  }

  extend type Query {
    marketData: MarketData!
    gameWorld(chunkX: Int!, chunkZ: Int!, radius: Int): GameWorld!
  }

  extend type Subscription {
    marketDataUpdated: MarketData!
  }
`;
