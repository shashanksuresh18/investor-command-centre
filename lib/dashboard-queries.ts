import db from "./db";
import type { Item } from "./schema";
import { getPortfolioSummary, type PortfolioSummary } from "./trading212";

type ItemRow = Omit<Item, "classified" | "action_required"> & {
  classified: number;
  action_required: number | null;
};

export interface PortfolioItem {
  ticker: string;
  currentPrice: number;
  averagePricePaid: number;
  pctMove: number;
  unrealizedProfitLoss: number;
  currentValue: number;
}

export interface TodayCost {
  cost_usd: number;
  classification_count: number;
  briefing_count: number;
}

export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  priority: string | null;
}

export interface DashboardData {
  briefing: { content: string; created_at: string } | null;
  topItems: Item[];
  rankedInbox: Item[];
  portfolioItems: PortfolioItem[];
  portfolioSummary: PortfolioSummary | null;
  todaysTasks: TaskSummary[];
  todayCost: TodayCost;
}

export async function getDashboardData(demoMode: boolean): Promise<DashboardData> {
  const briefing = db.prepare(
    "SELECT content, created_at FROM briefings ORDER BY date DESC LIMIT 1"
  ).get() as { content: string; created_at: string } | undefined;

  const seed = demoMode ? 1 : 0;
  const items = db.prepare(
    `SELECT * FROM items
     WHERE seed = ? AND priority_score IS NOT NULL AND source != 'notion'
     ORDER BY priority_score DESC LIMIT 30`
  ).all(seed) as ItemRow[];

  // Convert SQLite integers (0/1) back to booleans for the Zod-based Item type
  const processedItems: Item[] = items.map(item => ({
    ...item,
    source_account: item.source_account ?? null,
    classified: Boolean(item.classified),
    action_required: item.action_required === null ? null : Boolean(item.action_required),
  }));

  const topItems = processedItems.slice(0, 10);
  const rankedInbox = processedItems.slice(10, 30);

  const taskRows = db.prepare(`
    SELECT id, title, body
    FROM items
    WHERE source = 'notion' AND seed = ?
    ORDER BY urgency DESC, timestamp ASC
    LIMIT 5
  `).all(seed) as { id: string; title: string; body: string }[];

  const todaysTasks: TaskSummary[] = taskRows.map((row) => {
    try {
      const parsed = JSON.parse(row.body) as {
        status?: string;
        due_date?: string | null;
        priority?: string | null;
      };

      return {
        id: row.id,
        title: row.title,
        status: parsed.status ?? "Unknown",
        due_date: parsed.due_date ?? null,
        priority: parsed.priority ?? null,
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

  let portfolioSummary: PortfolioSummary | null = null;
  if (!demoMode) {
    try {
      portfolioSummary = await getPortfolioSummary();
    } catch (error) {
      console.error("Error fetching portfolio summary", error);
    }
  }

  // Portfolio items from T212 sync, retained as a DB fallback for Top Movers
  const portfolioRows = db.prepare(
    "SELECT body FROM items WHERE source = 'trading212' AND seed = 0 ORDER BY updated_at DESC"
  ).all() as { body: string }[];

  let portfolioItems: PortfolioItem[] = [];
  if (portfolioRows.length > 0) {
    portfolioItems = portfolioRows.flatMap((row) => {
      try {
        const parsedBody = JSON.parse(row.body);
        const position = parsedBody.position;
        if (!position) return [];

        const currentPrice = position.currentPrice;
        const averagePricePaid = position.averagePricePaid;
        const pctMove =
          averagePricePaid !== 0
            ? (currentPrice - averagePricePaid) / averagePricePaid
            : 0;

        return [{
          ticker: position.instrument?.ticker ?? "Unknown",
          currentPrice,
          averagePricePaid,
          pctMove,
          unrealizedProfitLoss: position.walletImpact?.unrealizedProfitLoss ?? 0,
          currentValue: currentPrice * position.quantity,
        }];
      } catch (e) {
        console.error("Error parsing portfolio body", e);
        return [];
      }
    });

    portfolioItems.sort((a, b) => Math.abs(b.pctMove) - Math.abs(a.pctMove));
    portfolioItems = portfolioItems.slice(0, 3);
  }

  const costData = db.prepare(`
    SELECT 
      SUM(cost_usd) as total_cost,
      COUNT(CASE WHEN purpose = 'classify' THEN 1 END) as classifications,
      COUNT(CASE WHEN purpose = 'briefing' THEN 1 END) as briefings
    FROM llm_calls 
    WHERE DATE(created_at) = DATE('now')
  `).get() as { total_cost: number | null, classifications: number, briefings: number };

  return {
    briefing: briefing || null,
    topItems,
    rankedInbox,
    portfolioItems,
    portfolioSummary,
    todaysTasks,
    todayCost: {
      cost_usd: costData.total_cost || 0,
      classification_count: costData.classifications,
      briefing_count: costData.briefings,
    },
  };
}
