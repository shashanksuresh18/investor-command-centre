import { existsSync, readFileSync } from "fs";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;

  const lines = readFileSync(".env.local", "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) continue;

    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();

  const { syncPortfolioToItems } = await import("../lib/trading212");
  const { syncEmailsToItems } = await import("../lib/gmail");
  const { syncTasksToItems } = await import("../lib/notion");
  const { syncDiscordToItems } = await import("../lib/discord");
  const { classifyUnprocessed } = await import("../lib/classifier");
  const { generateBriefing } = await import("../lib/briefing");

  console.log("[1/3] Syncing data sources...");
  const portfolio = await syncPortfolioToItems();
  const emails = await syncEmailsToItems();
  const notion =
    process.env.NOTION_API_KEY && process.env.NOTION_TASKS_DATABASE_ID
      ? await syncTasksToItems()
      : { upserted: 0 };
  const discord =
    process.env.DISCORD_BOT_TOKEN &&
    (process.env.DISCORD_GUILD_IDS || process.env.DISCORD_CHANNEL_IDS)
      ? await syncDiscordToItems()
      : { upserted: 0 };
  console.log(`  Portfolio items upserted: ${portfolio.upserted}`);
  console.log(`  Email items upserted: ${emails.upserted}`);
  console.log(`  Notion task items upserted: ${notion.upserted}`);
  console.log(`  Discord items upserted: ${discord.upserted}`);

  console.log("[2/3] Classifying items...");
  const classifications = await classifyUnprocessed();
  console.log(
    `  Processed: ${classifications.processed} items   Cost: $${classifications.cost_usd.toFixed(4)}`
  );

  console.log("[3/3] Generating briefing with calendar context...");
  const briefing = await generateBriefing();
  console.log(`  Cost: $${briefing.cost_usd.toFixed(4)}`);
  console.log("");
  console.log("### TOP ITEMS ###");
  console.log(briefing.top_item_ids.join("\n"));

  if (process.env.SEND_WHATSAPP === "true") {
    const { sendBriefing } = await import("../lib/whatsapp");
    const result = await sendBriefing(briefing.content);
    if (result.success) {
      console.log(`[whatsapp] Sent. SID: ${result.messageSid}`);
    } else {
      console.error(`[whatsapp] Send failed: ${result.error}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
