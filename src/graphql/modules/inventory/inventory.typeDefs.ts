export const inventoryTypeDefs = `
  type InventoryItem {
    id: ID!
    itemType: String!
    name: String!
    quantity: Int!
    rarity: String!
    image: String
  }

  type UserInventory {
    protectionBottleCount: Int!
    guardianShieldCount: Int!
    speedyPawsTreatCount: Int!
    coinMagnetTreatCount: Int!
    items: [InventoryItem!]!
  }

  type UseItemResult {
    success: Boolean!
    message: String!
    remainingCount: Int
    error: String
  }

  extend type Query {
    userInventory(userId: ID!): UserInventory! @auth
  }

  extend type Mutation {
    useConsumableItem(itemId: String!, quantity: Int!): UseItemResult! @auth
    consumeProtectionBottle: UseItemResult! @auth
  }

  extend type Subscription {
    inventoryUpdated(userId: ID!): UserInventory @auth
  }
`;
