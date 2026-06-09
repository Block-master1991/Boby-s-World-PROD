import { initializeAdminApp } from "@/lib/firebase/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "utils/logger";
import type {
  CreateItemInput,
  ItemResult,
  StoreItemDefinition,
  UpdateItemInput,
} from "./server-items-types";

// Create new item
export async function createStoreItem(input: CreateItemInput): Promise<ItemResult> {
  try {
    await initializeAdminApp();
    const db = getFirestore();

    // Generate unique ID if not provided
    const itemId = input.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Remove id from input and assign to remainder, rename id to _idOmitted to avoid unused var warning
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _idOmitted, ...inputWithoutId } = input;

    const newItem: StoreItemDefinition = {
      id: itemId,
      ...inputWithoutId,
      isActive: true, // Default to active
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection("storeItems").doc(itemId).set(newItem);

    logger.log(`Created new store item: ${itemId}`);
    return {
      success: true,
      item: newItem,
      message: "Item created successfully",
    };
  } catch (error) {
    logger.error("Error creating store item:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to create item",
    };
  }
}

// Update existing item
export async function updateStoreItem(id: string, updates: UpdateItemInput): Promise<ItemResult> {
  try {
    await initializeAdminApp();
    const db = getFirestore();

    const itemRef = db.collection("storeItems").doc(id);
    const itemDoc = await itemRef.get();

    if (!itemDoc.exists) {
      return {
        success: false,
        message: "Item not found",
      };
    }

    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await itemRef.update(updateData);

    // Fetch updated item
    const updatedDoc = await itemRef.get();
    const updatedItem = updatedDoc.data() as StoreItemDefinition;

    logger.log(`Updated store item: ${id}`);
    return {
      success: true,
      item: updatedItem,
      message: "Item updated successfully",
    };
  } catch (error) {
    logger.error("Error updating store item:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update item",
    };
  }
}

// Update item price
export function updateItemPrice(id: string, newPrice: number): Promise<ItemResult> {
  return updateStoreItem(id, { price: newPrice });
}

// Activate/deactivate item
export function toggleItemStatus(id: string, isActive: boolean): Promise<ItemResult> {
  return updateStoreItem(id, { isActive });
}

// Delete item
export async function deleteStoreItem(id: string): Promise<ItemResult> {
  try {
    await initializeAdminApp();
    const db = getFirestore();

    const itemRef = db.collection("storeItems").doc(id);
    const itemDoc = await itemRef.get();

    if (!itemDoc.exists) {
      return {
        success: false,
        message: "Item not found",
      };
    }

    await itemRef.delete();

    logger.log(`Deleted store item: ${id}`);
    return {
      success: true,
      message: "Item deleted successfully",
    };
  } catch (error) {
    logger.error("Error deleting store item:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete item",
    };
  }
}

// Validate item data
export function validateItemData(input: CreateItemInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.name || input.name.trim().length < 2) {
    errors.push("Name must be at least 2 characters");
  }

  if (!input.description || input.description.trim().length < 10) {
    errors.push("Description must be at least 10 characters");
  }

  if (!input.price || input.price <= 0) {
    errors.push("Price must be greater than 0");
  }

  if (!input.image || !input.image.trim()) {
    errors.push("Image URL is required");
  }

  if (!["consumable", "permanent"].includes(input.type)) {
    errors.push("Type must be either consumable or permanent");
  }

  if (!["common", "rare", "epic", "legendary"].includes(input.rarity)) {
    errors.push("Rarity must be common, rare, epic, or legendary");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
