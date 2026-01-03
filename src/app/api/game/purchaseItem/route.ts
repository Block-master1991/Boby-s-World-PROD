import { NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';
import { getActiveStoreItems } from '@/lib/server-items';
import { Connection, PublicKey } from '@solana/web3.js';
import { clusterApiUrl } from '@solana/web3.js';
import { BOBY_TOKEN_MINT_ADDRESS, STORE_TREASURY_WALLET_ADDRESS } from '@/lib/constants';
import { DEDICATED_RPC_ENDPOINT } from '@/lib/server-constants'; // Moved to server-side constants
import { WebAuthnUtils } from '@/lib/webauthn-utils';
import { WebAuthnTransactionSigner } from '@/lib/WebAuthnTransactionSigner';
import { logger } from '@/utils/logger';

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  logger.log("[API] /api/game/purchaseItem called");

  const userPublicKey = request.user?.sub;

  if (!userPublicKey) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // Verify that userPublicKey is a valid Solana public key
  try {
    new PublicKey(userPublicKey);
  } catch (e) {
    logger.error(`[API] Invalid user public key format: ${userPublicKey}`, e as Error);
    return NextResponse.json({ error: 'Invalid user public key format.' }, { status: 400 });
  }

  try {
    const { itemId, quantity, transactionSignature, transactionAuthSignature } = await request.json();

    if (!itemId || typeof quantity !== 'number' || quantity <= 0 || !transactionSignature) {
      return NextResponse.json({ error: 'Invalid request parameters.' }, { status: 400 });
    }

    // Validate item existence
    const allItems = await getActiveStoreItems();
    const itemDefinition = allItems.find((item: any) => item.id === itemId);
    if (!itemDefinition) {
      return NextResponse.json({ error: 'Invalid item ID.' }, { status: 400 });
    }

    await initializeAdminApp();
    const db = getFirestore();

    // Check if transaction signature has already been used
    const usedSignatureDocRef = db.collection('usedTransactionSignatures').doc(transactionSignature);
    const usedSignatureDoc = await usedSignatureDocRef.get();

    if (usedSignatureDoc.exists) {
      logger.error(`[API] Duplicate transaction signature detected: ${transactionSignature}`);
      return NextResponse.json({ error: 'This transaction signature has already been used.' }, { status: 409 }); // 409 Conflict
    }

    const playerDocRef = db.collection('players').doc(userPublicKey);

    // Verify the transactionSignature on the backend with retry logic for mobile
    const connection = new Connection(DEDICATED_RPC_ENDPOINT || clusterApiUrl('mainnet-beta'), 'confirmed');

    logger.log(`[API] Verifying transaction signature: ${transactionSignature}`);
    logger.log(`[API] Starting transaction verification with maxAttempts: 6, delay: 5000ms`);

    let transaction = null;
    let attempts = 0;
    const maxAttempts = 6; // Increased to 6 attempts as before
    const delayBetweenAttempts = 5000; // Increased to 5 seconds as before

    while (attempts < maxAttempts && !transaction) {
      try {
        transaction = await connection.getParsedTransaction(transactionSignature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed'
        });

        if (!transaction && attempts < maxAttempts - 1) {
          logger.log(`[API] Transaction not found, attempt ${attempts + 1}/${maxAttempts}. Retrying in ${delayBetweenAttempts}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
          attempts++;
        }
      } catch (error) {
        logger.error(`[API] Error fetching transaction on attempt ${attempts + 1}:`, error as Error);
        if (attempts < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
          attempts++;
        } else {
          break;
        }
      }
    }

    if (!transaction) {
      logger.error(`[API] Transaction not found after ${maxAttempts} attempts: ${transactionSignature}`);
      return NextResponse.json({
        error: 'Transaction not found or not confirmed. Please wait a moment and try again.',
        code: 'TRANSACTION_NOT_FOUND'
      }, { status: 404 });
    }

    // Verify transaction status
    if (transaction.meta?.err) {
      logger.error(`[API] Transaction failed: ${transactionSignature}, Error: ${transaction.meta.err}`);
      return NextResponse.json({ error: 'Transaction failed on Solana blockchain.' }, { status: 400 });
    }

    // Extract transaction details
    const sender = transaction.transaction.message.accountKeys[0].pubkey.toBase58(); // Usually the first account key is the sender
    // You will need to specify the actual recipient address (like store wallet address or smart contract program)
    // and expected item price and token.
    // These values should come from a secure place (like environment variables or database)
    // and not from the frontend request.

    // Example verification
    if (!STORE_TREASURY_WALLET_ADDRESS || !BOBY_TOKEN_MINT_ADDRESS) {
      logger.error("[API] Missing required environment variables for Solana verification.");
      return NextResponse.json({ error: 'Server configuration error: Missing Solana wallet or token mint addresses.' }, { status: 500 });
    }
    const expectedReceiverPublicKey = new PublicKey(STORE_TREASURY_WALLET_ADDRESS);
    const expectedTokenMintPublicKey = new PublicKey(BOBY_TOKEN_MINT_ADDRESS);
    const expectedAmount = itemDefinition.price * quantity; // Assume itemDefinition.price exists

    let amountTransferred = 0;
    let tokenMint = '';

    logger.log(`[API] Analyzing transaction balances for receiver: ${expectedReceiverPublicKey.toBase58()}`);

    // Search for SPL Token transfers or SOL with improved analysis
    if (transaction.meta?.postTokenBalances && transaction.meta.preTokenBalances) {
      logger.log(`[API] Found ${transaction.meta.postTokenBalances.length} post balances and ${transaction.meta.preTokenBalances.length} pre balances`);

      // Check SPL Token transfers
      for (const postBalance of transaction.meta.postTokenBalances) {
        const preBalance = transaction.meta.preTokenBalances.find(pb => pb.accountIndex === postBalance.accountIndex);
        if (preBalance && postBalance.uiTokenAmount && preBalance.uiTokenAmount) {
          if (postBalance.uiTokenAmount.uiAmount !== null && preBalance.uiTokenAmount.uiAmount !== null) {
            const diff = postBalance.uiTokenAmount.uiAmount - preBalance.uiTokenAmount.uiAmount;
            logger.log(`[API] Account ${postBalance.accountIndex}: owner=${postBalance.owner}, mint=${postBalance.mint}, diff=${diff}`);

            if (diff > 0 && postBalance.owner === expectedReceiverPublicKey.toBase58()) {
              amountTransferred = diff;
              tokenMint = postBalance.mint;
              logger.log(`[API] Found transfer to treasury: ${amountTransferred} tokens, mint: ${tokenMint}`);
              break;
            }
          }
        }
      }
    } else {
      logger.warn(`[API] Transaction missing token balance data. postTokenBalances: ${!!transaction.meta?.postTokenBalances}, preTokenBalances: ${!!transaction.meta?.preTokenBalances}`);
    }

    if (sender !== userPublicKey) {
      logger.error(`[API] Transaction sender mismatch. Expected: ${userPublicKey}, Got: ${sender}`);
      return NextResponse.json({ error: 'Transaction sender does not match authenticated user.' }, { status: 400 });
    }

    if (tokenMint !== expectedTokenMintPublicKey.toBase58()) { // We don't need to check SOL if we're using BOBY only
      logger.error(`[API] Token mint mismatch. Expected: ${expectedTokenMintPublicKey.toBase58()}, Got: ${tokenMint}`);
      return NextResponse.json({ error: 'Invalid token used for purchase. Expected BOBY token.' }, { status: 400 });
    }

    if (amountTransferred < expectedAmount) {
      logger.error(`[API] Insufficient amount transferred. Expected: ${expectedAmount}, Got: ${amountTransferred}`);
      return NextResponse.json({ error: 'Insufficient amount paid for the item.' }, { status: 400 });
    }

    // --- STEP-UP AUTH VERIFICATION ---
    // Mandatory for purchases > 50,000 (approx. $500 depending on price)
    if (expectedAmount > 50000 || transactionAuthSignature) {
      logger.log(`[API] Verifying Step-up Auth for high-value purchase: ${expectedAmount} Boby`);

      if (!transactionAuthSignature) {
        return NextResponse.json({ error: 'Security verification required for high-value transactions.' }, { status: 403 });
      }

      // 1. Get user's active passkey for verification
      // For simplicity, we assume the user has at least one passkey.
      // In a real scenario, the client could provide the credentialId used.
      const passkeys = await db.collection('players').doc(userPublicKey).collection('passkeys').get();
      if (passkeys.empty) {
        return NextResponse.json({ error: 'Passkey required for high-value security verification.' }, { status: 403 });
      }

      // We verify against any of the user's passkeys (usually they only have 1 active)
      let verified = false;

      // Reconstruct the expected challenge from the signed payload
      const expectedChallenge = WebAuthnTransactionSigner.generateTransactionChallenge(transactionAuthSignature.payload);

      // --- STRICT PAYLOAD VALIDATION ---
      // Verify that the user actually signed FOR the item they are trying to buy
      const signedPayload = transactionAuthSignature.payload;
      if (signedPayload.itemId !== itemId || Number(signedPayload.quantity) !== quantity) {
        logger.error(`[API] Payload mismatch! Signed: ${signedPayload.itemId}x${signedPayload.quantity}, Requested: ${itemId}x${quantity}`);
        return NextResponse.json({ error: 'Security verification data does not match the purchase request.' }, { status: 400 });
      }

      for (const pkDoc of passkeys.docs) {
        const pkData = pkDoc.data();
        const isMatch = await WebAuthnUtils.verifyAuthenticationResponse(
          pkData as any,
          transactionAuthSignature.response,
          expectedChallenge,
          request.headers.get('origin') || ''
        );
        if (isMatch) {
          verified = true;
          break;
        }
      }

      if (!verified) {
        logger.error(`[API] Step-up Auth verification FAILED for user: ${userPublicKey}`);
        return NextResponse.json({ error: 'Security verification failed. High-value transactions require a valid passkey signature.' }, { status: 401 });
      }
      logger.log(`[API] Step-up Auth verification SUCCESS for user: ${userPublicKey}`);
    }

    logger.log(`[API] Transaction ${transactionSignature} successfully verified.`);

    // Record transaction signature to prevent reuse
    await usedSignatureDocRef.set({
      userId: userPublicKey,
      timestamp: FieldValue.serverTimestamp(),
      itemId: itemId,
      quantity: quantity,
    });
    logger.log(`[API] Transaction signature ${transactionSignature} recorded as used.`);

    const itemsToAdd = Array(quantity).fill(null).map(() => ({
      id: itemDefinition.id,
      name: itemDefinition.name,
      image: itemDefinition.image,
      description: itemDefinition.description,
      dataAiHint: itemDefinition.dataAiHint,
      instanceId: `item-${Date.now()}-${Math.random().toString(36).substring(2, 11)}` // Unique instance ID
    }));

    await playerDocRef.update({
      inventory: FieldValue.arrayUnion(...itemsToAdd),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const response = NextResponse.json({ message: `${quantity} ${itemDefinition.name}(s) added to inventory.`, newItems: itemsToAdd });

    // Use unified helper to update CSRF
    const requestHost = request.headers.get('host') || undefined;
    return await setCsrfTokenResponse(response, userPublicKey, requestHost);
  } catch (error) {
    logger.error("Error processing item purchase:", error as Error);
    let errorMessage = 'Failed to process item purchase. Please try again.'; // General message for user
    let statusCode = 500;

    // Can keep specific error messages if they don't reveal sensitive information
    if (error instanceof Error && error.message.includes("Authentication required")) {
      errorMessage = "Authentication required.";
      statusCode = 401;
    } else if (error instanceof Error && error.message.includes("Invalid request parameters")) {
      errorMessage = "Invalid request parameters.";
      statusCode = 400;
    } else if (error instanceof Error && error.message.includes("Invalid item ID")) {
      errorMessage = "Invalid item ID.";
      statusCode = 400;
    } else if (error instanceof Error && error.message.includes("This transaction signature has already been used.")) {
      errorMessage = "This transaction has already been processed.";
      statusCode = 409;
    } else if (error instanceof Error && error.message.includes("Transaction not found or not confirmed.")) {
      errorMessage = "Solana transaction not found or not confirmed.";
      statusCode = 404;
    } else if (error instanceof Error && error.message.includes("Transaction failed on Solana blockchain.")) {
      errorMessage = "Solana transaction failed.";
      statusCode = 400;
    } else if (error instanceof Error && error.message.includes("Transaction sender does not match authenticated user.")) {
      errorMessage = "Transaction sender mismatch.";
      statusCode = 400;
    } else if (error instanceof Error && error.message.includes("Invalid token used for purchase. Expected BOBY token.")) {
      errorMessage = "Invalid token used for purchase. Expected BOBY token.";
      statusCode = 400;
    } else if (error instanceof Error && error.message.includes("Insufficient amount paid for the item.")) {
      errorMessage = "Insufficient amount paid for the item.";
      statusCode = 400;
    } else if (error instanceof Error && error.message.includes("Invalid user public key format.")) {
      errorMessage = "Invalid user public key format.";
      statusCode = 400;
    } else if (error instanceof Error && error.message.includes("Missing required environment variables for Solana verification.")) {
      errorMessage = "Server configuration error. Please contact support.";
      statusCode = 500;
    } else if (error instanceof Error && error.message.includes("Server busy, try again later.")) { // From rateLimit
      errorMessage = "Server busy, please try again later.";
      statusCode = 503;
    } else if (error instanceof Error && error.message.includes("Too many requests. Please try again later.")) { // From rateLimit
      errorMessage = "Too many requests. Please try again later.";
      statusCode = 429;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}));
