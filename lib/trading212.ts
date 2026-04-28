import { randomUUID } from "crypto";
import db from "./db";

export interface T212Cash {
  free: number;
  invested: number;
  result: number;
  total: number;
}

export interface T212Position {
  instrument: { ticker: string; name: string; isin: string; currency: string };
  createdAt: string;
  quantity: number;
  quantityAvailableForTrading: number;
  currentPrice: number;
  averagePricePaid: number;
  walletImpact: {
    currency: string;
    totalCost: number;
    currentValue: number;
    unrealizedProfitLoss: number;
    fxImpact: number;
  };
}

// The raw envelope returned by /equity/history/orders
interface T212OrderItem {
  order: {
    id: number;
    ticker: string;
    status: string;
    filledValue: number;
    createdAt: string;
  };
  fill?: unknown;
}

// Flattened convenience type used by consumers of this module
export interface T212Order {
  id: number;
  ticker: string;
  status: string;
  filledValue: number;
  createdAt: string;
}

interface T212OrdersResponse {
  items: T212OrderItem[];
  nextPagePath: string | null;
}

function getAuthHeader(): string {
  const apiKey = process.env.T212_API_KEY;
  const apiSecret = process.env.T212_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("T212: missing T212_API_KEY or T212_API_SECRET");
  }
  const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  return `Basic ${encoded}`;
}

async function t212Get<T>(path: string): Promise<T> {
  const baseUrl = process.env.T212_BASE_URL;
  if (!baseUrl) throw new Error("T212: missing T212_BASE_URL");

  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
    },
  });

  if (res.status === 401) {
    throw new Error("T212: invalid API credentials (401)");
  }
  if (res.status === 429) {
    throw new Error("T212: rate limited (429) — retry after 30 s");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`T212: unexpected status ${res.status} — ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

export async function getCash(): Promise<T212Cash> {
  return t212Get<T212Cash>("/equity/account/cash");
}

export async function getPositions(): Promise<T212Position[]> {
  return t212Get<T212Position[]>("/equity/positions");
}

export async function getRecentOrders(limit = 20): Promise<T212Order[]> {
  const response = await t212Get<T212OrdersResponse>(
    `/equity/history/orders?limit=${limit}`
  );
  return (response.items ?? []).map((item) => item.order);
}

export async function syncPortfolioToItems(): Promise<{ upserted: number }> {
  const [positions, orders] = await Promise.all([
    getPositions(),
    getRecentOrders(),
  ]);

  const recentCutoff = Date.now() - 86_400_000;
  const recentOrders = orders.filter(
    (order) => new Date(order.createdAt).getTime() >= recentCutoff
  );
  const recentTickers = new Set(recentOrders.map((order) => order.ticker));

  const upsert = db.prepare(`
    INSERT INTO items (
      id, source, source_id, title, body, sender, timestamp, classified,
      category, urgency, financial_impact, relationship_importance,
      actionability, risk, action_required, suggested_action, reasoning,
      priority_score, user_feedback, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )
    ON CONFLICT(source, source_id) DO UPDATE SET
      body = excluded.body,
      timestamp = excluded.timestamp,
      updated_at = excluded.updated_at
  `);

  let upserted = 0;
  for (const position of positions) {
    const ticker = position.instrument.ticker;
    const pctMove =
      position.averagePricePaid === 0
        ? 0
        : (position.currentPrice - position.averagePricePaid) / position.averagePricePaid;

    const matchingOrders = recentOrders.filter(
      (order) => order.ticker === ticker
    );

    if (Math.abs(pctMove) <= 0.02 && !recentTickers.has(ticker)) {
      continue;
    }

    const now = new Date().toISOString();
    const result = upsert.run(
      randomUUID(),
      "trading212",
      ticker,
      `Position: ${ticker}`,
      JSON.stringify({ position, recentOrders: matchingOrders }),
      "trading212",
      now,
      0,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      now,
      now
    );

    upserted += result.changes;
  }

  return { upserted };
}