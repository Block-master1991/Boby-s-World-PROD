/**
 * WebAuthn Authentication (Login) Initiation Route
 * POST /api/auth/webauthn/authenticate
 */

import { validateRequestBody, WebAuthnAuthenticateSchema } from "@/lib/validation-schemas";
import { WebAuthnService } from "@/lib/webauthn/webauthn-service";
import { WebAuthnUtils } from "@/lib/webauthn/webauthn-utils";
import { logger } from "@/utils/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Initiates WebAuthn authentication.
 * Support both Discovery Mode (anonymous) and Specific User Mode.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await validateRequestBody(request, WebAuthnAuthenticateSchema);

    const host = request.headers.get("host") || "localhost";
    const rpId = WebAuthnUtils.getRPID(host);

    const options = await WebAuthnService.initiateAuthentication(rpId, userId);

    return NextResponse.json(options);
  } catch (error) {
    logger.error(
      "[WebAuthn Authenticate] Error:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: error instanceof Error && error.message.includes("Validation") ? 400 : 500 }
    );
  }
}
