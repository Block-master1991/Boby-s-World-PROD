/** @type {import('jest').Config} */
const nextJest = require('next/jest.js')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // setupFiles runs BEFORE any module is imported — critical for patching globalThis.crypto
  // before module-level code in keyVaultService.ts calls getCrypto() at import time.
  setupFiles: ['<rootDir>/jest.setup.cjs'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Use babel-jest for TypeScript transformation (compatible with Jest 30)
  transform: {
    '^.+\\.(ts|tsx)$': ['babel-jest', {
      presets: [
        ['next/babel', {
          'preset-env': { targets: { node: 'current' } }
        }]
      ]
    }],
  },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(config)
