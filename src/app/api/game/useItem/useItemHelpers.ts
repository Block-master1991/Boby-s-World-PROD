/**
 * Helpers for Use Item logic
 */

import type { InventoryItem } from "@/types/database";
import { NextResponse } from "next/server";

/**
 * Validates the use request body
 */
export function validateUseRequest(
  itemId: unknown,
  amount: unknown
): { itemId: string; amount: number } {
  if (!itemId || typeof itemId !== "string") {
    throw new Error("Item ID is required and must be a string.");
  }
  if (typeof amount !== "number" || amount <= 0 || !Number.isInteger(amount)) {
    throw new Error("Amount is required and must be a positive integer.");
  }
  return { itemId, amount };
}

/**
 * Standardizes error responses for item usage flow
 */
export function handleUseItemError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Internal Server Error";
  let status = 500;

  if (message.includes("required") || message.includes("enough")) status = 400;
  else if (message.includes("not found")) status = 404;
  else if (message.includes("Authentication")) status = 401;

  return NextResponse.json({ error: message }, { status });
}

/**
 * Sophisticated inventory management logic to reduce item quantities across multiple stacks.
 * Returns the modified inventory array.
 */
export function calculateUpdatedInventory(
  inventory: InventoryItem[],
  itemId: string,
  amountToUse: number
): InventoryItem[] {
  // 1. Check total availability across all stacks
  const totalItemCount = inventory
    .filter(item => item?.id === itemId)
    .reduce((sum, item) => sum + (item.quantity || 1), 0);

  if (totalItemCount < amountToUse) {
    throw new Error(
      `You do not have enough items. You have ${totalItemCount}, but requested ${amountToUse}.`
    );
  }

  // 2. Perform deduction
  const updatedInventory = [...inventory];
  let remainingToRemove = amountToUse;

  for (let i = 0; i < updatedInventory.length; i++) {
    const item = updatedInventory[i];
    if (item && item.id === itemId && remainingToRemove > 0) {
      const currentQuantity = item.quantity || 1;

      if (currentQuantity <= remainingToRemove) {
        // Remove entire stack
        updatedInventory.splice(i, 1);
        remainingToRemove -= currentQuantity;
        i--; // Adjust index
      } else {
        // Reduce stack quantity
        updatedInventory[i] = {
          ...item,
          quantity: currentQuantity - remainingToRemove,
        };
        remainingToRemove = 0;
      }
    }
  }

  return updatedInventory;
}
