import db from "./db";
import { fetchTodaysEvents, type CalendarEvent } from "./calendar";
import { getCash, getPositions, type T212Position } from "./trading212";
import type { Item } from "./schema";

type ItemRow = Omit<Item, "classified" | "action_required"> & {
  classified: number;
  action_required: number | null;
  seed?: number;
};

export interface BriefingInsight {
  content: string;
  created_at: string;
}

export type RecommendationAction =
  | "HOLD"
  | "ADD"
  | "TRIM"
  | "EXIT"
  | "INVESTIGATE";

export interface DecisionRecommendation {
  action: RecommendationAction;
  confidence: number;
  reasons: string[];
  missingInformation: string[];
}

export interface Position {
  ticker: string;
  companyName: string;
  quantity: number;
  averageCost: number;
  currentPrice: number;
  currentValue: number;
  unrealisedPL: number;
  unrealisedPLPct: number;
  dailyMovePct: number;
  currency: string;
  concentration: number;
  thesisStatus: "Current" | "Review due" | "Missing";
  lastReviewedDate: string;
  nextCatalyst: string;
  recommendation: DecisionRecommendation;
}

export interface PortfolioAlert {
  id: string;
  ticker: string;
  title: string;
  severity: "high" | "medium" | "low";
  reason: string;
}

export interface EmailMessage {
  id: string;
  account: string;
  sender: string;
  subject: string;
  receivedAt: string;
  category: string;
  state: "urgent reply" | "admin / sign-off" | "low priority" | "archive candidates";
  suggestedAction: string;
  reasoning: string;
  score: number;
}

export interface DiscordMessage {
  id: string;
  server: string;
  channel: string;
  sender: string;
  summary: string;
  timestamp: string;
  state: "requires response" | "monitor" | "noise";
  whyItMatters: string;
  score: number;
}

export interface Task {
  id: string;
  title: string;
  source: string;
  dueDate: string | null;
  owner: string;
  status: string;
  urgency: number;
  linkedContext: string;
  lane: "Decide" | "Review" | "Reply" | "Sign off" | "Schedule" | "Investigate";
}

export type Meeting = CalendarEvent;

function toItem(row: ItemRow): Item {
  return {
    ...row,
    source_account: row.source_account ?? null,
    classified: Boolean(row.classified),
    action_required: row.action_required === null ? null : Boolean(row.action_required),
  };
}

function getScoredItems(seed: number, limit = 80): Item[] {
  const rows = db.prepare(`
    SELECT * FROM items
    WHERE seed = ? AND priority_score IS NOT NULL
    ORDER BY priority_score DESC, timestamp DESC
    LIMIT ?
  `).all(seed, limit) as ItemRow[];

  return rows.map(toItem);
}

export function cleanBriefingContent(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\s*\[[0-9a-f]{8}(?:[-, ]+[0-9a-f]{8})*\]/gi, "");
}

export function getLatestBriefing(): BriefingInsight | null {
  const row = db.prepare(
    "SELECT content, created_at FROM briefings ORDER BY date DESC LIMIT 1",
  ).get() as BriefingInsight | undefined;

  return row ?? null;
}

export function getTodayCost() {
  const row = db.prepare(`
    SELECT
      SUM(cost_usd) as total_cost,
      COUNT(CASE WHEN purpose = 'classify' THEN 1 END) as classifications,
      COUNT(CASE WHEN purpose = 'briefing' THEN 1 END) as briefings
    FROM llm_calls
    WHERE DATE(created_at) = DATE('now')
  `).get() as {
    total_cost: number | null;
    classifications: number;
    briefings: number;
  };

  return {
    cost_usd: row.total_cost ?? 0,
    classification_count: row.classifications,
    briefing_count: row.briefings,
  };
}

function score(item: Item): number {
  return item.priority_score ?? 0;
}

