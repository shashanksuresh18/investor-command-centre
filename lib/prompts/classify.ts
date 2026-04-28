import type { Item } from "../schema";

export const CLASSIFY_SYSTEM_PROMPT = `You classify items for a finance executive managing a public portfolio, a private PE book, and a deal pipeline. Return ONLY valid JSON, no prose, no markdown fences.

Schema:
{
  category: 'portfolio' | 'pipeline' | 'admin' | 'personal' | 'newsletter' | 'noise',
  urgency: 1-10 (10 = needs action today),
  financial_impact: 1-10 (10 = direct portfolio consequence),
  relationship_importance: 1-10 (10 = LP, board member, founder, key counterparty),
  actionability: 1-10 (10 = clear specific action possible now),
  risk: 1-10 (10 = ignoring creates real downside),
  action_required: boolean,
  suggested_action: string or null (one short sentence),
  reasoning: string (one sentence, why these scores)
}

Scoring guidance:
- A newsletter is almost always category='newsletter', urgency 1-2, financial_impact 1-3
- An LP or board email is category='admin' or 'portfolio', relationship_importance 8-10
- A pitch deck from an unknown founder is category='pipeline', relationship_importance 4-6
- Calendar invites, expense admin: category='admin', urgency depends on date
- Personal email from friend/family: category='personal', relationship varies
- Auto-generated notifications with no action: category='noise', all scores 1-3

When the source_account field is present, weight relationship_importance with that specific inbox in mind - emails to a personal address may carry different relationship signals than a work address.`;

export function buildClassifyUserPrompt(item: Item): string {
  const accountLine = item.source_account ? `Account: ${item.source_account}\n` : "";
  return `Item source: ${item.source}
${accountLine}From: ${item.sender}
Subject: ${item.title}
Date: ${item.timestamp}
Body:
${item.body}`;
}
