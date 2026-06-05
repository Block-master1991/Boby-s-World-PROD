import "@testing-library/jest-dom";
import { TextDecoder, TextEncoder } from "util";

// Mock TextEncoder/TextDecoder for JSDOM
global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;

// Mock Crypto for JSDOM
if (typeof global.crypto === "undefined") {
  global.crypto = {
    randomUUID: () => "00000000-0000-0000-0000-000000000000",
    getRandomValues: <T extends ArrayBufferView | null>(arr: T): T => {
      if (!arr) return arr;
      const uint8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      for (let i = 0; i < uint8.length; i++) {
        uint8[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
    subtle: {
      digest: () => Promise.resolve(new Uint8Array(32).buffer as ArrayBuffer),
      importKey: () =>
        Promise.resolve({
          type: "secret",
          extractable: true,
          algorithm: { name: "AES-GCM" },
          usages: ["encrypt", "decrypt"],
        } as CryptoKey),
      sign: () => Promise.resolve(new Uint8Array(64).buffer as ArrayBuffer),
      verify: () => Promise.resolve(true),
      encrypt: () => Promise.resolve(new Uint8Array(64).buffer as ArrayBuffer),
      decrypt: () => Promise.resolve(new Uint8Array(64).buffer as ArrayBuffer),
      // Add missing methods to satisfy SubtleCrypto interface
      deriveBits: () => Promise.resolve(new Uint8Array(32).buffer as ArrayBuffer),
      deriveKey: () =>
        Promise.resolve({
          type: "secret",
          extractable: true,
          algorithm: { name: "AES-GCM" },
          usages: ["encrypt", "decrypt"],
        } as CryptoKey),
      exportKey: () => Promise.resolve(new Uint8Array(32).buffer as ArrayBuffer), // or JsonWebKey
      generateKey: () =>
        Promise.resolve({
          type: "secret",
          extractable: true,
          algorithm: { name: "AES-GCM" },
          usages: ["encrypt", "decrypt"],
        } as CryptoKey),
      unwrapKey: () =>
        Promise.resolve({
          type: "secret",
          extractable: true,
          algorithm: { name: "AES-GCM" },
          usages: ["encrypt", "decrypt"],
        } as CryptoKey),
      wrapKey: () => Promise.resolve(new Uint8Array(32).buffer as ArrayBuffer),
    } as unknown as SubtleCrypto,
  } as Crypto;
}
