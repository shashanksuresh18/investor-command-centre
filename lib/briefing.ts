import { randomUUID } from "crypto";
import db from "./db";
import { synthesiseWithSonnet } from "./llm";
import {
  BRIEFING_SYSTEM_PROMPT,
  buildBriefingUserPrompt,
  type PortfolioSnapshot,
} from "./prompts/briefing";
import { getCash, getPositions } from "./trading212";
import type { Item } from "./schema";

type ItemRow = Omit<Item, "classified" | "action_required"> & {
  classified: number;
  action_required: number | null;
};

export interface BriefingResult {
  content: string;
  top_item_ids: string[];
  cost_usd: number;
}

function toItem(row: ItemRow): Item {
  return {
    ...row,
    classified: Boolean(row.classified),
    action_required:
      row.action_required == null ? null : Boolean(row.action_required),
  };
}

function getBriefingCostSince(createdAt: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(cost_usd), 0) as cost FROM llm_calls WHERE purpose = ? AND created_at >= ?"
    )
    .get("briefing", createdAt) as { cost: number };
  return row.cost;
}

export async function generateBriefing(): Promise<BriefingResult> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT * FROM items
       WHERE timestamp >= ? AND priority_score IS NOT NULL
       ORDER BY priority_score DESC
       LIMIT 10`
    )
    .all(since) as ItemRow[];
  const items = rows.map(toItem);

  const [cash, positions] = await Promise.all([getCash(), getPositions()]);
  const topMovers = positions
    .map((position) => ({
      ticker: position.ticker,
      pctMove:
        position.averagePrice === 0
          ? 0
          : (position.currentPrice - position.averagePrice) / position.averagePrice,
      ppl: position.ppl,
    }))
    .filter((mover) => Math.abs(mover.pctMove) > 0.02)
    .sort((a, b) => Math.abs(b.ppl) - Math.abs(a.ppl))
    .slice(0, 3)
    .map(({ ticker, pctMove }) => ({ ticker, pctMove }));

  const portfolio: PortfolioSnapshot = {
    cash: cash.free,
    totalValue: cash.total,
    topMovers,
  };
  const today = new Date().toISOString().slice(0, 10);
  const callStartedAt = new Date().toISOString();
  const content = await synthesiseWithSonnet(
    BRIEFING_SYSTEM_PROMPT,
    buildBriefingUserPrompt(items, portfolio, today),
    "briefing"
  );
  const cost_usd = getBriefingCostSince(callStartedAt);
  const top_item_ids = items.map((item) => item.id);

  db.prepare(`
    INSERT INTO briefings (id, date, content, top_item_ids_json, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      content = excluded.content,
      top_item_ids_json = excluded.top_item_ids_json
  `).run(
    randomUUID(),
    today,
    content,
    JSON.stringify(top_item_ids),
    new Date().toISOString()
  );

  return { content, top_item_ids, cost_usd };
}
