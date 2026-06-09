import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { sendSlackAlert } from "../src/lib/logging/slack-alert";

async function runTest() {
  console.log("🚀 Triggering Professional Slack Alert Test...");

  const result = await sendSlackAlert(
    "This is a *CRITICAL* verification alert from the security system update. If you see this, the new professional formatting and attachments are working correctly.",
    {
      level: "critical",
      title: "ALERT SYSTEM VERIFICATION",
      metadata: {
        System: "Boby's World Security",
        Action: "Manual Test",
        Status: "Debugging",
      },
      force: true, // Bypass rate limiting for this test
    }
  );

  if (result) {
    console.log("✅ sendSlackAlert returned TRUE");
    console.log("Please check your Slack Desktop / Mobile app.");
  } else {
    console.error(
      "❌ sendSlackAlert returned FALSE. Check if SLACK_WEBHOOK_URL is set in .env.local"
    );
  }
}

runTest().catch(console.error);
