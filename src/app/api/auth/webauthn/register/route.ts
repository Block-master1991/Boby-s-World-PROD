/**
 * WebAuthn Registration Initiation Route
 * POST /api/auth/webauthn/register
 */

import type { AuthenticatedRequest } from "@/lib/auth-middleware";
import { withAuth } from "@/lib/auth-middleware";
import { withCsrfProtection } from "@/lib/csrf/csrf-middleware";
import { securityIntegration } from "@/lib/security/securityIntegration";
import { validateRequestBody, WebAuthnRegisterSchema } from "@/lib/validation-schemas";
import { WebAuthnService } from "@/lib/webauthn-service";
import { WebAuthnUtils } from "@/lib/webauthn-utils";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

export const POST = withAuth(
  withCsrfProtection(async (request: AuthenticatedRequest) => {
    try {
      const { userId, userName } = await validateRequestBody(request, WebAuthnRegisterSchema);

      const host = request.headers.get("host") || "localhost";
      const rpId = WebAuthnUtils.getRPID(host);

      const options = await WebAuthnService.initiateRegistration(
        userId,
        userName,
        rpId,
        securityIntegration.extractDeviceInfo(request) as unknown as Record<string, unknown>
      );

      return NextResponse.json(options);
    } catch (error) {
      logger.error(
        "[WebAuthn Register] Error:",
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
