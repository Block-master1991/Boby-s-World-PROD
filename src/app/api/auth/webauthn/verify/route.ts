/**
 * WebAuthn Verify (Login) Route
 * POST /api/auth/webauthn/verify
 */

import { sessionManager } from "@/lib/advancedSessionManager";
import { auditLogger } from "@/lib/audit-logger";
import { setCsrfTokenResponse } from "@/lib/csrf/csrf-helper";
import { db, initializeAdminApp } from "@/lib/firebase/firebase-admin";
import redis from "@/lib/redis";
import { getClientIp } from "@/lib/request-utils";
import { securityIntegration } from "@/lib/security/securityIntegration";
import { TOTPService } from "@/lib/totp-service";
import { validateRequestBody, WebAuthnVerifySchema } from "@/lib/validation-schemas";
import { logger } from "@/utils/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  bindSessionToCookies,
  getWebAuthnChallengeKey,
  issueTokensAndCookies,
  resolveUserFromDiscovery,
  verifyPasskeySignature,
} from "./verifyHelpers";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ResolvedIdentity {
  fuid: string;
  cid: string;
  challenge: string;
  ckey: string;
}

interface VerifyCredentialParams {
  fuid: string;
  cid: string;
  challenge: string;
  ip: string;
  origin: string;
  cresp: unknown;
}

interface SessionCleanupParams {
  fuid: string;
  cid: string;
  ckey: string;
  challenge: string;
}

// ─── Helper: resolve challenge and user identity ─────────────────────────────
async function resolveIdentity(
  userId: string | undefined,
  credentialResponse: { discoveryId?: string | undefined; id: string }
): Promise<ResolvedIdentity | NextResponse> {
  const { discoveryId, id: cid } = credentialResponse;
  let fuid = userId ?? "";

  const ckey = getWebAuthnChallengeKey(fuid, discoveryId);
  const challenge = await redis.get(ckey);
  if (!challenge)
    return NextResponse.json({ error: "Authentication session expired" }, { status: 400 });

  if (!fuid) {
    const resolved = await resolveUserFromDiscovery(cid);
    if (!resolved)
      return NextResponse.json({ error: "Biometric device not recognized" }, { status: 403 });
    fuid = resolved;
  }

  return { fuid, cid, challenge, ckey };
}

// ─── Helper: load and verify the passkey credential ──────────────────────────
async function loadAndVerifyCredential(
  params: VerifyCredentialParams
): Promise<true | NextResponse> {
  const { fuid, cid, challenge, ip, origin, cresp } = params;

  await initializeAdminApp();
  const doc = await db.collection("players").doc(fuid).collection("passkeys").doc(cid).get();

  if (!doc.exists) {
    await auditLogger.logPasskeyLoginFailure(
      { userId: fuid, ipAddress: ip },
      "Credential not recognized"
    );
    return NextResponse.json({ error: "Device not recognized" }, { status: 403 });
  }

  const isOk = await verifyPasskeySignature({
    credentialData: doc.data()!,
    credentialId: cid,
    response: cresp,
    storedChallenge: challenge,
    origin,
    userId: fuid,
  });

  if (!isOk) {
    await auditLogger.logPasskeyLoginFailure(
      { userId: fuid, ipAddress: ip },
      "Invalid biometric signature"
    );
    return NextResponse.json({ error: "Verification failed" }, { status: 401 });
  }

  return true;
}

// ─── Helper: issue tokens, session, and clean up challenge ───────────────────
async function issueSessionAndCleanup(
  request: NextRequest,
  params: SessionCleanupParams
): Promise<NextResponse> {
  const { fuid, cid, ckey, challenge } = params;
  const rhost = request.headers.get("host") || "";
  const userAgent = request.headers.get("user-agent") || "unknown";
  const ip = getClientIp(request);
  const resp = NextResponse.json({ success: true, message: "Login successful", publicKey: fuid });

  const totpEnabled = await TOTPService.isTOTPEnabled(fuid);
  issueTokensAndCookies({
    publicKey: fuid,
    requestHost: rhost,
    response: resp,
    ip,
    userAgent,
    nonce: challenge, // Use the verified challenge as the session nonce
    totpEnabled,
  });

  const sess = await sessionManager.createSecureSession(
    fuid,
    securityIntegration.extractDeviceInfo(request),
    { authMethod: "biometric", credentialId: cid }
  );
  if (sess)
    bindSessionToCookies({
      sessionId: sess.sessionId,
      currentSeed: sess.currentSeed,
      requestHost: rhost,
      response: resp,
    });

  await redis.del(ckey);
  return setCsrfTokenResponse(resp, fuid, rhost);
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { userId, credentialResponse } = await validateRequestBody(request, WebAuthnVerifySchema);
    const ip = getClientIp(request);

    const identity = await resolveIdentity(userId, credentialResponse);
    if (identity instanceof NextResponse) return identity;

    const { fuid, cid, challenge, ckey } = identity;
    const { response: cresp } = credentialResponse;
    const origin = request.headers.get("origin") || "";

    const verifyResult = await loadAndVerifyCredential({ fuid, cid, challenge, ip, origin, cresp });
    if (verifyResult instanceof NextResponse) return verifyResult;

    return await issueSessionAndCleanup(request, { fuid, cid, ckey, challenge });
  } catch (error) {
    logger.error(
      "[WebAuthn Verify] Error:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
