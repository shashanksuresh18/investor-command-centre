import { randomUUID } from "crypto";
import { google, gmail_v1 } from "googleapis";
import db from "./db";

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
}

function getGmailClient(): gmail_v1.Gmail {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail: missing OAuth credentials");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.gmail({ version: "v1", auth: oauth2Client });
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

export async function fetchRecentEmails(limit = 100): Promise<EmailSummary[]> {
  const gmail = getGmailClient();
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
    });
  }

  return emails;
}

export async function syncEmailsToItems(): Promise<{ upserted: number }> {
  const emails = await fetchRecentEmails(100);
  const insert = db.prepare(`
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
    ON CONFLICT(source, source_id) DO NOTHING
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
      now,
      now
    );

    upserted += result.changes;
  }

  return { upserted };
}
