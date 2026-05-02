import type { Item } from "../schema";

const CLASSIFY_BASE_PROMPT = `You classify items for a finance executive managing a public portfolio, a private PE book, and a deal pipeline. Return ONLY valid JSON, no prose, no markdown fences.

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

Shared scoring guidance:
- A newsletter is almost always category='newsletter', urgency 1-2, financial_impact 1-3
- LPs, board members, founders, key counterparties, and active deal contacts carry higher relationship_importance
- Calendar invites, expense admin, login admin, and account operations are category='admin', urgency depends on date
- Personal email from friend/family is category='personal', relationship varies
- Auto-generated notifications with no clear action are category='noise', all scores 1-3
- CRITICAL: If the item contains an authentication code, verification code, OTP, password reset link, SSO sign-in code, or any time-sensitive credential, you MUST: (1) set category to 'admin', (2) set urgency to 1 (not high - these are personal admin not professional priorities), (3) set financial_impact to 1, (4) set relationship_importance to 1, (5) set actionability to 1, (6) NEVER include the actual code, link, or credential in the suggested_action or reasoning fields, just say 'Personal account verification email - handle outside the dashboard.' This prevents authentication codes from appearing in briefings.`;

const GMAIL_CLASSIFY_PROMPT = `${CLASSIFY_BASE_PROMPT}

Source-specific guidance for Gmail:
- Direct emails are often more actionable than chat messages because they imply an explicit sender-recipient relationship.
- Weight source_account with care: work and investment inboxes may carry stronger professional signal than personal inboxes.
- A pitch deck from an unknown founder is category='pipeline', relationship_importance 4-6 unless there is warm context.
- A known LP, board member, founder, banker, lawyer, or portfolio-company operator should usually score relationship_importance 7-10.
- Marketing email, newsletters, product updates, automated security notifications, and generic SaaS messages should stay low unless they directly affect portfolio risk or a live action.`;

const DISCORD_CLASSIFY_PROMPT = `${CLASSIFY_BASE_PROMPT}

Source-specific guidance for Discord:
- Discord messages from AI engineering and finance-tech communities can be relevant signal but are typically lower urgency than direct emails.
- Substantive technical discussion, paper shares, infrastructure pricing, market commentary, and founder/operator signal can be useful.
- Banter, reactions, memes, classroom chatter, and casual coordination are usually category='noise' with low urgency.
- If a message is a useful link or paper share but has no direct action, category='newsletter' or 'noise' is often more appropriate than 'admin'.
- Only score actionability high when the sender is directly asking the executive to do something or when the message clearly affects a portfolio/deal decision today.`;

const TRADING212_CLASSIFY_PROMPT = `${CLASSIFY_BASE_PROMPT}

Source-specific guidance for Trading 212:
- Portfolio position events should usually be category='portfolio'.
- Large moves, drawdowns, concentration risk, cash constraints, and holdings tied to current decisions should score higher on financial_impact and risk.
- Do not invent actions. Suggested actions should be concrete review actions such as check catalyst, review thesis, trim/hold decision, or monitor.
- Relationship_importance is normally 1 unless the item body explicitly links the holding to a key counterparty, LP, founder, or board matter.
- Urgency should be high only for material moves or risks that need action today.`;

const GENERIC_CLASSIFY_PROMPT = `${CLASSIFY_BASE_PROMPT}

Source-specific guidance:
- Use the shared scoring rubric conservatively.
- If the source has structured priority outside the text, respect that context, but still return the required JSON shape.`;

export const CLASSIFY_SYSTEM_PROMPT = GMAIL_CLASSIFY_PROMPT;

export function getClassifySystemPrompt(item: Item): string {
  if (item.source === "gmail") return GMAIL_CLASSIFY_PROMPT;
  if (item.source === "discord") return DISCORD_CLASSIFY_PROMPT;
  if (item.source === "trading212") return TRADING212_CLASSIFY_PROMPT;
  return GENERIC_CLASSIFY_PROMPT;
}

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
