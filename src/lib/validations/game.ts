import { z } from 'zod';

export const PurchaseItemSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive().max(100),
  transactionSignature: z.string().min(32),
  transactionAuthSignature: z.object({
    payload: z.any(),
    response: z.any(),
  }).optional(),
});

export type PurchaseItemInput = z.infer<typeof PurchaseItemSchema>;

export const AddCoinSchema = z.object({
  amount: z.number().int().positive().max(1000),
  timestamp: z.number(),
  signature: z.string(), // Request signature for game actions
});

export type AddCoinInput = z.infer<typeof AddCoinSchema>;
