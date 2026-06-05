// Import the functions you need from the SDKs you need
import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// IMPORTANT: Replace this with your actual Firebase project configuration!
// Go to your Firebase project settings, find "Your apps", and copy the config object.

import { env } from "./config/env";

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { app, db };
