import { randomUUID } from "crypto";
import db from "./db";

export interface T212Cash {
  invested: number;
  result: number;
  total: number;
  free: number;
}

export interface T212Position {
  ticker: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  ppl: number;
  fxPpl: number;
}

export interface T212Order {
  id: string;
  ticker: string;
  status: string;
  filledValue: number;
  dateCreated: string;
  dateModified: string;
}

function getAuthHeader(): string {
  const apiKey = process.env.T212_API_KEY;
  const apiSecret = process.env.T212_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("T212: missing API credentials");
  }

  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
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
    throw new Error(`T212: unexpected status ${res.status}`);
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
  return t212Get<T212Order[]>(`/equity/history/orders?limit=${limit}`);
}

export async function syncPortfolioToItems(): Promise<{ upserted: number }> {
  const [positions, orders] = await Promise.all([getPositions(), getRecentOrders()]);
  const recentCutoff = Date.now() - 86_400_000;
  const recentOrders = orders.filter(
    (order) => new Date(order.dateCreated).getTime() >= recentCutoff
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
    const pctMove =
      position.averagePrice === 0
        ? 0
        : (position.currentPrice - position.averagePrice) / position.averagePrice;
    const matchingOrders = recentOrders.filter(
      (order) => order.ticker === position.ticker
    );

    if (Math.abs(pctMove) <= 0.02 && !recentTickers.has(position.ticker)) {
      continue;
    }

    const now = new Date().toISOString();
    const result = upsert.run(
      randomUUID(),
      "trading212",
      position.ticker,
      `Position: ${position.ticker}`,
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
