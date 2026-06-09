import type { AdminRequest } from "@/lib/admin-middleware";
import { withAdminAuth, withSignedAdminAuth } from "@/lib/admin-middleware";
import { setCsrfTokenResponse } from "@/lib/csrf/csrf-helper";
import { withCsrfProtection } from "@/lib/csrf/csrf-middleware";
import { createStoreItem, getAllStoreItems } from "@/lib/server-items";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

export const GET = withAdminAuth(async () => {
  try {
    const items = await getAllStoreItems();
    return NextResponse.json({ success: true, items, count: items.length });
  } catch (error) {
    logger.error(
      "Error fetching store items:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch store items",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});

interface CreateItemBody {
  id?: string;
  name?: string;
  description?: string;
  price?: number;
  image?: string;
  dataAiHint?: string;
  type?: string;
  rarity?: string;
}

function validateRequiredFields(body: CreateItemBody) {
  const requiredFields = ["name", "description", "image"] as const;
  for (const field of requiredFields) {
    if (!body[field]) return field;
  }
  return null;
}

async function processCreateItem(
  body: CreateItemBody,
  request: AdminRequest
): Promise<NextResponse> {
  const input = {
    name: body.name!,
    description: body.description!,
    price: body.price || 0,
    image: body.image!,
    dataAiHint: body.dataAiHint || "",
    type: (body.type as "consumable" | "permanent") || "consumable",
    rarity: (body.rarity as "common" | "rare" | "epic" | "legendary") || "common",
    ...(body.id ? { id: body.id } : {}),
  };
  const newItem = await createStoreItem(input);
  const response = NextResponse.json({
    success: true,
    message: "Item created successfully",
    item: newItem,
  });
  return setCsrfTokenResponse(response, request.user.sub, request.headers.get("host") || undefined);
}

export const POST = withSignedAdminAuth(
  withCsrfProtection(async (request: AdminRequest) => {
    try {
      const body = (await request.json()) as CreateItemBody;
      const missingField = validateRequiredFields(body);
      if (missingField)
        return NextResponse.json(
          { success: false, error: `Missing required field: ${missingField}` },
          { status: 400 }
        );

      return await processCreateItem(body, request);
    } catch (error) {
      logger.error(
        "Error creating store item:",
        error instanceof Error ? error.message : String(error)
      );
      const isDuplicate = error instanceof Error && error.message.includes("already exists");
      return NextResponse.json(
        {
          success: false,
          error: isDuplicate
            ? "An item with this ID already exists"
            : "Failed to create store item",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: isDuplicate ? 409 : 500 }
      );
    }
  })
);
