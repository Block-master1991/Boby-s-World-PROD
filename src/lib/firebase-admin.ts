import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'utils/logger';
import { FIREBASE_PROJECT_ID } from './constants';
import { FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } from './server-constants';

let app: App;
export let db: Firestore;

/**
 * Validate Firebase environment variables and transform private key.
 * Returns the transformed private key or null if validation fails.
 */
function validateFirebaseEnv(): string | null {
  const privateKey = FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const isPlaceholder = privateKey === "YOUR_FIREBASE_PRIVATE_KEY_HERE_WITH_NEWLINES_AS_\\n";
  const isValid = !!(FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && privateKey && !isPlaceholder);

  if (!isValid) {
    logger.error("Firebase Admin SDK environment variables are not set correctly or private key is placeholder.");
    logger.error("FIREBASE_PROJECT_ID:", FIREBASE_PROJECT_ID ? "Set" : "MISSING");
    logger.error("FIREBASE_CLIENT_EMAIL:", FIREBASE_CLIENT_EMAIL ? "Set" : "MISSING");
    logger.error("FIREBASE_PRIVATE_KEY:", privateKey ? (isPlaceholder ? "PLACEHOLDER" : "Set") : "MISSING");
    return null;
  }
  return privateKey;
}

/**
 * Professional initialization of Firebase Admin SDK.
 * Handles duplicate initialization, environment validation, and runtime checks.
 * Returns a Promise for backward compatibility with existing async calls.
 */
export function initializeAdminApp(): Promise<App | null> {
  // Prevent initialization in Edge runtime where firebase-admin is not supported
  if (typeof process !== 'undefined' && process.env['NEXT_RUNTIME'] === 'edge') {
    return Promise.resolve(null);
  }

  // Handle Hot Module Replacement (HMR) or multiple calls
  if (getApps().length > 0) {
    app = getApp();
    db = getFirestore(app);
    return Promise.resolve(app);
  }

  const privateKey = validateFirebaseEnv();
  if (!privateKey) return Promise.resolve(null);

  try {
    const credential = cert({
      projectId: FIREBASE_PROJECT_ID as string,
      clientEmail: FIREBASE_CLIENT_EMAIL as string,
      privateKey,
    });

    app = initializeApp({ credential });
    db = getFirestore(app);
    
    logger.log("[Firebase Admin] Successfully initialized with project:", FIREBASE_PROJECT_ID);
    return Promise.resolve(app);
  } catch (error) {
    logger.error("[Firebase Admin] Initialization failed:", error instanceof Error ? error.message : "Unknown error");
    return Promise.resolve(null);
  }
}
