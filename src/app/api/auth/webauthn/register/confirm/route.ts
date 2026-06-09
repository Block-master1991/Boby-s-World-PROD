/**
 * WebAuthn Registration Confirmation Route
 * POST /api/auth/webauthn/register/confirm
 */

import type { AuthenticatedRequest } from "@/lib/auth/auth-middleware";
import { withAuth } from "@/lib/auth/auth-middleware";
import { setCsrfTokenResponse } from "@/lib/csrf/csrf-helper";
import { withCsrfProtection } from "@/lib/csrf/csrf-middleware";
import { db, initializeAdminApp } from "@/lib/firebase/firebase-admin";
import redis from "@/lib/redis";
import { validateRequestBody, WebAuthnConfirmSchema } from "@/lib/validation-schemas";
import { WebAuthnService } from "@/lib/webauthn/webauthn-service";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

export const POST = withAuth(
  withCsrfProtection(async (request: AuthenticatedRequest) => {
    try {
      const { credential, description, transports } = await validateRequestBody(
        request,
        WebAuthnConfirmSchema
      );
      const userId = request.user.sub;

      if (!userId)
        return NextResponse.json({ error: "Authenticated UserID required" }, { status: 401 });

      const key = WebAuthnService.getChallengeKey("registration", userId);
      const storedChallenge = await redis.get(key);
      if (!storedChallenge)
        return NextResponse.json({ error: "Registration session expired" }, { status: 400 });

      await initializeAdminApp();
      const existingPasskey = await db
        .collection("players")
        .doc(userId)
        .collection("passkeys")
        .doc(credential.id)
        .get();
      if (existingPasskey.exists)
        return NextResponse.json({ error: "Passkey already registered" }, { status: 409 });

      await WebAuthnService.completeRegistration(userId, credential, description, transports);

      const response = NextResponse.json({
        success: true,
        message: "Passkey registered successfully",
      });
      const requestHost = request.headers.get("host") || undefined;

      return await setCsrfTokenResponse(response, userId, requestHost);
    } catch (error) {
      logger.error(
        "[WebAuthn Confirm] Error:",
        error instanceof Error ? error.message : String(error)
      );
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Internal Server Error",
        },
        { status: error instanceof Error && error.message.includes("Validation") ? 400 : 500 }
      );
    }
  })
);
