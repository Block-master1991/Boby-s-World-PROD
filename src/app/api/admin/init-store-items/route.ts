import { withAdminAuth, withSignedAdminAuth } from "@/lib/admin-middleware";
import { setCsrfTokenResponse } from "@/lib/csrf/csrf-helper";
import { withCsrfProtection } from "@/lib/csrf/csrf-middleware";
import { initializeAdminApp } from "@/lib/firebase-admin";
import {
  createStoreItem,
  getAllStoreItems,
  updateStoreItem,
  type StoreItemDefinition,
} from "@/lib/server-items/server-items";
import type { StoreItemDocument } from "@/types/database";
import { logger } from "@/utils/logger";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

// Helper to map specialized definition to universal document type
function mapToDocument(item: StoreItemDefinition): StoreItemDocument {
  return {
    ...item,
    usdPrice: item.price, // Map price to usdPrice as they are semantically equivalent here
  };
}

// Initial items data
const initialItems = [
  {
    id: "1",
    name: "Protection Bottle",
    description: "Consumed instead of your coins, protecting your wealth.",
    price: 0.001,
    image: "/items/ProtectionBottle.png",
    dataAiHint: "sturdy Bottle",
    type: "consumable" as const,
    rarity: "common" as const,
    isActive: true,
  },
  {
    id: "2",
    name: "Guardian Shield",
    description: "Provides temporary protection in fights.",
    price: 0.001,
    image: "/items/guardianShield.png",
    dataAiHint: "dog shield",
    type: "consumable" as const,
    rarity: "common" as const,
    isActive: true,
  },
  {
    id: "3",
    name: "Speedy Paws",
    description: "Boosts your running speed for a short time.",
    price: 0.001,
    image: "/items/speedyPawsTreat.png",
    dataAiHint: "dog treat",
    type: "consumable" as const,
    rarity: "common" as const,
    isActive: true,
  },
  {
    id: "4",
    name: "Coin Magnet",
    description: "When active, automatically collects nearby coins for a short duration.",
    price: 0.001,
    image: "/items/coinMagnetTreat.png",
    dataAiHint: "dog magnet",
    type: "consumable" as const,
    rarity: "common" as const,
    isActive: true,
  },
];

function synchronizeIds(db: FirebaseFirestore.Firestore) {
  logger.log("🔄 Checking for ID mismatches...");

  // Using explicit promise return to avoid "async function has no await"
  return db
    .collection("storeItems")
    .get()
    .then(storeSnapshot => {
      const migrationPromises = storeSnapshot.docs.map(doc => {
        const data = doc.data() as Partial<StoreItemDocument>;
        const documentId = doc.id;
        const internalId = data.id;

        if (internalId && documentId !== internalId) {
          logger.log(
            `⚠️ ID Mismatch found: Document ID "${documentId}" != Internal ID "${internalId}"`
          );
          logger.log(`🔄 Migrating document to correct ID...`);

          // Transactional migration for safety
          return db.runTransaction(t => {
            t.set(db.collection("storeItems").doc(internalId), data);
            t.delete(db.collection("storeItems").doc(documentId));
            logger.log(`✅ Migration complete for ID "${internalId}"`);
            return Promise.resolve();
          });
        }
        return Promise.resolve();
      });

      return Promise.all(migrationPromises);
    });
}

async function processItems(existingItems: StoreItemDocument[]) {
  const existingIds = existingItems.map(item => item.id);
  const results: StoreItemDocument[] = [];
  let addedCount = 0;

  // Parallelize processing with Promise.all
  await Promise.all(
    initialItems.map(async item => {
      if (!existingIds.includes(item.id)) {
        logger.log(`➕ Adding item: ${item.name} (ID: ${item.id})`);
        const result = await createStoreItem(item);

        if (result.success && result.item) {
          results.push(mapToDocument(result.item));
          addedCount++;
          logger.log(`✅ Successfully added: ${item.name}`);
        } else {
          logger.error(`❌ Failed to add item ${item.name}: ${result.message}`);
        }
      } else {
        logger.log(`🔄 Updating existing item: ${item.name} (ID: ${item.id})`);
        const result = await updateStoreItem(item.id, {
          name: item.name,
          description: item.description,
          price: item.price,
          image: item.image,
          type: item.type,
          rarity: item.rarity,
          isActive: item.isActive,
        });

        if (result.success && result.item) {
          results.push(mapToDocument(result.item));
          logger.log(`✅ Successfully updated: ${item.name}`);
        } else {
          logger.error(`❌ Failed to update item ${item.name}: ${result.message}`);
        }
      }
    })
  );

  return { results, addedCount };
}

export const POST = withSignedAdminAuth(
  withCsrfProtection(async request => {
    try {
      await initializeAdminApp();
      const db = getFirestore();

      logger.log("🔍 Checking existing store items...");

      // 1. ID Synchronization
      await synchronizeIds(db);

      // Get existing items after synchronization
      const existingItems = await getAllStoreItems();
      // Manually map to strictly typed documents to ensure usdPrice exists
      const typedExistingItems: StoreItemDocument[] = existingItems.map(mapToDocument);

      logger.log(`📊 Found ${typedExistingItems.length} existing items`);

      // Add missing items or update existing ones
      const { results, addedCount } = await processItems(typedExistingItems);

      logger.log(`\n🎉 Initialization complete!`);
      logger.log(`📊 Added ${addedCount} new items`);
      logger.log(`📊 Total items in store: ${typedExistingItems.length + addedCount}`);

      const response = NextResponse.json({
        success: true,
        message: `Successfully initialized store items`,
        stats: {
          existingItems: typedExistingItems.length,
          addedItems: addedCount,
          totalItems: typedExistingItems.length + addedCount,
        },
        addedItems: results,
      });

      const requestHost = request.headers.get("host") || undefined;
      return await setCsrfTokenResponse(response, request.user.sub, requestHost);
    } catch (error) {
      logger.error(
        "❌ Error initializing store items:",
        error instanceof Error ? error.message : String(error)
      );
      return NextResponse.json(
        {
          success: false,
          error: "Failed to initialize store items",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  })
);

export const GET = withAdminAuth(async () => {
  try {
    const items = await getAllStoreItems();
    const typedItems = items.map(mapToDocument);

    return NextResponse.json({
      success: true,
      items: typedItems,
      count: typedItems.length,
    });
  } catch (error) {
    logger.error(
      "❌ Error fetching store items:",
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
