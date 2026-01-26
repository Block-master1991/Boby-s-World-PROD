export const playerTypeDefs = `
  type PlayerStats {
    coins: Float!
    level: Int!
    experience: Int!
  }

  type Player {
    id: ID!
    publicKey: String!
    level: Int!
    coins: Float!
    experience: Int!
    inventory: [InventoryItem!]!
    createdAt: DateTime!
    lastLogin: DateTime
    lastProcessedBatchId: String
  }

  type PlayerDataResult {
    success: Boolean!
    playerData: Player
    error: String
  }

  type CoinResult {
    success: Boolean!
    newBalance: Float!
    error: String
  }

  extend type Query {
    me: Player @auth
    playerData(userId: ID!): PlayerDataResult! @auth
  }

  extend type Mutation {
    addCoins(amount: Float!): CoinResult! @auth
  }

  extend type Subscription {
    playerUpdated(userId: ID!): Player @auth
  }
`;
