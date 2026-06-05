/**
 * Helpers for Protection Bottle Consumption logic
 */

import type { InventoryItem } from "@/types/database";
import { NextResponse } from "next/server";

/**
 * Standardizes error responses for the bottle consumption flow
 */
export function handleConsumeError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Internal Server Error";
  let status = 500;

  if (message.includes("not found")) status = 404;
  else if (message.includes("No Protection Bottles")) status = 400;
  else if (message.includes("Firebase Admin")) status = 500;

  return NextResponse.json({ error: message }, { status });
}

/**
 * Removes one protection bottle (ID '1') from the inventory array.
 * Correctly handles item quantities (decrements if > 1, removes stack if 1).
 */
export function decrementInventoryItem(
  inventory: InventoryItem[],
  itemId: string
): InventoryItem[] {
  const updatedInventory = [...inventory];
  const index = updatedInventory.findIndex(item => item?.id === itemId);

  if (index === -1) {
    throw new Error("No Protection Bottles available.");
  }

  const item = updatedInventory[index];
  if (!item) {
    throw new Error("Protection Bottle data is corrupted.");
  }

  const currentQuantity = Number(item.quantity) || 1;

  if (currentQuantity > 1) {
    // Just decrement the quantity
    updatedInventory[index] = {
      ...item,
      quantity: currentQuantity - 1,
    };
  } else {
    // Final item in the stack, remove it
    updatedInventory.splice(index, 1);
  }

  return updatedInventory;
}
