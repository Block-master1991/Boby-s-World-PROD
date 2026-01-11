
import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

// Mock TextEncoder/TextDecoder for JSDOM
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock Crypto for JSDOM
if (typeof global.crypto === 'undefined') {
    global.crypto = {
        randomUUID: () => '00000000-0000-0000-0000-000000000000',
        getRandomValues: (arr: any) => {
            for (let i = 0; i < arr.length; i++) {
                arr[i] = Math.floor(Math.random() * 256);
            }
            return arr;
        },
        subtle: {
            digest: async () => new Uint8Array(32).buffer as ArrayBuffer,
            importKey: async () => ({
                type: 'secret',
                extractable: true,
                algorithm: { name: 'AES-GCM' },
                usages: ['encrypt', 'decrypt']
            } as CryptoKey),
            sign: async () => new Uint8Array(64).buffer as ArrayBuffer,
            verify: async () => true,
            encrypt: async () => new Uint8Array(64).buffer as ArrayBuffer,
            decrypt: async () => new Uint8Array(64).buffer as ArrayBuffer,
            // Add missing methods to satisfy SubtleCrypto interface
            deriveBits: async () => new Uint8Array(32).buffer as ArrayBuffer,
            deriveKey: async () => ({
                type: 'secret',
                extractable: true,
                algorithm: { name: 'AES-GCM' },
                usages: ['encrypt', 'decrypt']
            } as CryptoKey),
            exportKey: async () => new Uint8Array(32).buffer as ArrayBuffer, // or JsonWebKey
            generateKey: async () => ({
                type: 'secret',
                extractable: true,
                algorithm: { name: 'AES-GCM' },
                usages: ['encrypt', 'decrypt']
            } as CryptoKey),
            unwrapKey: async () => ({
                type: 'secret',
                extractable: true,
                algorithm: { name: 'AES-GCM' },
                usages: ['encrypt', 'decrypt']
            } as CryptoKey),
            wrapKey: async () => new Uint8Array(32).buffer as ArrayBuffer,
        } as unknown as SubtleCrypto
    }
}
