import { calendar_v3, google } from "googleapis";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  description: string | null;
}

function getCalendarClient(): calendar_v3.Calendar {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken =
    process.env.CALENDAR_REFRESH_TOKEN ??
    getRefreshTokenFromGmailAccounts() ??
    process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret) {
    throw new Error("Calendar: missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }
  if (!refreshToken) {
    throw new Error(
      "Calendar: CALENDAR_REFRESH_TOKEN or GOOGLE_REFRESH_TOKEN is not set",
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

function getRefreshTokenFromGmailAccounts(): string | undefined {
  const raw = process.env.GMAIL_ACCOUNTS_JSON;
  if (!raw) return undefined;

  try {
    const accounts = JSON.parse(raw) as Array<{ refresh_token?: string }>;
    return accounts.find((account) => account.refresh_token)?.refresh_token;
  } catch {
    return undefined;
  }
}

function toIso(value?: string | null): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function mapEvent(event: calendar_v3.Schema$Event): CalendarEvent | null {
  const start = toIso(event.start?.dateTime ?? event.start?.date);
  const end = toIso(event.end?.dateTime ?? event.end?.date);
  if (!start || !end) return null;

  return {
    id: event.id ?? "",
    title: event.summary ?? "(no title)",
    start,
    end,
    attendees:
      event.attendees
        ?.map((attendee) => attendee.email)
        .filter((email): email is string => Boolean(email)) ?? [],
    description: event.description ?? null,
  };
}

export async function fetchTodaysEvents(): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 48 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  return (response.data.items ?? [])
    .map(mapEvent)
    .filter((event): event is CalendarEvent => event != null);
}
