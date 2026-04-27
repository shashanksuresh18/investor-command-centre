import type { Item } from "../schema";

export const BRIEFING_SYSTEM_PROMPT = `You are a chief-of-staff preparing a morning briefing for a finance executive. Write in plain, direct British English. No corporate filler, no rhetorical questions, no em dashes, no bullet points inside prose. Three short paragraphs, then an 'Actions today' list of 3-5 items.

Paragraph 1: What needs attention today. Lead with the single most important item.
Paragraph 2: Portfolio state. Only mention moves > 2% or meaningful news.
Paragraph 3: Inbox summary. Mention top 2-3 emails by priority, group the rest.

Actions today: imperative, specific, each under 15 words. Include the item id in brackets so the executive can click through.`;

export interface PortfolioSnapshot {
  cash: number;
  totalValue: number;
  topMovers: Array<{ ticker: string; pctMove: number }>;
}

function fmtPct(pctMove: number): string {
  const sign = pctMove >= 0 ? "+" : "";
  return `${sign}${(pctMove * 100).toFixed(1)}%`;
}

export function buildBriefingUserPrompt(
  items: Item[],
  portfolio: PortfolioSnapshot,
  date: string
): string {
  const itemLines = items
    .map((item, i) => {
      const score = item.priority_score != null ? item.priority_score.toFixed(1) : "n/a";
      const action = item.suggested_action ?? "none";
      return [
        `[${i + 1}] id=${item.id}`,
        `    Title:    ${item.title}`,
        `    From:     ${item.sender}`,
        `    Category: ${item.category ?? "unclassified"}`,
        `    Score:    ${score}/100`,
        `    Reasoning: ${item.reasoning ?? ""}`,
        `    Suggested action: ${action}`,
      ].join("\n");
    })
    .join("\n\n");

  const moverLines =
    portfolio.topMovers.length > 0
      ? portfolio.topMovers
          .map((m) => `  ${m.ticker}: ${fmtPct(m.pctMove)}`)
          .join("\n")
      : "  No movers above 2% threshold.";

  return `Date: ${date}

--- PORTFOLIO SNAPSHOT ---
Cash available: GBP ${portfolio.cash.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
Total portfolio value: GBP ${portfolio.totalValue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
Top movers (>2%):
${moverLines}

--- TOP ITEMS (ranked by priority score) ---
${itemLines}`;
}
