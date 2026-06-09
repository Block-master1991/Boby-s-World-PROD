/**
 * Authentication Validation Helpers
 * Verification and validation functions for request tokens and sessions
 */

import { getClientIp } from "@/lib/request-utils";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { logger } from "utils/logger";
import { extractAuthRequestMetadata } from "./auth-helpers";
import { JWTManager, type JWTPayload } from "./jwt-utils";
import { securityIntegration } from "./security/securityIntegration";

export async function verifySessionOrReject(
  request: Request
): Promise<{ user: { publicKey: string } }> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken")?.value;

  if (!accessToken) {
    throw new Error("Missing access token");
  }

  // Read fingerprint information
  const ip = getClientIp(request);
  const userAgent = (await headers()).get("user-agent") || "unknown";

  const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
  if (!payload || !payload.sub) {
    throw new Error("Invalid or expired access token");
  }

  // === Advanced Session Validation ===
  const secureSessionId = cookieStore.get("secure_session")?.value;
  if (secureSessionId) {
    const sessionValidation = await securityIntegration.validateSession(secureSessionId, request);
    if (!sessionValidation.valid) {
      logger.warn(
        `[AuthMiddleware] Stateful session validation failed: ${sessionValidation.error}`
      );
      throw new Error(
        "Your session has been expired or revoked for security reasons. Please login again."
      );
    }
  }

  return { user: { publicKey: payload.sub } };
}

export async function extractUserFromToken(request: NextRequest): Promise<JWTPayload | null> {
  logger.log("[extractUserFromToken] Attempting to extract user from token.");
  try {
    const { accessToken, userAgent, ip } = extractAuthRequestMetadata(request);

    logger.log(
      "[extractUserFromToken] AccessToken from cookies:",
      accessToken ? "Found" : "Not Found"
    );
    if (!accessToken) return null;

    const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
    logger.log("[extractUserFromToken] Verified payload:", payload);
    return payload;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    logger.error("[extractUserFromToken] Error during extraction:", errorMessage);
    return null;
  }
}

export async function validateTokenFromRequest(request: Request): Promise<JWTPayload | null> {
  logger.log("[validateTokenFromRequest] Starting token validation from request.");
  try {
    const { userAgent, ip, cookieHeader } = extractAuthRequestMetadata(request);

    logger.log(
      "[validateTokenFromRequest] Cookie header:",
      cookieHeader ? `"${cookieHeader.substring(0, 100)}..."` : "Not found"
    );

    if (!cookieHeader) {
      logger.warn("[validateTokenFromRequest] No cookie header found in the request.");
      return null;
    }

    const accessToken = JWTManager.extractTokenFromCookies(cookieHeader, "accessToken");
    logger.log(
      "[validateTokenFromRequest] Extracted accessToken from cookie header:",
      accessToken ? `"${accessToken.substring(0, 20)}..."` : "Not found"
    );

    if (!accessToken) {
      logger.warn("[validateTokenFromRequest] Access token not found in extracted cookies.");
      return null;
    }

    logger.log(
      "[validateTokenFromRequest] Attempting to verify accessToken:",
      `${accessToken.substring(0, 20)}...`
    );
    const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);

    if (payload) {
      logger.log(
        "[validateTokenFromRequest] Access token verification successful. Payload sub:",
        payload.sub
      );
    } else {
      logger.warn(
        "[validateTokenFromRequest] Access token verification failed (returned null). Token was:",
        `${accessToken.substring(0, 20)}...`
      );
    }
    return payload;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(
      "[validateTokenFromRequest] Exception during token validation:",
      errorMessage,
      errorStack
    );
    return null;
  }
}
