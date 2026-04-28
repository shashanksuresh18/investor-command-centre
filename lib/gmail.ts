import { randomUUID } from "crypto";
import { google, gmail_v1 } from "googleapis";
import db from "./db";

interface AccountConfig {
  email: string | null;
  refresh_token: string;
}

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
  account: string | null;
}

function getAccountConfigs(): AccountConfig[] {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Gmail: missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }

  const raw = process.env.GMAIL_ACCOUNTS_JSON;
  if (raw) {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Gmail: GMAIL_ACCOUNTS_JSON must be a non-empty array");
    }

    const normalised: AccountConfig[] = parsed.map((entry: unknown, i: number) => {
      const raw = entry as Record<string, unknown>;
      const email = raw.email as string | undefined;
      const token = (raw.refresh_token ?? raw.refreshToken) as string | undefined;
      if (!email || !token) {
        throw new Error(
          `Gmail: GMAIL_ACCOUNTS_JSON entry ${i} is missing email or refresh_token`
        );
      }
      return { email, refresh_token: token };
    });

    return normalised;
  }

  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("Gmail: set GMAIL_ACCOUNTS_JSON or GOOGLE_REFRESH_TOKEN");
  }

  return [{ email: null, refresh_token: refreshToken }];
}

function decodeBody(data?: string | null): string {
  if (!data) return "";
  return Buffer.from(data, "base64")
    .toString("utf-8")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function findBodyPart(
  parts: gmail_v1.Schema$MessagePart[] | undefined,
  mimeType: string
): gmail_v1.Schema$MessagePart | undefined {
  if (!parts) return undefined;

  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) return part;
    const nested = findBodyPart(part.parts ?? undefined, mimeType);
    if (nested) return nested;
  }

  return undefined;
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  const header = headers?.find(
    (candidate) => candidate.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? "";
}

async function fetchEmailsForAccount(
  config: AccountConfig,
  clientId: string,
  clientSecret: string,
  limit: number
): Promise<EmailSummary[]> {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: config.refresh_token });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const list = await gmail.users.messages.list({
    userId: "me",
    q: "in:inbox",
    maxResults: limit,
  });

  const messages = list.data.messages ?? [];
  const emails: EmailSummary[] = [];

  for (const message of messages) {
    if (!message.id) continue;

    const full = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "full",
    });

    const payload = full.data.payload;
    const headers = payload?.headers ?? [];
    const plainPart = findBodyPart(payload?.parts ?? undefined, "text/plain");
    const htmlPart = findBodyPart(payload?.parts ?? undefined, "text/html");
    const bodyData =
      plainPart?.body?.data ?? htmlPart?.body?.data ?? payload?.body?.data;
    const dateHeader = getHeader(headers, "date");
    const parsedDate = dateHeader ? new Date(dateHeader) : new Date();

    emails.push({
      id: message.id,
      from: getHeader(headers, "from"),
      subject: getHeader(headers, "subject"),
      body: decodeBody(bodyData),
      date: parsedDate.toISOString(),
      account: config.email,
    });
  }

  return emails;
}

export async function fetchRecentEmails(limit = 100): Promise<EmailSummary[]> {
  const configs = getAccountConfigs();
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

  const results = await Promise.allSettled(
    configs.map((cfg) => fetchEmailsForAccount(cfg, clientId, clientSecret, limit))
  );

  const all: EmailSummary[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result.status === "fulfilled") {
      all.push(...result.value);
    } else {
      console.error(`Gmail: failed for account ${configs[i].email}:`, result.reason);
    }
  }

  return all;
}

export async function syncEmailsToItems(): Promise<{ upserted: number }> {
  const emails = await fetchRecentEmails(100);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO items (
      id, source, source_id, title, body, sender, timestamp, classified,
      category, urgency, financial_impact, relationship_importance,
      actionability, risk, action_required, suggested_action, reasoning,
      priority_score, user_feedback, source_account, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  let upserted = 0;

  for (const email of emails) {
    const now = new Date().toISOString();
    const result = insert.run(
      randomUUID(),
      "gmail",
      email.id,
      email.subject,
      email.body,
      email.from,
      email.date,
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
      email.account,
      now,
      now
    );

    upserted += result.changes;
  }

  return { upserted };
}
