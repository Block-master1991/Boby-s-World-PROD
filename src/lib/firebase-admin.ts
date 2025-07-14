import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import {FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY} from './constants';

let app: admin.app.App;
export let db: admin.firestore.Firestore;

export async function initializeAdminApp() {
  if (admin.apps.length > 0) {
    app = admin.apps[0] as admin.app.App;
    db = getFirestore(app);
    return app;
  }

  console.log("[Firebase Admin Init] Checking environment variables...");
  console.log("FIREBASE_PROJECT_ID:", FIREBASE_PROJECT_ID ? "Set" : "MISSING_OR_EMPTY");
  console.log("FIREBASE_CLIENT_EMAIL:", FIREBASE_CLIENT_EMAIL ? "Set" : "MISSING_OR_EMPTY");
  console.log("FIREBASE_PRIVATE_KEY (first 20 chars):", FIREBASE_PRIVATE_KEY ? FIREBASE_PRIVATE_KEY.substring(0, 20) + "..." : "MISSING_OR_EMPTY");

  const privateKey = FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (
    !FIREBASE_PROJECT_ID ||
    !FIREBASE_CLIENT_EMAIL ||
    !privateKey ||
    privateKey === "YOUR_FIREBASE_PRIVATE_KEY_HERE_WITH_NEWLINES_AS_\\n" // Explicit check for placeholder
  ) {
    console.error("Firebase Admin SDK environment variables are not set correctly or private key is placeholder.");
    console.error("FIREBASE_PROJECT_ID (Error Check):", FIREBASE_PROJECT_ID ? "Set" : "MISSING_OR_EMPTY");
    console.error("FIREBASE_CLIENT_EMAIL (Error Check):", FIREBASE_CLIENT_EMAIL ? "Set" : "MISSING_OR_EMPTY");
    console.error("FIREBASE_PRIVATE_KEY (Error Check):", 
      privateKey 
        ? (privateKey === "YOUR_FIREBASE_PRIVATE_KEY_HERE_WITH_NEWLINES_AS_\\n" 
            ? "IS_PLACEHOLDER_VALUE" 
            : "Set (verify content and format)") 
        : "MISSING_OR_EMPTY"
    );
    throw new Error('Firebase Admin SDK environment variables are not set correctly. Please check your .env file, especially FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.');
  }

  const credential = admin.credential.cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  });

  app = admin.initializeApp({
    credential,
  });

  db = getFirestore(app);
  return app;
}
