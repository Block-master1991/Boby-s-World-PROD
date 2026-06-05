import { checkGraphQLMutationRateLimit } from "@/lib/graphql-rate-limiter";
import { GraphQLError } from "graphql";
import type { GraphQLContext } from "../../context";
import { EVENTS } from "../../pubsub";
import { InventoryService } from "./inventory.service";

export const inventoryResolvers = {
  Query: {
    userInventory: async (_: unknown, { userId }: { userId: string }) => {
      const data = await InventoryService.getUserInventoryCounts(userId);
      return data;
    },
    storeItems: () => {
      return InventoryService.getStoreItems();
    },
    activeStoreItems: () => {
      return InventoryService.getActiveStoreItems();
    },
    storeItem: (_: unknown, { id }: { id: string }) => {
      return InventoryService.getStoreItem(id);
    },
  },
  Mutation: {
    useConsumableItem: async (
      _: unknown,
      { itemId, quantity }: { itemId: string; quantity: number },
      context: GraphQLContext
    ) => {
      try {
        if (!context.user) throw new GraphQLError("Authentication required");

        // Rate Limit Check
        const clientIp = context.request.headers.get("x-forwarded-for") || "unknown";
        await checkGraphQLMutationRateLimit(clientIp, "useConsumableItem", context.user.id);

        const remaining = await InventoryService.useItem(context.user.id, itemId, quantity);

        // Broadcast update
        const inventoryData = await InventoryService.getUserInventoryCounts(context.user.id);
        context.pubsub.publish(EVENTS.INVENTORY_UPDATED, context.user.id, inventoryData);

        return { success: true, message: "Item(s) used successfully", remainingCount: remaining };
      } catch (error) {
        return {
          success: false,
          message: "Failed to use item",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    consumeProtectionBottle: async (_: unknown, __: unknown, context: GraphQLContext) => {
      try {
        if (!context.user) throw new GraphQLError("Authentication required");

        // Rate Limit Check
        const clientIp = context.request.headers.get("x-forwarded-for") || "unknown";
        await checkGraphQLMutationRateLimit(clientIp, "consumeProtectionBottle", context.user.id);

        const remaining = await InventoryService.useItem(context.user.id, "1", 1);

        // Broadcast update
        const inventoryData = await InventoryService.getUserInventoryCounts(context.user.id);
        context.pubsub.publish(EVENTS.INVENTORY_UPDATED, context.user.id, inventoryData);

        return { success: true, message: "Protection bottle consumed", remainingCount: remaining };
      } catch (error) {
        return {
          success: false,
          message: "Failed to consume bottle",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },
  Subscription: {
    inventoryUpdated: {
      subscribe: (_: unknown, { userId }: { userId: string }, context: GraphQLContext) => {
        return context.pubsub.subscribe(EVENTS.INVENTORY_UPDATED, userId);
      },
      resolve: (payload: unknown) => payload,
    },
  },
};
