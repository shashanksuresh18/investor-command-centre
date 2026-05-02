import { randomUUID } from "crypto";
import db from "./db";
import { synthesiseWithSonnet } from "./llm";
import {
  BRIEFING_SYSTEM_PROMPT,
  buildBriefingUserPrompt,
  type PortfolioSnapshot,
} from "./prompts/briefing";
import { fetchTodaysEvents } from "./calendar";
import { getCash, getPositions } from "./trading212";
import type { Item } from "./schema";
import type { TaskSummary } from "./dashboard-queries";
import type { CalendarEvent } from "./calendar";

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

function getTodaysTasks(): TaskSummary[] {
  const taskRows = db.prepare(`
    SELECT id, title, body FROM items
    WHERE source = 'notion' AND seed = 0
    ORDER BY urgency DESC, timestamp ASC LIMIT 5
  `).all() as { id: string; title: string; body: string }[];

  return taskRows.map((row) => {
    try {
      const parsed = JSON.parse(row.body) as Record<string, unknown>;
      return {
        id: row.id,
        title: row.title,
        status: (parsed.status as string) ?? "Unknown",
        due_date: (parsed.due_date as string | null) ?? null,
        priority: (parsed.priority as string | null) ?? null,
      };
    } catch {
      return {
        id: row.id,
        title: row.title,
        status: "Unknown",
        due_date: null,
        priority: null,
      };
    }
  });
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
      ticker: position.instrument.ticker,
      pctMove:
        position.averagePricePaid === 0
          ? 0
          : (position.currentPrice - position.averagePricePaid) / position.averagePricePaid,
      ppl: position.walletImpact.unrealizedProfitLoss,
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
  const tasks = getTodaysTasks();
  let calendarEvents: CalendarEvent[] = [];
  if (process.env.CALENDAR_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN) {
    try {
      calendarEvents = await fetchTodaysEvents();
    } catch (error) {
      console.error("Calendar fetch failed (non-fatal):", error);
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const callStartedAt = new Date().toISOString();
  const content = await synthesiseWithSonnet(
    BRIEFING_SYSTEM_PROMPT,
    buildBriefingUserPrompt(items, portfolio, today, tasks, calendarEvents),
    "briefing"
  );
  const cost_usd = getBriefingCostSince(callStartedAt);
  const top_item_ids = items.map((item) => item.id);

  db.prepare(`
    INSERT INTO briefings (id, date, content, top_item_ids_json, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      content = excluded.content,
      top_item_ids_json = excluded.top_item_ids_json,
      created_at = excluded.created_at
  `).run(
    randomUUID(),
    today,
    content,
    JSON.stringify(top_item_ids),
    new Date().toISOString()
  );

  return { content, top_item_ids, cost_usd };
}
