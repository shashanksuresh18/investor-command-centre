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
- Discord messages from AI engineering and finance-tech communities can be relevant signal but are typically lower urgency than direct emails. Substantive technical discussion, paper shares, and deal/market commentary are signal. Banter, reactions, and casual chat are noise. Newsletters posted as links in chats are still newsletters.
- CRITICAL: If the email contains an authentication code, verification code, OTP, password reset link, SSO sign-in code, or any time-sensitive credential, you MUST: (1) set category to 'admin', (2) set urgency to 1 (not high - these are personal admin not professional priorities), (3) set financial_impact to 1, (4) set relationship_importance to 1, (5) set actionability to 1, (6) NEVER include the actual code, link, or credential in the suggested_action or reasoning fields, just say 'Personal account verification email - handle outside the dashboard.' This prevents authentication codes from appearing in briefings.

When the source_account field is present, weight relationship_importance with that specific inbox in mind - emails to a personal address may carry different relationship signals than a work address.`;

export function buildClassifyUserPrompt(item: Item): string {
  if (item.source === "discord") {
    return buildDiscordClassifyUserPrompt(item);
  }

  const accountLine = item.source_account ? `Account: ${item.source_account}\n` : "";
  return `Item source: ${item.source}
${accountLine}From: ${item.sender}
Subject: ${item.title}
Date: ${item.timestamp}
Body:
${item.body}`;
}

function buildDiscordClassifyUserPrompt(item: Item): string {
  try {
    const parsed = JSON.parse(item.body) as {
      guild_name?: string;
      channel_name?: string;
      content?: string;
    };
    const channel = parsed.channel_name ?? item.source_account ?? "unknown";
    const server = parsed.guild_name ?? "unknown";

    return `Item source: discord (server: ${server}, channel: #${channel})
From: ${item.sender}
Subject: ${item.title}
Date: ${item.timestamp}
Body:
${parsed.content ?? item.body}`;
  } catch {
    const channel = item.source_account ?? "unknown";
    return `Item source: discord (channel: #${channel})
From: ${item.sender}
Subject: ${item.title}
Date: ${item.timestamp}
Body:
${item.body}`;
  }
}
