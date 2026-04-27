You are helping me build the Investor Morning Command Centre v0.1 — a read-only dashboard that ranks emails, shows Trading 212 portfolio state, and generates an AI morning briefing.

STACK
- Next.js 15 App Router, TypeScript, Tailwind
- SQLite via better-sqlite3 (file at ./data/cmdcentre.db)
- Zod for validation
- Anthropic SDK for Haiku (classification) and Sonnet (briefing)
- googleapis for Gmail
- Plain fetch for Trading 212

HARD RULES
- Read-only everywhere. No order placement on T212. No sending/deleting email. Gmail scope is gmail.readonly only.
- All secrets in .env.local. Never commit .env. Add to .gitignore on first commit.
- Every LLM call goes through a single helper in lib/llm.ts so I can swap models and log tokens.
- No agentic frameworks. No LangChain, LangGraph, Celery, Redis, Supabase. Plain TypeScript.

WHAT I WANT YOU TO DO IN THIS PROMPT (do not do anything beyond this list)

1. Create the Next.js project with TypeScript, Tailwind, App Router.

2. Install dependencies: better-sqlite3, @anthropic-ai/sdk, googleapis, zod. Dev deps: @types/better-sqlite3, tsx.

3. Create a CLAUDE.md at the project root. It must contain:
   - One-paragraph project summary
   - The hard rules above
   - The Item schema (designed in step 5 below)
   - The priority scoring formula
   - A "How to work on this repo" section saying: read this file first, prefer small focused changes, always write types first, never introduce new dependencies without asking me.

4. Create the folder structure:
   lib/
     llm.ts           (Anthropic SDK wrapper, both Haiku and Sonnet)
     db.ts            (SQLite connection + migrations)
     schema.ts        (Zod schemas and TS types)
     scoring.ts       (priority score calculation)
     trading212.ts    (T212 client, Basic Auth)
     gmail.ts         (Gmail client, OAuth)
     prompts/
       classify.ts    (email classifier prompt)
       briefing.ts    (morning briefing prompt)
   app/
     page.tsx         (dashboard — placeholder for now)
     api/
       sync/route.ts  (POST: pull fresh data from T212 + Gmail)
       classify/route.ts  (POST: run classifier on unclassified items)
       brief/route.ts (POST: generate today's briefing)
   data/              (SQLite lives here, gitignored)

5. Design the Item schema in lib/schema.ts. One Zod schema covers emails and portfolio events. Fields:
   - id (string, uuid)
   - source ("gmail" | "trading212")
   - source_id (original id from source system)
   - title (email subject, or "Position: AAPL" etc.)
   - body (email body or JSON-stringified portfolio event)
   - sender (email from, or "trading212")
   - timestamp (ISO string)
   - classified (boolean)
   - category (enum: portfolio, pipeline, admin, personal, newsletter, noise — nullable until classified)
   - urgency, financial_impact, relationship_importance, actionability, risk (all 1-10 ints, nullable until classified)
   - action_required (boolean, nullable)
   - suggested_action (string, nullable)
   - reasoning (string, nullable — why the classifier scored it this way)
   - priority_score (0-100 float, nullable until scored)
   - user_feedback ("important" | "noise" | null)
   - created_at, updated_at

6. Write the SQLite schema + migration in lib/db.ts. Three tables:
   - items (the Item schema above)
   - briefings (id, date, content, top_item_ids_json, created_at)
   - llm_calls (id, model, input_tokens, output_tokens, cost_usd, purpose, created_at) — for cost tracking

7. Write lib/scoring.ts with this exact formula:
   score = (0.30 * financial_impact + 0.25 * urgency + 0.20 * relationship_importance + 0.15 * actionability + 0.10 * risk) * 10
   Result is 0-100. Export calculateScore(item) and also calculateScoreWithWeights(item, weights) for the live-tuning panel later.

8. Write lib/llm.ts with two exports: classifyWithHaiku(prompt, input) and synthesiseWithSonnet(prompt, input). Both log to the llm_calls table with token counts. Use claude-haiku-4-5 and claude-sonnet-4-6 as model IDs. Read ANTHROPIC_API_KEY from env.

9. Create .env.local.example with all the keys I'll need:
   ANTHROPIC_API_KEY=
   T212_API_KEY=
   T212_API_SECRET=
   T212_BASE_URL=https://live.trading212.com/api/v0
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_REFRESH_TOKEN=

10. Initialise git, write a proper .gitignore (include .env*, data/, node_modules, .next). Commit with message "chore: project scaffold, schema, scoring, llm wrapper".

DO NOT in this prompt:
- Write the classifier prompt itself (that's prompt 2)
- Write the briefing prompt (that's prompt 2)
- Build the UI (that's prompt 3)
- Wire up T212 or Gmail logic (that's prompt 2)

When done, show me: the tree, the schema, and the scoring function.