function communicationState(item: Item): EmailMessage["state"] {
  if (item.category === "noise" || score(item) < 35) return "archive candidates";
  if (item.category === "admin") return "admin / sign-off";
  if (item.action_required || score(item) >= 70) return "urgent reply";
  return "low priority";
}

function discordState(item: Item): DiscordMessage["state"] {
  if (item.category === "noise" || score(item) < 35) return "noise";
  if (item.action_required || score(item) >= 65) return "requires response";
  return "monitor";
}

function taskLaneFromItem(item: Item): Task["lane"] {
  const title = `${item.title} ${item.suggested_action ?? ""}`.toLowerCase();
  if (title.includes("sign") || item.category === "admin") return "Sign off";
  if (title.includes("reply") || item.source === "gmail") return "Reply";
  if (title.includes("meeting") || title.includes("calendar")) return "Schedule";
  if (item.category === "portfolio") return "Decide";
  if (item.source === "discord") return "Investigate";
  return "Review";
}

export function getEmailWorkspace(seed = 0): EmailMessage[] {
  return getScoredItems(seed, 120)
    .filter((item) => item.source === "gmail")
    .map((item) => ({
      id: item.id,
      account: item.source_account ?? "primary",
      sender: item.sender.split("<")[0].trim(),
      subject: item.title,
      receivedAt: item.timestamp,
      category: item.category ?? "unclassified",
      state: communicationState(item),
      suggestedAction: item.suggested_action ?? "Review in Gmail",
      reasoning: item.reasoning ?? "No reasoning recorded",
      score: score(item),
    }));
}

export function getDiscordWorkspace(seed = 0): DiscordMessage[] {
  return getScoredItems(seed, 120)
    .filter((item) => item.source === "discord")
    .map((item) => {
      let server = "Discord";
      try {
        const parsed = JSON.parse(item.body) as { guild_name?: string; channel_name?: string };
        server = parsed.guild_name ?? server;
      } catch {
        // Keep generic server label if body is not structured JSON.
      }

      return {
        id: item.id,
        server,
        channel: item.source_account ?? "unknown",
        sender: item.sender,
        summary: item.title,
        timestamp: item.timestamp,
        state: discordState(item),
        whyItMatters: item.reasoning ?? "No reasoning recorded",
        score: score(item),
      };
    });
}

export function getTasksWorkspace(seed = 0): Task[] {
  const notionRows = db.prepare(`
    SELECT * FROM items
    WHERE source = 'notion' AND seed = ?
    ORDER BY urgency DESC, timestamp ASC
    LIMIT 40
  `).all(seed) as ItemRow[];

  const notionTasks = notionRows.map(toItem).map((item) => {
    let status = "Unknown";
    let priority: string | null = null;
    try {
      const parsed = JSON.parse(item.body) as { status?: string; priority?: string | null };
      status = parsed.status ?? status;
      priority = parsed.priority ?? null;
    } catch {
      // Use default status.
    }

    return {
      id: item.id,
      title: item.title,
      source: "Notion",
      dueDate: item.timestamp,
      owner: "Shashank",
      status,
      urgency: item.urgency ?? 5,
      linkedContext: priority ? `Notion priority: ${priority}` : "Notion task database",
      lane: taskLaneFromItem(item),
    } satisfies Task;
  });

  const derivedTasks = getScoredItems(seed, 30)
    .filter((item) => item.source !== "notion" && (item.action_required || score(item) >= 70))
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      title: item.suggested_action ?? item.title,
      source: item.source,
      dueDate: item.timestamp,
      owner: item.source === "gmail" ? item.sender.split("<")[0].trim() : item.source_account ?? item.source,
      status: item.user_feedback === "important" ? "Marked important" : "Open",
      urgency: item.urgency ?? Math.ceil(score(item) / 10),
      linkedContext: item.title,
      lane: taskLaneFromItem(item),
    } satisfies Task));

  return [...notionTasks, ...derivedTasks];
}

