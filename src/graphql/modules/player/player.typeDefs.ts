export const playerTypeDefs = `
  type PlayerStats {
    coins: Int!
    level: Int!
    experience: Int!
  }

  type Player {
    id: ID!
    publicKey: String!
    level: Int!
    coins: Int!
    experience: Int!
    inventory: [InventoryItem!]!
    createdAt: DateTime!
    lastLogin: DateTime
  }

  type PlayerDataResult {
    success: Boolean!
    playerData: Player
    error: String
  }

  type CoinResult {
    success: Boolean!
    newBalance: Int!
    error: String
  }

  extend type Query {
    me: Player @auth
    playerData(userId: ID!): PlayerDataResult! @auth
  }

  extend type Mutation {
    addCoins(amount: Int!): CoinResult! @auth
  }

  extend type Subscription {
    playerUpdated(userId: ID!): Player @auth
  }
`;
