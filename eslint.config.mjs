import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  js.configs.recommended,
  prettierConfig,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "dist/**",
      "build/**",
      "**/*.min.js",
      "**/*.spec.ts",
      "**/*.test.ts",
      "coverage/**",
      ".next",
      "docs/src/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
        ...globals.worker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      // Enhanced error detection
      "no-unused-vars": "warn",
      "no-console": "warn",
      "no-undef": "error",
      "no-debugger": "error",
      "no-alert": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-sequences": "error",
      "no-throw-literal": "error",
      "no-unmodified-loop-condition": "error",
      "no-unsafe-negation": "error",
      "no-unused-expressions": "error",
      "no-useless-call": "error",
      "no-useless-concat": "error",
      "no-useless-return": "error",
      "no-void": "error",
      "prefer-promise-reject-errors": "error",
      "require-await": "error",
      "no-await-in-loop": "warn",

      // Code quality
      "complexity": ["error", 15],
      "max-depth": ["error", 4],
      "max-lines": ["warn", 300],
      "max-lines-per-function": ["warn", 70],
      "max-nested-callbacks": ["error", 3],
      "max-params": ["warn", 4],

      // Security rules are already defined above

      // Best practices
      "eqeqeq": ["error", "always"],
      "no-else-return": "error",
      "no-lone-blocks": "error",
      "no-loop-func": "error",
      "no-multi-assign": "error",
      "no-new-object": "error",
      "no-param-reassign": "error",
      "no-return-assign": "error",
      "no-return-await": "error",
      "no-self-compare": "error",
      "no-unneeded-ternary": "error",
      "no-useless-computed-key": "error",
      "prefer-arrow-callback": "error",
      "prefer-const": "error",
      "prefer-destructuring": "error",
      "prefer-numeric-literals": "error",
      "prefer-rest-params": "error",
      "prefer-spread": "error",
      "prefer-template": "error",
      "require-yield": "error",
    },
  },
  {
    // Legitimate console usage exceptions
    files: [
      "scripts/**/*.{js,ts}",
      "src/utils/logger.ts",
      "src/lib/logging/transport/ConsoleTransport.ts",
      "src/lib/logging/core/LoggerCore.ts",
      "*.config.{js,ts,mjs}",
      "jest.config.ts",
      "jest.setup.ts"
    ],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-undef": "off",
      ...tsPlugin.configs.recommended.rules,

      // Basic TypeScript rules (type-checking rules removed for compatibility)
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // React specific rules
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      // React hooks
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
