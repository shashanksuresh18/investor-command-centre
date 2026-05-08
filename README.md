# Investor Command Centre

A local, read-only decision-support dashboard for a finance/investing workflow. It pulls signals from Trading 212, Gmail, Notion, Discord, and Google Calendar, classifies what matters, generates a morning briefing with Claude, and can send the latest briefing to WhatsApp via Twilio.

The current product structure separates source-native workflows instead of forcing everything into one ranked inbox:

- **Overview**: executive morning briefing, decisions today, portfolio alerts, communications requiring response, and calendar context.
- **Portfolio**: Trading 212 positions, concentration, moves versus average cost, and rule-based decision-support labels.
- **Gmail**: email-native triage grouped by action state.
- **Discord**: server/channel-aware community signal grouped by response posture.
- **Tasks**: Notion and derived actions in a board grouped by workflow lane.
- **Calendar**: today and tomorrow's meeting context.

This is decision support only. The portfolio recommendation engine is rule-based and explainable; it is not financial advice and does not place trades.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- SQLite via `better-sqlite3`
- Anthropic SDK for classification and briefing synthesis
- Google APIs for Gmail and Calendar
- Trading 212 REST API
- Notion SDK
- Discord REST API via `fetch`
- Twilio for WhatsApp delivery

## Architecture

The ingestion layer still stores all external signals in SQLite `items`, but the UI no longer treats every source as the same object. The view layer in `lib/workspace-queries.ts` maps raw items into product-specific models:

- `BriefingInsight`
- `Position`
- `PortfolioAlert`
- `EmailMessage`
- `DiscordMessage`
- `Task`
- `Meeting`
- `DecisionRecommendation`

Key files:

- `app/page.tsx` - Overview workspace.
- `app/portfolio/page.tsx` - Trading 212 portfolio intelligence.
- `app/gmail/page.tsx` - Gmail triage.
- `app/discord/page.tsx` - Discord triage.
- `app/tasks/page.tsx` - Decision/action board.
- `app/calendar/page.tsx` - Calendar context.
- `components/AppShell.tsx` - Shared navigation, controls, and layout shell.
- `lib/workspace-queries.ts` - Source-specific view models and rule-based portfolio support.
- `lib/classifier.ts` and `lib/prompts/classify.ts` - Source-routed classification.
- `lib/briefing.ts` and `lib/prompts/briefing.ts` - Morning briefing generation.
- `lib/whatsapp.ts` - WhatsApp truncation/cleaning and Twilio send.

## Local Setup

Install dependencies:

```bash
npm install
```

Copy the example environment file:

```bash
copy .env.local.example .env.local
```

Fill in the required keys in `.env.local`. Do not commit `.env.local`.

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

If port 3000 is occupied:

```bash
npm run dev -- -p 3001
```

## Environment Variables

Core:

```text
ANTHROPIC_API_KEY=
```

Trading 212:

```text
T212_API_KEY=
T212_API_SECRET=
T212_BASE_URL=https://live.trading212.com/api/v0
```

Google:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GMAIL_ACCOUNTS_JSON=
CALENDAR_REFRESH_TOKEN=
```

Notion:

```text
NOTION_API_KEY=
NOTION_TASKS_DATABASE_ID=
```

Discord:

```text
DISCORD_BOT_TOKEN=
DISCORD_GUILD_IDS=
DISCORD_CHANNEL_IDS=
DISCORD_INCLUDE_CHANNELS=
DISCORD_EXCLUDE_CHANNELS=
DISCORD_LOOKBACK_HOURS=24
```

WhatsApp / Twilio:

```text
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WHATSAPP_TO=whatsapp:+44XXXXXXXXXX
SEND_WHATSAPP=false
```

## Pipeline

Run the full local pipeline:

```bash
npx tsx --env-file=.env.local scripts/run-pipeline.ts
```

The pipeline:

1. Syncs Trading 212, Gmail, Notion, and Discord.
2. Classifies unprocessed items with Claude Haiku.
3. Generates the morning briefing with Claude Sonnet and calendar context.
4. Sends to WhatsApp only when `SEND_WHATSAPP=true`.

Recommended default while testing:

```bash
$env:SEND_WHATSAPP="false"; npx tsx --env-file=.env.local scripts/run-pipeline.ts
```

Send the latest briefing manually through the app:

```bash
curl -X POST http://localhost:3000/api/send-whatsapp
```

The WhatsApp sender strips raw markdown and short internal item IDs before delivery.

## Demo Flow

1. Run the pipeline so the database has fresh data:

   ```bash
   npx tsx --env-file=.env.local scripts/run-pipeline.ts
   ```

2. Start the app:

   ```bash
   npm run dev
   ```

3. Walk through:

   - **Overview**: show the executive briefing and top decisions.
   - **Portfolio**: show Trading 212 holdings, rule-based actions, and confidence explanations.
   - **Gmail**: show source-native email triage.
   - **Discord**: show server/channel context instead of flattened rows.
   - **Tasks**: show the action board.
   - **Calendar**: show meeting context.

4. Use **Send to WhatsApp** after confirming the latest briefing date is correct.

## Verification

Build:

```bash
npm run build
```

Check latest briefing row:

```bash
node --env-file=.env.local -e "const db=require('better-sqlite3')('data/cmdcentre.db'); console.table(db.prepare('SELECT date, created_at, length(content) as len FROM briefings ORDER BY date DESC, created_at DESC LIMIT 5').all())"
```

Check source counts:

```bash
node --env-file=.env.local -e "const db=require('better-sqlite3')('data/cmdcentre.db'); console.table(db.prepare(\"SELECT source, COUNT(*) as n, COUNT(CASE WHEN priority_score IS NOT NULL THEN 1 END) as scored FROM items GROUP BY source\").all())"
```

Check portfolio decision support:

```bash
npx tsx --env-file=.env.local -e "import { getPortfolioWorkspace } from './lib/workspace-queries'; (async()=>{ const p=await getPortfolioWorkspace(); console.table(p.positions.map(x=>({ticker:x.ticker, move:(x.unrealisedPLPct*100).toFixed(1)+'%', action:x.recommendation.action, confidence:x.recommendation.confidence}))); })();"
```

## Safety Notes

- The app is designed as read-only for external sources.
- Trading 212 integration reads cash, positions, and recent orders only.
- Gmail and Calendar use read-only OAuth scopes.
- Discord reads channels/messages only; bot messages are filtered before insertion.
- Notion tasks are synced into local SQLite and pre-scored from priority.
- WhatsApp delivery is opt-in through `SEND_WHATSAPP=true` or the manual API route.
- Secrets must stay in `.env.local`.

## Known Limitations

- Daily P/L is shown as unavailable on the Portfolio page unless a reliable daily price source is added. Current Trading 212 synced data supports move versus average cost, not true daily movement.
- Sector, geography, and thematic exposure are placeholders until holdings are enriched with reference data.
- Portfolio recommendation confidence is rule-based and should be read as review priority, not conviction.
- Demo mode currently has no seeded Notion or Discord rows.
