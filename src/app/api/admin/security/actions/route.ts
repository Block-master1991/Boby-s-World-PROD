import type { AdminRequest } from "@/lib/admin-middleware";
import { withSignedAdminAuth } from "@/lib/admin-middleware";
import { withCsrfProtection } from "@/lib/csrf-middleware";
import { blockIp, unblockIp } from "@/lib/ip-list";
import redis from "@/lib/redis";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

export const POST = withSignedAdminAuth(
  withCsrfProtection(async (request: AdminRequest) => {
    try {
      const body = await request.json();
      const { action, ip, reason, enabled } = body;

      if (!action) {
        return NextResponse.json({ error: "Missing action" }, { status: 400 });
      }

      // ── Unblock IP ──────────────────────────────────────────────────────────
      if (action === "unblock_ip") {
        if (!ip) return NextResponse.json({ error: "Missing IP" }, { status: 400 });

        await unblockIp(ip);

        // Also clear all rate-limit tracking keys so the IP starts fresh
        if (redis) {
          await Promise.allSettled([
            redis.del(`sliding:${ip}:login-attempt`),
            redis.del(`burst:${ip}:login-attempt`),
            redis.del(`ratelimit:patterns:${ip}`),
            redis.del(`reputation:${ip}`),
          ]);
        }

        logger.log(`[Admin] IP ${ip} fully unblocked and tracking data cleared.`);
        return NextResponse.json({ success: true, message: `IP ${ip} unblocked and tracking reset` });
      }

      // ── Manual permanent block (admin-initiated) ────────────────────────────
      if (action === "manual_block_ip") {
        if (!ip) return NextResponse.json({ error: "Missing IP" }, { status: 400 });

        await blockIp(ip, reason ?? "Manual admin block", true /* permanent */);

        return NextResponse.json({ success: true, message: `IP ${ip} permanently blocked` });
      }

      // ── Panic Mode ──────────────────────────────────────────────────────────
      if (action === "toggle_panic_mode") {
        if (typeof enabled !== "boolean")
          return NextResponse.json({ error: "Missing enabled flag" }, { status: 400 });

        if (redis) {
          if (enabled) {
            await redis.set("security:panic_mode", "1");
          } else {
            await redis.del("security:panic_mode");
          }
          return NextResponse.json({ success: true, panicMode: enabled });
        }
        return NextResponse.json({ error: "Redis unavailable for Panic Mode" }, { status: 503 });
      }

      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
      logger.error("Security Action Failed:", error as Error);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
  })
);
