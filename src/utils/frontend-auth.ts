import bs58 from "bs58";
import { logger } from "./logger";

/**
 * Creates the necessary headers for a signed admin action.
 * This function initiates a wallet signature request.
 *
 * @param signMessage - The wallet adapter's signMessage function
 * @param publicKey - The wallet's public key (to verify matching signer)
 * @param body - The request body (object or string)
 * @returns Promise<HeadersInit> - The headers to include in the fetch request
 */
export async function createSignedAdminHeaders(
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | undefined,
  publicKey: { toString: () => string } | null,
  body: unknown
): Promise<HeadersInit> {
  if (!signMessage || !publicKey) {
    throw new Error("Wallet not connected or does not support signing.");
  }

  const timestamp = new Date().toISOString();
  const bodyString = typeof body === "string" ? body : JSON.stringify(body);

  // Construct the message exactly as the server expects it: "timestamp.body"
  const messageString = `${timestamp}.${bodyString}`;
  const messageBytes = new TextEncoder().encode(messageString);

  try {
    const signatureBytes = await signMessage(messageBytes);
    const signature = bs58.encode(signatureBytes);

    return {
      "x-admin-signature": signature,
      "x-admin-action-timestamp": timestamp,
      "Content-Type": "application/json",
    };
  } catch (error) {
    logger.error("User rejected signature or signing failed:", error);
    throw new Error("Signature request denied or failed.");
  }
}
