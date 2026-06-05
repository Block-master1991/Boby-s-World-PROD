import { z } from "zod";

export const AddCoinsSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().positive().max(1000000, "Amount too large"),
});

export const UseItemSchema = z.object({
  userId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().int().positive().max(100, "Cannot use more than 100 items at once"),
});
