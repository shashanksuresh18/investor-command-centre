import db from "./db";
import type { Item } from "./schema";

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

export interface DashboardData {
  briefing: { content: string; created_at: string } | null;
  topItems: Item[];
  rankedInbox: Item[];
  portfolioItems: PortfolioItem[];
  todayCost: TodayCost;
}

export function getDashboardData(demoMode: boolean): DashboardData {
  const briefing = db.prepare(
    "SELECT content, created_at FROM briefings ORDER BY date DESC LIMIT 1"
  ).get() as { content: string; created_at: string } | undefined;

  const seed = demoMode ? 1 : 0;
  const items = db.prepare(
    "SELECT * FROM items WHERE seed = ? AND priority_score IS NOT NULL ORDER BY priority_score DESC LIMIT 30"
  ).all(seed) as any[];

  // Convert SQLite integers (0/1) back to booleans for the Zod-based Item type
  const processedItems: Item[] = items.map(item => ({
    ...item,
    classified: Boolean(item.classified),
    action_required: item.action_required === null ? null : Boolean(item.action_required),
  }));

  const topItems = processedItems.slice(0, 10);
  const rankedInbox = processedItems.slice(10, 30);

  // Portfolio items from T212 sync
  const portfolioRows = db.prepare(
    "SELECT body FROM items WHERE source = 'trading212' AND seed = 0 ORDER BY updated_at DESC LIMIT 1"
  ).all() as { body: string }[];

  let portfolioItems: PortfolioItem[] = [];
  if (portfolioRows.length > 0) {
    try {
      const parsedBody = JSON.parse(portfolioRows[0].body);
      if (Array.isArray(parsedBody.positions)) {
        portfolioItems = parsedBody.positions.map((p: any) => {
          const currentPrice = p.currentPrice;
          const averagePricePaid = p.averagePricePaid;
          const pctMove = averagePricePaid !== 0 ? (currentPrice - averagePricePaid) / averagePricePaid : 0;
          return {
            ticker: p.ticker,
            currentPrice,
            averagePricePaid,
            pctMove,
            unrealizedProfitLoss: p.ppl,
            currentValue: p.currentPrice * p.quantity,
          };
        });
        // Sort by absolute percentage move descending and take top 3
        portfolioItems.sort((a, b) => Math.abs(b.pctMove) - Math.abs(a.pctMove));
        portfolioItems = portfolioItems.slice(0, 3);
      }
    } catch (e) {
      console.error("Error parsing portfolio body", e);
    }
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
    todayCost: {
      cost_usd: costData.total_cost || 0,
      classification_count: costData.classifications,
      briefing_count: costData.briefings,
    },
  };
}
