Now build the data pipeline. Keep the same hard rules from CLAUDE.md.

WHAT I WANT YOU TO DO IN THIS PROMPT

1. Build lib/trading212.ts:
   - Basic Auth: base64(T212_API_KEY + ":" + T212_API_SECRET) in Authorization header
   - Three functions: getCash(), getPositions(), getRecentOrders(limit=20)
   - Endpoints: /equity/account/cash, /equity/positions, /equity/history/orders?limit=20
   - Return typed responses. Handle 401/429 gracefully with clear error messages.
   - Function syncPortfolioToItems() that fetches positions + overnight move, converts each notable position (move > 2% OR new order in last 24h) into an Item row, upserts into items table.

2. Build lib/gmail.ts:
   - Use googleapis with OAuth2 refresh token flow
   - Function fetchRecentEmails(limit=100) returns {id, from, subject, body, date}
   - Body: strip HTML, truncate to 2000 chars
   - Function syncEmailsToItems() that fetches and upserts into items table. Dedupe on source_id.

3. Write the classifier prompt in lib/prompts/classify.ts. This is the highest-leverage piece, get it right:

   SYSTEM PROMPT:
   "You classify items for a finance executive managing a public portfolio, a private PE book, and a deal pipeline. Return ONLY valid JSON, no prose, no markdown fences.

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
   - Auto-generated notifications with no action: category='noise', all scores 1-3"

   USER PROMPT TEMPLATE (function that takes an Item and returns the prompt string):
   "Item source: {source}
   From: {sender}
   Subject: {title}
   Date: {timestamp}
   Body:
   {body}"

4. Build lib/classifier.ts:
   - Function classifyUnprocessed() that selects all items where classified=0
   - For each, calls classifyWithHaiku, parses JSON (wrap in try/catch with one retry on bad JSON), writes all fields back to the row, sets classified=1
   - After each successful classify, call calculateScore and write priority_score
   - Process in batches of 10, sequential (not parallel — we're not rate-limit optimising for v0.1)

5. Write the briefing prompt in lib/prompts/briefing.ts:

   SYSTEM PROMPT:
   "You are a chief-of-staff preparing a morning briefing for a finance executive. Write in plain, direct British English. No corporate filler, no rhetorical questions, no em dashes, no bullet points inside prose. Three short paragraphs, then an 'Actions today' list of 3-5 items.

   Paragraph 1: What needs attention today. Lead with the single most important item.
   Paragraph 2: Portfolio state. Only mention moves > 2% or meaningful news.
   Paragraph 3: Inbox summary. Mention top 2-3 emails by priority, group the rest.

   Actions today: imperative, specific, each under 15 words. Include the item id in brackets so the executive can click through."

   USER PROMPT TEMPLATE takes: top 10 items (with scores and reasoning), portfolio snapshot (cash, total value, top 3 movers), and today's date. Format as structured text, not JSON.

6. Build lib/briefing.ts:
   - Function generateBriefing() that selects top 10 items by priority_score from last 24h, fetches portfolio snapshot, calls synthesiseWithSonnet, writes result to briefings table
   - Returns {content, top_item_ids, cost_usd}

7. Wire the three API routes:
   - POST /api/sync — calls syncPortfolioToItems + syncEmailsToItems, returns counts
   - POST /api/classify — calls classifyUnprocessed, returns count processed and total cost
   - POST /api/brief — calls generateBriefing, returns the briefing

8. Write a script scripts/run-pipeline.ts that runs all three in order and prints results. I'll run this with `npx tsx scripts/run-pipeline.ts` to test end-to-end.

9. Commit: "feat: data adapters, classifier, briefing pipeline"

DO NOT in this prompt:
- Build the UI (that's prompt 3)
- Add feedback buttons or weight sliders (that's prompt 3)
- Add seed data (that's prompt 3)

When done, show me: the classifier prompt, the briefing prompt, and the output of running the pipeline script against my actual data. I want to see real classifications before we build the UI.