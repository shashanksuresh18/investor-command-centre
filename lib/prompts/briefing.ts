import type { Item } from "../schema";
import type { TaskSummary } from "../dashboard-queries";
import type { CalendarEvent } from "../calendar";

export const BRIEFING_SYSTEM_PROMPT = `You are a chief-of-staff preparing a morning briefing for a finance executive. Write in plain, direct British English. No corporate filler, no rhetorical questions, no em dashes, no bullet points inside prose. Three short paragraphs, then an 'Actions today' list of 3-5 items.

Paragraph 1: What needs attention today. Lead with the single most important item.
Paragraph 2: Portfolio state. Only mention moves > 2% or meaningful news.
Paragraph 3: Inbox summary. Mention top 2-3 emails by priority, group the rest.

Actions today: imperative, specific, each under 15 words. Include the item id in brackets so the executive can click through.
When tasks appear in TODAY'S TASKS, include the most urgent ones in the 'Actions today' list alongside email actions, using their item IDs.
Tie portfolio events and emails to calendar items where relevant. If a meeting later today relates to a portfolio holding or pipeline company, flag it.
NEVER quote authentication codes, OTPs, verification numbers, password reset tokens, SSO codes, or any time-sensitive credentials in the briefing or action items. If an item is flagged as containing such content, refer to it generically as 'a personal verification email arrived overnight, handle in your inbox' without specifics.`;

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
  date: string,
  tasks?: TaskSummary[],
  calendarEvents?: CalendarEvent[]
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

  const taskBlock =
    tasks && tasks.length > 0
      ? tasks
          .map((task, i) => {
            const due = task.due_date ? `due ${task.due_date}` : "no due date";
            return [
              `[${i + 1}] id=${task.id}`,
              `    Title:    ${task.title}`,
              `    Priority: ${task.priority ?? "None"}`,
              `    Status:   ${task.status}`,
              `    Due:      ${due}`,
            ].join("\n");
          })
          .join("\n\n")
      : "  No tasks synced from Notion.";

  const calendarBlock =
    calendarEvents && calendarEvents.length > 0
      ? calendarEvents
          .map((event, i) => {
            const attendees =
              event.attendees.length > 0 ? event.attendees.join(", ") : "None";
            const description = event.description
              ? `\n    Description: ${event.description
                  .replace(/<[^>]*>/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 500)}`
              : "";
            return `[${i + 1}] ${formatEventTime(event.start)}-${formatEventTime(event.end)}
    Title:    ${event.title}
    Attendees: ${attendees}${description}`;
          })
          .join("\n\n")
      : "  No calendar events found for today or tomorrow.";

  return `Date: ${date}

--- PORTFOLIO SNAPSHOT ---
Cash available: GBP ${portfolio.cash.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
Total portfolio value: GBP ${portfolio.totalValue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
Top movers (>2%):
${moverLines}

--- TODAY'S TASKS ---
${taskBlock}

--- TODAY'S CALENDAR ---
${calendarBlock}

--- TOP ITEMS (ranked by priority score) ---
${itemLines}`;
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
