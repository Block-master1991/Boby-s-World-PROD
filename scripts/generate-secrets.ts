#!/usr/bin/env ts-node
/**
 * Generate cryptographically secure secrets for the application.
 * Run: npm run generate-secrets
 * Copy the output to your .env file.
 */
import { randomBytes } from "crypto";

console.log("# ============================================");
console.log("# Boby's World - Generated Secrets");
console.log("# Copy these to your .env file");
console.log("# ============================================");
console.log("");
console.log("# Security: Generated with: npm run generate-secrets");
console.log("# Minimum 64 characters each (128 hex chars = 64 bytes)");
console.log(`JWT_ACCESS_SECRET=${randomBytes(64).toString("hex")}`);
console.log(`JWT_REFRESH_SECRET=${randomBytes(64).toString("hex")}`);
console.log(`MASTER_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`);
console.log(`LOG_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`);
console.log(`LOG_SIGNING_SECRET=${randomBytes(32).toString("hex")}`);
console.log(`CRON_SECRET=${randomBytes(24).toString("hex")}`);
console.log(`ADMIN_TOKEN=${randomBytes(24).toString("hex")}`);
