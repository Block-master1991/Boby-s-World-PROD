import { getClientIp } from "@/lib/request-utils";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { JWTManager } from "./jwt-utils";

export interface AuthMetadata {
  accessToken: string | null;
  refreshToken: string | null;
  userAgent: string;
  ip: string;
  cookieHeader: string | null;
}

export interface AuthErrorOptions {
  message: string;
  code: string;
  status?: number;
  details?: string;
  clearCookies?: boolean;
}

export function extractAuthRequestMetadata(request: NextRequest | Request): AuthMetadata {
  const isEdge = typeof (request as NextRequest).cookies?.get === "function";
  const cookieHeader = "headers" in request ? request.headers.get("cookie") : null;

  const accessToken = isEdge
    ? ((request as NextRequest).cookies.get("accessToken")?.value ?? null)
    : cookieHeader
      ? JWTManager.extractTokenFromCookies(cookieHeader, "accessToken")
      : null;

  const refreshToken = isEdge
    ? ((request as NextRequest).cookies.get("refreshToken")?.value ?? null)
    : cookieHeader
      ? JWTManager.extractTokenFromCookies(cookieHeader, "refreshToken")
      : null;

  const userAgent = request.headers.get("user-agent") || "unknown";
  const ip = getClientIp(request);

  return { accessToken, refreshToken, userAgent, ip, cookieHeader: cookieHeader ?? null };
}

export function createAuthErrorResponse(options: AuthErrorOptions) {
  const { message, code, status = 401, details, clearCookies = false } = options;
  const response = NextResponse.json(
    {
      authenticated: false,
      error: message,
      code,
      details,
    },
    { status }
  );

  if (clearCookies) {
    const securityCookies = [
      "accessToken",
      "refreshToken",
      "nonce",
      "csrfToken",
      "secure_session",
      "session_seed",
    ];
    securityCookies.forEach(name => {
      response.cookies.delete(name);
    });
  }

  return response;
}
