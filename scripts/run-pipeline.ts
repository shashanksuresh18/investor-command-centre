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
  const { classifyUnprocessed } = await import("../lib/classifier");
  const { generateBriefing } = await import("../lib/briefing");

  console.log("[1/3] Syncing data sources...");
  const portfolio = await syncPortfolioToItems();
  const emails = await syncEmailsToItems();
  console.log(`  Portfolio items upserted: ${portfolio.upserted}`);
  console.log(`  Email items upserted: ${emails.upserted}`);

  console.log("[2/3] Classifying items...");
  const classifications = await classifyUnprocessed();
  console.log(
    `  Processed: ${classifications.processed} items   Cost: $${classifications.cost_usd.toFixed(4)}`
  );

  console.log("[3/3] Generating briefing...");
  const briefing = await generateBriefing();
  console.log(`  Cost: $${briefing.cost_usd.toFixed(4)}`);
  console.log("");
  console.log("### MORNING BRIEFING ###");
  console.log(briefing.content);
  console.log("### TOP ITEMS ###");
  console.log(briefing.top_item_ids.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