function buildRecommendation(position: T212Position, concentration: number): DecisionRecommendation {
  const move =
    position.averagePricePaid === 0
      ? 0
      : (position.currentPrice - position.averagePricePaid) / position.averagePricePaid;
  const absMove = Math.abs(move);
  const reasons: string[] = [];
  const missingInformation: string[] = [];
  let action: RecommendationAction = "HOLD";
  let confidence = 48 + Math.round(Math.min(absMove, 0.2) * 90);

  if (move <= -0.1) {
    action = "INVESTIGATE";
    confidence = Math.max(confidence, 66 + Math.round(Math.min(absMove - 0.1, 0.15) * 80));
    reasons.push("Large drawdown versus average cost; verify whether the thesis changed.");
  }
  if (move >= 0.25) {
    action = "TRIM";
    confidence = Math.max(confidence, 68 + Math.round(Math.min(move - 0.25, 0.2) * 60));
    reasons.push("Large unrealised gain; review position sizing and exit discipline.");
  }
  if (concentration >= 0.25) {
    action = "TRIM";
    confidence = Math.max(confidence, 70 + Math.round(Math.min(concentration - 0.25, 0.25) * 60));
    reasons.push("Concentration is above the 25% review threshold.");
  }
  if (absMove >= 0.1) {
    reasons.push("Volatility threshold triggered; separate price move from thesis change.");
  } else if (absMove >= 0.05) {
    reasons.push("Moderate move versus average cost; monitor but no hard action threshold breached.");
  }
  if (concentration >= 0.15 && concentration < 0.25) {
    confidence += 4;
    reasons.push("Position size is meaningful enough to keep on the review list.");
  }
  if (reasons.length === 0) {
    reasons.push("No rule threshold breached; maintain and monitor.");
  }

  confidence = Math.max(42, Math.min(92, confidence));

  missingInformation.push("Latest thesis review date");
  missingInformation.push("Upcoming company catalyst");
  missingInformation.push("Recent news severity");

  return { action, confidence, reasons, missingInformation };
}

function positionFromT212(position: T212Position, totalPositionsValue: number): Position {
  const currentValue = position.currentPrice * position.quantity;
  const concentration = totalPositionsValue === 0 ? 0 : currentValue / totalPositionsValue;
  const totalCost = position.walletImpact?.totalCost ?? position.averagePricePaid * position.quantity;
  const unrealisedPL = position.walletImpact?.unrealizedProfitLoss ?? currentValue - totalCost;
  const unrealisedPLPct =
    position.averagePricePaid === 0
      ? 0
      : (position.currentPrice - position.averagePricePaid) / position.averagePricePaid;

  return {
    ticker: position.instrument.ticker,
    companyName: position.instrument.name,
    quantity: position.quantity,
    averageCost: position.averagePricePaid,
    currentPrice: position.currentPrice,
    currentValue,
    unrealisedPL,
    unrealisedPLPct,
    dailyMovePct: unrealisedPLPct,
    currency: position.instrument.currency,
    concentration,
    thesisStatus: "Review due",
    lastReviewedDate: "Not recorded",
    nextCatalyst: "Verify manually",
    recommendation: buildRecommendation(position, concentration),
  };
}

function getStoredT212Positions(): T212Position[] {
  const rows = db.prepare(`
    SELECT body FROM items
    WHERE source = 'trading212' AND seed = 0
    ORDER BY updated_at DESC
  `).all() as { body: string }[];

  return rows.flatMap((row) => {
    try {
      const parsed = JSON.parse(row.body) as { position?: T212Position };
      return parsed.position ? [parsed.position] : [];
    } catch {
      return [];
    }
  });
}

