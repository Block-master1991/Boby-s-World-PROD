import { validateTokenFromRequest, type AuthenticatedRequest } from "@/lib/auth-middleware";
import type { JWTPayload } from "@/lib/jwt-utils";
import { logger } from "@/utils/logger";
import type { NextRequest } from "next/server";
import { createPlayerLoader } from "../loaders/player.loader";
import { pubsub } from "../pubsub";

interface GameJWTPayload extends JWTPayload {
  role?: string;
}

export interface GraphQLContext {
  request: NextRequest;
  user: { id: string; publicKey: string } | null;
  role: string | null;
  loaders: {
    player: ReturnType<typeof createPlayerLoader>;
  };
  pubsub: typeof pubsub;
}

export const buildContext = async ({
  request,
}: {
  request: NextRequest;
}): Promise<GraphQLContext> => {
  const loaders = {
    player: createPlayerLoader(),
  };

  try {
    // 1. Prefer the pre-validated user from the withAuth middleware (if available)
    // withAuth attaches payload to request as (request as AuthenticatedRequest).user
    const middlewareUser = (request as unknown as AuthenticatedRequest).user;

    if (middlewareUser?.sub) {
      const role = (middlewareUser as GameJWTPayload).role || "player";
      return {
        request,
        user: { id: middlewareUser.sub, publicKey: middlewareUser.sub },
        role,
        loaders,
        pubsub,
      };
    }

    // 2. Fallback to manual validation for non-withAuth wrapped routes (like GET)
    const userPayload = await validateTokenFromRequest(request);

    if (userPayload?.sub) {
      // Use type assertion with interface instead of 'any'
      const role = (userPayload as GameJWTPayload).role || "player";
      return {
        request,
        user: { id: userPayload.sub, publicKey: userPayload.sub },
        role,
        loaders,
        pubsub,
      };
    }
  } catch (error) {
    logger.error("[GraphQL Context] Auth error:", error);
  }

  return {
    request,
    user: null,
    role: null,
    loaders,
    pubsub,
  };
};
