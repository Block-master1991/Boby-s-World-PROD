// src/lib/cryptoUtils.ts

// --- Master Key Management ---
// IMPORTANT: Master key should be stored securely, e.g., in environment variables.
// It should NOT be hardcoded directly in the source code.
// For Next.js API routes, process.env is available server-side.
// For frontend use, NEXT_PUBLIC_ prefix is needed, but master key should ideally not be exposed to the client.
// We will assume the master key is loaded server-side by the API route.

const MASTER_KEY_ENV_VAR = 'NEXT_PUBLIC_MASTER_ENCRYPTION_KEY'; // Using NEXT_PUBLIC_ for potential frontend access if needed, but primarily for backend.

// Function to get the master key (intended for server-side use in API routes)
export const getMasterKeyEnv = (): string | null => {
  // In a real application, you'd want more robust handling for missing keys.
  // For API routes, process.env is available.
  // For frontend, NEXT_PUBLIC_ makes it available, but this is NOT secure for a master key.
  // We'll assume this is primarily used server-side.
  return process.env[MASTER_KEY_ENV_VAR] || null;
};

// --- Key Generation and Management ---

// Function to generate a new AES-GCM key
export const generateAesKey = async (): Promise<CryptoKey> => {
  if (!crypto || !crypto.subtle) {
    throw new Error('Web Crypto API not available.');
  }
  return crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256, // Can be 128, 192, or 256
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
};

// Function to export a CryptoKey to JWK format
export const exportKey = async (key: CryptoKey): Promise<JsonWebKey> => {
  if (!crypto || !crypto.subtle) {
    throw new Error('Web Crypto API not available.');
  }
  return crypto.subtle.exportKey('jwk', key);
};

// Function to import a CryptoKey from JWK format
export const importKey = async (jwkKey: JsonWebKey): Promise<CryptoKey> => {
  if (!crypto || !crypto.subtle) {
    throw new Error('Web Crypto API not available.');
  }
  return crypto.subtle.importKey(
    'jwk',
    jwkKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );
};

// --- IndexedDB Operations ---
// These functions will interact with IndexedDB.
// We'll need to define the DB name and store name.
const DB_NAME = 'cryptoStore';
const KEY_STORE_NAME = 'encryptionKeys'; // For master key or general keys
const USER_KEY_STORE_NAME = 'userKeys'; // For user-specific encrypted keys

// Helper to get IndexedDB instance
const getDb = async () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1); // Version 1

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(USER_KEY_STORE_NAME)) {
        db.createObjectStore(USER_KEY_STORE_NAME, { keyPath: 'userId' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject(`IndexedDB error: ${(event.target as IDBOpenDBRequest).error}`);
    };
  });
};

// Store a key in IndexedDB (e.g., master key or general keys)
export const storeKeyInIndexedDB = async (key: CryptoKey, keyName: string) => {
  const db = await getDb();
  const jwkKey = await exportKey(key);
  const tx = db.transaction(KEY_STORE_NAME, 'readwrite');
  const store = tx.objectStore(KEY_STORE_NAME);
  const request = store.put({ id: keyName, key: jwkKey });

  return new Promise<void>((resolve, reject) => {
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = (event) => {
      reject(`Failed to store key in IndexedDB: ${(event.target as IDBRequest).error}`);
    };
  });
};

// Retrieve a key from IndexedDB (e.g., master key or general keys)
export const retrieveKeyFromIndexedDB = async (keyName: string): Promise<CryptoKey | null> => {
  const db = await getDb();
  const tx = db.transaction(KEY_STORE_NAME, 'readonly');
  const store = tx.objectStore(KEY_STORE_NAME);
  const request = store.get(keyName);

  return new Promise((resolve, reject) => {
    request.onsuccess = async () => {
      if (request.result && request.result.key) {
        const importedKey = await importKey(request.result.key);
        resolve(importedKey);
      } else {
        resolve(null); // Key not found
      }
    };
    request.onerror = (event) => {
      reject(`Failed to retrieve key from IndexedDB: ${(event.target as IDBRequest).error}`);
    };
  });
};

// Store user-specific encrypted key in IndexedDB
export const storeUserEncryptedKeyInIndexedDB = async (userId: string, encryptedKey: ArrayBuffer) => {
  const db = await getDb();
  const tx = db.transaction(USER_KEY_STORE_NAME, 'readwrite');
  const store = tx.objectStore(USER_KEY_STORE_NAME);
  const request = store.put({ userId: userId, encryptedKey: encryptedKey });

  return new Promise<void>((resolve, reject) => {
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = (event) => {
      reject(`Failed to store user key in IndexedDB: ${(event.target as IDBRequest).error}`);
    };
  });
};

// Retrieve user-specific encrypted key from IndexedDB
export const retrieveUserEncryptedKeyFromIndexedDB = async (userId: string): Promise<ArrayBuffer | null> => {
  const db = await getDb();
  const tx = db.transaction(USER_KEY_STORE_NAME, 'readonly');
  const store = tx.objectStore(USER_KEY_STORE_NAME);
  const request = store.get(userId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      if (request.result && request.result.encryptedKey) {
        resolve(request.result.encryptedKey);
      } else {
        resolve(null); // Key not found
      }
    };
    request.onerror = (event) => {
      reject(`Failed to retrieve user key from IndexedDB: ${(event.target as IDBRequest).error}`);
    };
  });
};


// --- Encryption/Decryption ---

// Encrypt data using AES-GCM
export const encryptData = async (data: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> => {
  if (!crypto || !crypto.subtle) {
    throw new Error('Web Crypto API not available.');
  }
  const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM requires a 12-byte IV
  const encryptedContent = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    data
  );

  // Prepend IV to the encrypted data
  const encryptedDataWithIv = new Uint8Array(iv.length + encryptedContent.byteLength);
  encryptedDataWithIv.set(iv, 0);
  encryptedDataWithIv.set(new Uint8Array(encryptedContent), iv.length);

  return encryptedDataWithIv.buffer;
};

// Decrypt data using AES-GCM
export const decryptData = async (encryptedDataWithIv: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> => {
  if (!crypto || !crypto.subtle) {
    throw new Error('Web Crypto API not available.');
  }
  const iv = encryptedDataWithIv.slice(0, 12); // IV is the first 12 bytes
  const encryptedContent = encryptedDataWithIv.slice(12); // The rest is the encrypted data

  const decryptedContent = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encryptedContent
  );

  return decryptedContent;
};

// --- Helper to get master key for API routes ---
// This function is intended to be used within API routes (server-side)
// It assumes the master key is stored as a JWK string in the environment variable.
export const getMasterKeyForApi = async (): Promise<CryptoKey | null> => {
  const masterKeyEnvValue = getMasterKeyEnv(); // Get from env var
  if (!masterKeyEnvValue) {
    console.error('Master encryption key not found in environment variables.');
    return null;
  }

  try {
    const jwkKey = JSON.parse(masterKeyEnvValue);
    // Import the key. Note: The key must be extractable and suitable for AES-GCM.
    // This assumes the master key itself was generated and exported as JWK.
    // For simplicity, we'll assume it's directly importable.
    // In a real scenario, you might need to handle key derivation for the master key itself.
    return importKey(jwkKey);
  } catch (error) {
    console.error('Failed to import master key:', error);
    return null;
  }
};
