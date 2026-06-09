/**
 * WebAuthn Delete Passkey Route
 * DELETE /api/auth/webauthn/manage/[credentialId]
 */

import type { AuthenticatedRequest } from "@/lib/auth-middleware";
import { withAuth } from "@/lib/auth-middleware";
import { withCsrfProtection } from "@/lib/csrf/csrf-middleware";
import { initializeAdminApp } from "@/lib/firebase-admin";
import { securityIntegration } from "@/lib/securityIntegration";
import { WebAuthnService } from "@/lib/webauthn-service";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

export const DELETE = withAuth(
  withCsrfProtection(
    async (
      request: AuthenticatedRequest,
      context: { params: Promise<{ credentialId: string }> }
    ) => {
      await initializeAdminApp();
      try {
        const userId = request.user.sub;
        const { credentialId } = await context.params;

        if (!userId) {
          return NextResponse.json({ error: "Authenticated UserID required" }, { status: 401 });
        }

        if (!credentialId) {
          return NextResponse.json({ error: "Credential ID is required" }, { status: 400 });
        }

        const result = await WebAuthnService.removePasskey(
          userId,
          credentialId,
          securityIntegration.extractDeviceInfo(request) as unknown as Record<string, unknown>
        );

        return NextResponse.json(result);
      } catch (error) {
        logger.error(
          "[WebAuthn Manage DELETE] Error:",
          error instanceof Error ? error.message : String(error)
        );

        const isClientError =
          error instanceof Error &&
          (error.message.includes("last passkey") || error.message.includes("not found"));

        return NextResponse.json(
          {
            error: error instanceof Error ? error.message : "Internal Server Error",
          },
          { status: isClientError ? 400 : 500 }
        );
      }
    }
  )
);