function buildPortfolioWorkspaceFromPositions(
  positions: T212Position[],
  freeCash: number | null,
) {
  const totalPositionsValue = positions.reduce(
    (sum, position) => sum + position.currentPrice * position.quantity,
    0,
  );
  const mapped = positions.map((position) => positionFromT212(position, totalPositionsValue));
  const totalUnrealisedPL = mapped.reduce((sum, position) => sum + position.unrealisedPL, 0);
  const topMovers = [...mapped]
    .sort((a, b) => Math.abs(b.dailyMovePct) - Math.abs(a.dailyMovePct))
    .slice(0, 5);
  const alerts = mapped
    .filter((position) => position.recommendation.action !== "HOLD")
    .map((position) => ({
      id: position.ticker,
      ticker: position.ticker,
      title: `${position.recommendation.action}: ${position.companyName}`,
      severity:
        position.recommendation.confidence >= 72
          ? "high"
          : position.recommendation.confidence >= 62
          ? "medium"
          : "low",
      reason: position.recommendation.reasons[0],
    } satisfies PortfolioAlert));

  const largest = [...mapped].sort((a, b) => b.concentration - a.concentration)[0];

  return {
    summary: {
      totalValue: freeCash == null ? totalPositionsValue : freeCash + totalPositionsValue,
      freeCash,
      dailyPL: null,
      totalUnrealisedPL,
      concentrationRisk: largest ? `${largest.ticker} ${(largest.concentration * 100).toFixed(0)}%` : "No positions",
      exposure: "Native-currency holdings; sector/geography tagging pending",
    },
    positions: mapped,
    topMovers,
    alerts,
    watchlist: mapped.filter((position) => position.recommendation.action === "INVESTIGATE"),
  };
}

export async function getPortfolioWorkspace() {
  try {
    const [cash, positions] = await Promise.all([getCash(), getPositions()]);
    return buildPortfolioWorkspaceFromPositions(positions, cash.free);
  } catch {
    const storedPositions = getStoredT212Positions();
    if (storedPositions.length > 0) {
      return buildPortfolioWorkspaceFromPositions(storedPositions, null);
    }

    return {
      summary: {
        totalValue: null,
        freeCash: null,
        dailyPL: null,
        totalUnrealisedPL: null,
        concentrationRisk: "Unavailable",
        exposure: "Trading 212 API unavailable",
      },
      positions: [] as Position[],
      topMovers: [] as Position[],
      alerts: [] as PortfolioAlert[],
      watchlist: [] as Position[],
    };
  }
}

export async function getMeetings(): Promise<Meeting[]> {
  try {
    return await fetchTodaysEvents();
  } catch {
    return [];
  }
}

export async function getOverviewWorkspace(demoMode: boolean) {
  const seed = demoMode ? 1 : 0;
  const all = getScoredItems(seed, 80);
  const communications = all.filter((item) => item.source === "gmail" || item.source === "discord");
  const tasks = getTasksWorkspace(seed);
  const portfolio = await getPortfolioWorkspace();
  const meetings = demoMode ? [] : await getMeetings();
  const briefing = getLatestBriefing();

  return {
    briefing,
    decisionsToday: [
      ...portfolio.alerts.slice(0, 2).map((alert) => ({
        id: alert.id,
        title: alert.title,
        source: "portfolio",
        reason: alert.reason,
        score: alert.severity === "high" ? 90 : 70,
      })),
      ...tasks.slice(0, 5).map((task) => ({
        id: task.id,
        title: task.title,
        source: task.source,
        reason: task.linkedContext,
        score: task.urgency * 10,
      })),
      ...communications.slice(0, 5).map((item) => ({
        id: item.id,
        title: item.suggested_action ?? item.title,
        source: item.source,
        reason: item.reasoning ?? "Ranked by classifier",
        score: score(item),
      })),
    ]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5),
    portfolioAlerts: portfolio.alerts.slice(0, 4),
    communicationsRequiringResponse: communications
      .filter((item) => item.action_required || score(item) >= 65)
      .slice(0, 5),
    meetings: meetings.slice(0, 5),
    todayCost: getTodayCost(),
  };
}
