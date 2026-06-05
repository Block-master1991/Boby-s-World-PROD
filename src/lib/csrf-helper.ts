import type { NextResponse } from "next/server";
import { CSRFManager } from "./csrf-utils";
import { JWTManager } from "./jwt-utils";

/**
 * Helper function to refresh CSRF token and set it in the response uniformly
 */
export async function setCsrfTokenResponse(
  response: NextResponse,
  sessionId: string,
  requestHost?: string
): Promise<NextResponse> {
  const csrfToken = await CSRFManager.getOrCreateToken(sessionId);

  response.cookies.set("csrfToken", csrfToken, {
    httpOnly: false,
    secure: JWTManager.createSecureCookieOptions(0, requestHost).secure,
    sameSite: JWTManager.createSecureCookieOptions(0, requestHost).sameSite,
    maxAge: 30 * 60, // 30 minutes
    path: "/",
  });

  return response;
}
