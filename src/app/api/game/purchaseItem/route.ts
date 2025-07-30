import { NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware'; // استيراد CSRF middleware
import { CSRFManager } from '@/lib/csrf-utils'; // استيراد CSRFManager
import { JWTManager } from '@/lib/jwt-utils'; // لاستخدام createSecureCookieOptions
import { storeItems } from '@/lib/items'; // To validate item existence
import { Connection, PublicKey, TransactionResponse, ParsedTransactionWithMeta } from '@solana/web3.js';
import { clusterApiUrl } from '@solana/web3.js';
import { BOBY_TOKEN_MINT_ADDRESS, STORE_TREASURY_WALLET_ADDRESS } from '@/lib/constants';

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  console.log("[API] /api/game/purchaseItem called");

  const userPublicKey = request.user?.sub;

  if (!userPublicKey) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const { itemId, quantity, transactionSignature } = await request.json();

    if (!itemId || typeof quantity !== 'number' || quantity <= 0 || !transactionSignature) {
      return NextResponse.json({ error: 'Invalid request parameters.' }, { status: 400 });
    }

    // Validate item existence
    const itemDefinition = storeItems.find(item => item.id === itemId);
    if (!itemDefinition) {
      return NextResponse.json({ error: 'Invalid item ID.' }, { status: 400 });
    }

    await initializeAdminApp();
    const db = getFirestore();

    // التحقق مما إذا كان توقيع المعاملة قد تم استخدامه بالفعل
    const usedSignatureDocRef = db.collection('usedTransactionSignatures').doc(transactionSignature);
    const usedSignatureDoc = await usedSignatureDocRef.get();

    if (usedSignatureDoc.exists) {
      console.error(`[API] Duplicate transaction signature detected: ${transactionSignature}`);
      return NextResponse.json({ error: 'This transaction signature has already been used.' }, { status: 409 }); // 409 Conflict
    }

    const playerDocRef = db.collection('players').doc(userPublicKey);

    // Verify the transactionSignature on the backend
    const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed'); // يمكنك تغيير 'mainnet-beta' إلى 'devnet' أو 'testnet' حسب الحاجة

    console.log(`[API] Verifying transaction signature: ${transactionSignature}`);

    const transaction = await connection.getParsedTransaction(transactionSignature, {
      maxSupportedTransactionVersion: 0, // أو 0 إذا كنت تستخدم معاملات الإصدار القديم
      commitment: 'confirmed'
    });

    if (!transaction) {
      console.error(`[API] Transaction not found or not confirmed: ${transactionSignature}`);
      return NextResponse.json({ error: 'Transaction not found or not confirmed.' }, { status: 404 });
    }

    // تحقق من حالة المعاملة
    if (transaction.meta?.err) {
      console.error(`[API] Transaction failed: ${transactionSignature}, Error: ${transaction.meta.err}`);
      return NextResponse.json({ error: 'Transaction failed on Solana blockchain.' }, { status: 400 });
    }

    // استخراج تفاصيل المعاملة
    const sender = transaction.transaction.message.accountKeys[0].pubkey.toBase58(); // عادةً ما يكون أول مفتاح حساب هو المرسل
    // ستحتاج إلى تحديد عنوان المستلم الفعلي (مثل عنوان محفظة المتجر أو برنامج العقد الذكي)
    // وسعر العنصر والرمز المميز المتوقعين.
    // هذه القيم يجب أن تأتي من مكان آمن (مثل متغيرات البيئة أو قاعدة البيانات)
    // وليس من طلب الواجهة الأمامية.

    // مثال على التحقق
    if (!STORE_TREASURY_WALLET_ADDRESS || !BOBY_TOKEN_MINT_ADDRESS) {
      console.error("[API] Missing required environment variables for Solana verification.");
      return NextResponse.json({ error: 'Server configuration error: Missing Solana wallet or token mint addresses.' }, { status: 500 });
    }
    const expectedReceiverPublicKey = new PublicKey(STORE_TREASURY_WALLET_ADDRESS);
    const expectedTokenMintPublicKey = new PublicKey(BOBY_TOKEN_MINT_ADDRESS);
    const expectedAmount = itemDefinition.price * quantity; // افترض أن itemDefinition.price موجود

    let amountTransferred = 0;
    let tokenMint = '';

    // البحث عن تحويلات SPL Token أو SOL
    if (transaction.meta?.postTokenBalances && transaction.meta.preTokenBalances) {
      // تحقق من تحويلات SPL Token
      for (const postBalance of transaction.meta.postTokenBalances) {
        const preBalance = transaction.meta.preTokenBalances.find(pb => pb.accountIndex === postBalance.accountIndex);
        if (preBalance && postBalance.uiTokenAmount && preBalance.uiTokenAmount) {
          if (postBalance.uiTokenAmount.uiAmount !== null && preBalance.uiTokenAmount.uiAmount !== null) {
            const diff = postBalance.uiTokenAmount.uiAmount - preBalance.uiTokenAmount.uiAmount;
            if (diff > 0 && postBalance.owner === expectedReceiverPublicKey.toBase58()) {
              amountTransferred = diff;
              tokenMint = postBalance.mint;
              break;
            }
          }
        }
      }

    }

    if (sender !== userPublicKey) {
      console.error(`[API] Transaction sender mismatch. Expected: ${userPublicKey}, Got: ${sender}`);
      return NextResponse.json({ error: 'Transaction sender does not match authenticated user.' }, { status: 400 });
    }

    if (tokenMint !== expectedTokenMintPublicKey.toBase58()) { // لا نحتاج للتحقق من SOL إذا كنا نستخدم BOBY فقط
      console.error(`[API] Token mint mismatch. Expected: ${expectedTokenMintPublicKey.toBase58()}, Got: ${tokenMint}`);
      return NextResponse.json({ error: 'Invalid token used for purchase. Expected BOBY token.' }, { status: 400 });
    }

    if (amountTransferred < expectedAmount) {
      console.error(`[API] Insufficient amount transferred. Expected: ${expectedAmount}, Got: ${amountTransferred}`);
      return NextResponse.json({ error: 'Insufficient amount paid for the item.' }, { status: 400 });
    }

    console.log(`[API] Transaction ${transactionSignature} successfully verified.`);

    // تسجيل توقيع المعاملة لمنع التكرار
    await usedSignatureDocRef.set({
      userId: userPublicKey,
      timestamp: FieldValue.serverTimestamp(),
      itemId: itemId,
      quantity: quantity,
    });
    console.log(`[API] Transaction signature ${transactionSignature} recorded as used.`);

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

    // إصدار CSRF Token جديد بعد الطلب الناجح
    const requestHost = request.headers.get('host') || undefined;
    const csrfToken = await CSRFManager.getOrCreateToken(userPublicKey);
    response.cookies.set('csrfToken', csrfToken, {
      httpOnly: false,
      secure: JWTManager.createSecureCookieOptions(0, requestHost).secure,
      sameSite: JWTManager.createSecureCookieOptions(0, requestHost).sameSite,
      maxAge: 30 * 60, // 30 دقيقة
      path: '/',
    });
    console.log('[purchaseItem] New CSRF token issued and set in cookie.');

    return response;
  } catch (error: any) {
    console.error("Error processing item purchase:", error);
    let errorMessage = error.message || 'Failed to process item purchase.';
    let statusCode = 500;

    if (errorMessage.includes("Firebase Admin SDK environment variables are not set correctly")) {
      errorMessage = "Server configuration error: Firebase Admin SDK not properly set up.";
      statusCode = 500;
    } else if (errorMessage.includes("Authentication required")) {
      statusCode = 401;
    } else if (errorMessage.includes("Invalid request parameters")) {
      statusCode = 400;
    } else if (errorMessage.includes("Invalid item ID")) {
      statusCode = 400;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}));
