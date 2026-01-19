export const inventoryTypeDefs = `
  type InventoryItem {
    id: ID!
    itemType: String
    name: String!
    quantity: Int!
    rarity: String!
    image: String
  }

  type StoreItem {
    id: ID!
    name: String!
    description: String!
    price: Float!
    image: String!
    type: String!
    rarity: String!
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
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
    storeItems: [StoreItem!]!
    activeStoreItems: [StoreItem!]!
    storeItem(id: ID!): StoreItem
  }

  extend type Mutation {
    useConsumableItem(itemId: String!, quantity: Int!): UseItemResult! @auth
    consumeProtectionBottle: UseItemResult! @auth
  }

  extend type Subscription {
    inventoryUpdated(userId: ID!): UserInventory @auth
  }
`;
