// jest.setup.cjs — CommonJS setup for Jest 30 + babel-jest compatibility
// This must be CJS (.cjs) because package.json has "type": "module"

const { TextDecoder, TextEncoder } = require('util');

// Mock TextEncoder/TextDecoder for JSDOM
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock Crypto for JSDOM / test environments that lack SubtleCrypto.
// CRITICAL: This runs before any module import, so module-level `getCrypto()` calls
// in keyVaultService.ts will see the correct subtle mock.
if (!global.crypto?.subtle) {
  const subtleMock = {
    digest: () => Promise.resolve(new Uint8Array(32).buffer),
    importKey: () =>
      Promise.resolve({
        type: 'secret',
        extractable: true,
        algorithm: { name: 'AES-GCM' },
        usages: ['encrypt', 'decrypt'],
      }),
    sign: () => Promise.resolve(new Uint8Array(64).buffer),
    verify: () => Promise.resolve(true),
    encrypt: (alg, key, data) => {
      const buf = ArrayBuffer.isView(data)
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        : data;
      return Promise.resolve(buf);
    },
    decrypt: (alg, key, data) => {
      const buf = ArrayBuffer.isView(data)
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        : data;
      return Promise.resolve(buf);
    },
    deriveBits: () => Promise.resolve(new Uint8Array(32).buffer),
    deriveKey: () =>
      Promise.resolve({
        type: 'secret',
        extractable: true,
        algorithm: { name: 'AES-GCM' },
        usages: ['encrypt', 'decrypt'],
      }),
    exportKey: () => Promise.resolve(new Uint8Array(32).buffer),
    generateKey: () =>
      Promise.resolve({
        type: 'secret',
        extractable: true,
        algorithm: { name: 'AES-GCM' },
        usages: ['encrypt', 'decrypt'],
      }),
    unwrapKey: () =>
      Promise.resolve({
        type: 'secret',
        extractable: true,
        algorithm: { name: 'AES-GCM' },
        usages: ['encrypt', 'decrypt'],
      }),
    wrapKey: () => Promise.resolve(new Uint8Array(32).buffer),
  };

  if (typeof global.crypto === 'undefined') {
    global.crypto = {
      randomUUID: () => '00000000-0000-0000-0000-000000000000',
      getRandomValues: (arr) => {
        if (!arr) return arr;
        const uint8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
        for (let i = 0; i < uint8.length; i++) {
          uint8[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      },
      subtle: subtleMock,
    };
  } else {
    // crypto exists but subtle is missing — patch it in
    Object.defineProperty(global.crypto, 'subtle', {
      value: subtleMock,
      configurable: true,
      writable: true,
    });
  }
}
