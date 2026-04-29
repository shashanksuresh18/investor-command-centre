const { google } = require('googleapis');

const cid = process.env.GOOGLE_CLIENT_ID;
const cs = process.env.GOOGLE_CLIENT_SECRET;

const raw = process.env.GMAIL_ACCOUNTS_JSON;
if (!raw) {
  console.error('GMAIL_ACCOUNTS_JSON not set in env');
  process.exit(1);
}

const accounts = JSON.parse(raw);

(async () => {
  for (const acc of accounts) {
    console.log('\n=== ' + acc.email + ' ===');
    const oauth2 = new google.auth.OAuth2(cid, cs);
    oauth2.setCredentials({ refresh_token: acc.refresh_token });

    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2 });
      const m = await gmail.users.messages.list({ userId: 'me', maxResults: 1 });
      console.log('Gmail OK:', m.data.messages ? m.data.messages.length + ' message(s)' : 'inbox empty');
    } catch (e) {
      console.error('Gmail FAIL:', e.message);
    }

    try {
      const calendar = google.calendar({ version: 'v3', auth: oauth2 });
      const c = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        maxResults: 5,
        singleEvents: true,
        orderBy: 'startTime'
      });
      console.log('Calendar events OK:', c.data.items.length + ' upcoming event(s)');
      c.data.items.forEach(e => console.log('  -', e.summary, '|', e.start.dateTime || e.start.date));
    } catch (e) {
      console.error('Calendar FAIL:', e.message);
    }
  }
})();
