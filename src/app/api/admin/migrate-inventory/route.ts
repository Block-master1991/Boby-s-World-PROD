import type { AdminRequest } from "@/lib/admin-middleware";
import { withAdminAuth, withSignedAdminAuth } from "@/lib/admin-middleware";
import { setCsrfTokenResponse } from "@/lib/csrf-helper";
import { withCsrfProtection } from "@/lib/csrf-middleware";
import { logger } from "@/utils/logger";
import { spawn, type ChildProcess } from "child_process";
import { NextResponse } from "next/server";
import path from "path";

interface MigrationResult {
  success: boolean;
  message?: string;
  error?: string;
  output?: string;
  errorOutput?: string;
  code?: number | null;
  details?: string;
}

function getMigrationEnvVars(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FIREBASE_PROJECT_ID: process.env["FIREBASE_PROJECT_ID"],
    FIREBASE_CLIENT_EMAIL: process.env["FIREBASE_CLIENT_EMAIL"],
    FIREBASE_PRIVATE_KEY: process.env["FIREBASE_PRIVATE_KEY"],
  };
}

function attachProcessListeners(
  proc: ChildProcess,
  request: AdminRequest,
  resolve: (value: NextResponse | PromiseLike<NextResponse>) => void
) {
  let output = "";
  let errorOutput = "";

  proc.stdout?.on("data", (data: Buffer) => {
    output += data.toString();
    logger.log("Migration output:", data.toString());
  });
  proc.stderr?.on("data", (data: Buffer) => {
    errorOutput += data.toString();
    logger.error("Migration error:", data.toString());
  });
  proc.on("close", async code => {
    logger.log(`Migration process exited with code ${code}`);
    if (code === 0) {
      const response = NextResponse.json({
        success: true,
        message: "Migration completed successfully",
        output,
        code,
      });
      const requestHost = request.headers.get("host") || undefined;
      resolve(await setCsrfTokenResponse(response, request.user.sub, requestHost));
    } else {
      resolve(
        NextResponse.json(
          { success: false, error: "Migration failed", output, errorOutput, code },
          { status: 500 }
        )
      );
    }
  });
  proc.on("error", (error: Error) => {
    logger.error("Failed to start migration process:", error.message);
    resolve(
      NextResponse.json(
        { success: false, error: "Failed to start migration process", details: error.message },
        { status: 500 }
      )
    );
  });
}

function runMigrationProcess(request: AdminRequest): Promise<NextResponse> {
  const scriptPath = path.join(process.cwd(), "scripts", "migrate-inventory.ts");
  return new Promise(resolve => {
    const proc = spawn("npx", ["ts-node", "-r", "dotenv/config", scriptPath], {
      stdio: ["inherit", "pipe", "pipe"],
      cwd: process.cwd(),
      env: getMigrationEnvVars(),
    });
    attachProcessListeners(proc, request, resolve);
  });
}

export const POST = withSignedAdminAuth(
  withCsrfProtection(async (request: AdminRequest) => {
    try {
      logger.log("🔄 Starting migration process from API...");
      return await runMigrationProcess(request);
    } catch (error) {
      logger.error(
        "Error in migration API:",
        error instanceof Error ? error.message : String(error)
      );
      return NextResponse.json(
        {
          success: false,
          error: "Internal server error",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  })
);

async function checkMigrationStatus(): Promise<MigrationResult> {
  const admin = (await import("firebase-admin")).default;
  const { initializeAdminApp } = await import("@/lib/firebase-admin");
  await initializeAdminApp();
  const db = admin.firestore();
  const migrationDoc = await db.collection("system").doc("inventory-migration-v2").get();

  if (migrationDoc.exists) {
    return {
      success: true,
      message: "Migration has run",
      output: JSON.stringify(migrationDoc.data()),
    };
  }
  return { success: true, message: "No migration has been run yet" };
}

export const GET = withAdminAuth(async () => {
  try {
    const result = await checkMigrationStatus();
    return NextResponse.json({
      success: result.success,
      hasMigrationRun: result.output !== undefined,
      migrationData: result.output ? JSON.parse(result.output) : undefined,
      message: result.message,
    });
  } catch (error) {
    logger.error(
      "Error checking migration status:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      {
        success: false,
        error: "Failed to check migration status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
