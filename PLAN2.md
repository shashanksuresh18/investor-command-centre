# PLAN2 — Data pipeline task breakdown for Codex

Tasks are ordered by dependency. Complete each one before starting the next that depends on it.
Tasks 5 and 7 are flagged for Claude Code — see the bottom of this file.

---

## Task 1 — T212 typed HTTP fetch functions

**Files:** `lib/trading212.ts` (full rewrite of placeholder)

**Contract:**

```typescript
// Internal types (export all so downstream tasks can import)
export interface T212Cash {
  invested: number;
  result: number;
  total: number;
  free: number;
}

export interface T212Position {
  ticker: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  ppl: number;          // absolute profit/loss
  fxPpl: number;
}

export interface T212Order {
  id: string;
  ticker: string;
  status: string;
  filledValue: number;
  dateCreated: string;  // ISO string from T212
  dateModified: string;
}

export async function getCash(): Promise<T212Cash>
export async function getPositions(): Promise<T212Position[]>
export async function getRecentOrders(limit?: number): Promise<T212Order[]>
// default limit = 20
```

**Constraints:**
- Auth header: `Authorization: Basic <base64(T212_API_KEY + ":" + T212_API_SECRET)>`.
  Compute with `Buffer.from(...).toString("base64")` — no external dep.
- Base URL from `process.env.T212_BASE_URL` (e.g. `https://live.trading212.com/api/v0`).
- Endpoints:
  - `GET /equity/account/cash`
  - `GET /equity/positions`
  - `GET /equity/history/orders?limit={limit}`
- On HTTP 401 throw `new Error("T212: invalid API credentials (401)")`.
- On HTTP 429 throw `new Error("T212: rate limited (429) — retry after 30 s")`.
- On other non-2xx throw `new Error(\`T212: unexpected status \${res.status}\`)`.
- No new npm dependencies. Plain `fetch` only (Node 18+ built-in).
- Read-only. No POST/PUT/DELETE calls ever.
- Do not import from `lib/db.ts` in this task — that comes in Task 2.

---

## Task 2 — T212 syncPortfolioToItems

**Files:** `lib/trading212.ts` (add one export to the file from Task 1)

**Contract:**

```typescript
export async function syncPortfolioToItems(): Promise<{ upserted: number }>
```

**Constraints:**
- Calls `getPositions()` and `getRecentOrders()` (both already in this file).
- A position is "notable" if either condition is true:
  - `(currentPrice - averagePrice) / averagePrice` has absolute value > 0.02 (i.e. ≥ 2% move).
  - The ticker appears in any order where `dateCreated` is within the last 24 hours.
- For each notable position build an `Item` row:
  - `id`: `randomUUID()` (from Node `crypto`).
  - `source`: `"trading212"`.
  - `source_id`: the position's `ticker`.
  - `title`: `"Position: {ticker}"`.
  - `body`: `JSON.stringify({ position, recentOrders: [matching orders] })`.
  - `sender`: `"trading212"`.
  - `timestamp`: `new Date().toISOString()`.
  - `classified`: `0` (false in SQLite).
  - All classifier fields (`category`, `urgency`, …, `priority_score`): `null`.
  - `user_feedback`: `null`.
  - `created_at` / `updated_at`: `new Date().toISOString()`.
- Upsert SQL (the items table has `UNIQUE(source, source_id)`):
  ```sql
  INSERT INTO items (...) VALUES (...)
  ON CONFLICT(source, source_id) DO UPDATE SET
    body = excluded.body,
    timestamp = excluded.timestamp,
    updated_at = excluded.updated_at
  ```
- Return `{ upserted: db.prepare(...).run(...).changes }` summed across all positions.
- Import `db` from `"./db"` and `randomUUID` from `"crypto"`.
- Do not touch any classifier fields — those are Task 6's job.

---

## Task 3 — Gmail fetchRecentEmails

**Files:** `lib/gmail.ts` (full rewrite of placeholder)

**Contract:**

```typescript
export interface EmailSummary {
  id: string;       // Gmail message ID
  from: string;
  subject: string;
  body: string;     // plain text, stripped, truncated to 2000 chars
  date: string;     // ISO string
}

export async function fetchRecentEmails(limit?: number): Promise<EmailSummary[]>
// default limit = 100
```

**Constraints:**
- Use `googleapis` (`google.auth.OAuth2` + `gmail.users.messages`).
  - Auth: `OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)` then
    `oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })`.
  - All three env vars from `process.env`.
- `gmail.readonly` scope only — never request a broader scope.
- Fetch message list with `q: "in:inbox"` and `maxResults: limit`.
- For each message ID, fetch full message with `format: "full"`.
- Extract body:
  1. Prefer `parts` where `mimeType === "text/plain"`.
  2. Fall back to `parts` where `mimeType === "text/html"`.
  3. Decode from base64url: `Buffer.from(data, "base64").toString("utf-8")`.
  4. Strip HTML tags with a single regex replace: `text.replace(/<[^>]*>/g, " ")`.
  5. Collapse whitespace: `.replace(/\s+/g, " ").trim()`.
  6. Truncate to 2000 characters.
- Extract `from`, `subject`, `date` from `message.payload.headers`.
  Parse `date` header to ISO string via `new Date(headerValue).toISOString()`.
- No new npm dependencies beyond `googleapis` (already installed).
- Do not import from `lib/db.ts` in this task.

---

## Task 4 — Gmail syncEmailsToItems

**Files:** `lib/gmail.ts` (add one export to the file from Task 3)

**Contract:**

```typescript
export async function syncEmailsToItems(): Promise<{ upserted: number }>
```

**Constraints:**
- Calls `fetchRecentEmails(100)`.
- For each `EmailSummary` build an `Item` row:
  - `id`: `randomUUID()`.
  - `source`: `"gmail"`.
  - `source_id`: the Gmail message `id`.
  - `title`: `subject`.
  - `body`: the stripped/truncated body string.
  - `sender`: `from`.
  - `timestamp`: the parsed `date` (ISO string).
  - `classified`: `0`.
  - All classifier and score fields: `null`.
  - `created_at` / `updated_at`: `new Date().toISOString()`.
- Upsert SQL — skip silently if `source_id` already exists (dedupe rule):
  ```sql
  INSERT INTO items (...) VALUES (...)
  ON CONFLICT(source, source_id) DO NOTHING
  ```
- Return `{ upserted: totalChanges }` (sum `.changes` across all runs).
- Import `db` from `"./db"` and `randomUUID` from `"crypto"`.

---

## Task 5 — Classifier prompt ⬅ DO IN CLAUDE CODE (see bottom)

---

## Task 6 — Classifier runner

**Files:** `lib/classifier.ts` (new file)

**Depends on:** Task 5 complete (prompt exports must exist).

**Contract:**

```typescript
export async function classifyUnprocessed(): Promise<{ processed: number; cost_usd: number }>
```

**Constraints:**
- Query: `SELECT * FROM items WHERE classified = 0 ORDER BY timestamp DESC`.
- Process in batches of 10, **sequential** (no `Promise.all`).
- For each item:
  1. Call `classifyWithHaiku(CLASSIFY_SYSTEM_PROMPT, buildClassifyUserPrompt(item), "classify")`.
     Both are imported from `lib/llm.ts` and `lib/prompts/classify.ts`.
  2. `JSON.parse()` the response string.
     - If parse throws, retry **once** (call `classifyWithHaiku` again).
     - If the retry also throws, `console.error` the item id and continue to next item.
  3. On success, write these columns back to the row:
     ```sql
     UPDATE items SET
       category = ?, urgency = ?, financial_impact = ?,
       relationship_importance = ?, actionability = ?, risk = ?,
       action_required = ?, suggested_action = ?, reasoning = ?,
       classified = 1, updated_at = ?
     WHERE id = ?
     ```
  4. Immediately after, call `calculateScore(updatedItem)` (from `lib/scoring.ts`).
     If the result is not null, write `priority_score` and `updated_at` in a second
     `UPDATE items SET priority_score = ?, updated_at = ? WHERE id = ?`.
- Track `processed` count (items successfully classified) and running `cost_usd`.
- To get `cost_usd`: after the Haiku call, query
  `SELECT SUM(cost_usd) as total FROM llm_calls WHERE purpose = 'classify'`
  before and after processing; diff the two values.
  (Simpler alternative: query `SELECT cost_usd FROM llm_calls ORDER BY rowid DESC LIMIT 1`
  after each call and accumulate.)
- Imports: `db` from `"./db"`, `classifyWithHaiku` from `"./llm"`,
  `CLASSIFY_SYSTEM_PROMPT, buildClassifyUserPrompt` from `"./prompts/classify"`,
  `calculateScore` from `"./scoring"`.
- No new dependencies.

---

## Task 7 — Briefing prompt ⬅ DO IN CLAUDE CODE (see bottom)

---

## Task 8 — Briefing runner

**Files:** `lib/briefing.ts` (new file)

**Depends on:** Tasks 2, 6, and 7 complete.

**Contract:**

```typescript
export interface BriefingResult {
  content: string;
  top_item_ids: string[];
  cost_usd: number;
}

export async function generateBriefing(): Promise<BriefingResult>
```

**Constraints:**
- Fetch top 10 items from last 24 h:
  ```sql
  SELECT * FROM items
  WHERE timestamp >= ? AND priority_score IS NOT NULL
  ORDER BY priority_score DESC
  LIMIT 10
  ```
  where `?` = `new Date(Date.now() - 86_400_000).toISOString()`.
- Fetch portfolio snapshot:
  - Call `getCash()` and `getPositions()` (imported from `"./trading212"`).
  - `topMovers`: top 3 positions by absolute `ppl`, each as
    `{ ticker, pctMove: (currentPrice - averagePrice) / averagePrice }`.
  - Only include movers with `Math.abs(pctMove) > 0.02`.
- Call `synthesiseWithSonnet(BRIEFING_SYSTEM_PROMPT, buildBriefingUserPrompt(items, portfolio, today), "briefing")`.
  - `today = new Date().toISOString().slice(0, 10)`.
- Note the time just before the Sonnet call. After it returns, query:
  ```sql
  SELECT COALESCE(SUM(cost_usd), 0) as cost FROM llm_calls
  WHERE purpose = 'briefing' AND created_at >= ?
  ```
  to retrieve this call's cost.
- Upsert into briefings table:
  ```sql
  INSERT INTO briefings (id, date, content, top_item_ids_json, created_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(date) DO UPDATE SET
    content = excluded.content,
    top_item_ids_json = excluded.top_item_ids_json
  ```
  `top_item_ids_json = JSON.stringify(items.map(i => i.id))`.
- Return `{ content, top_item_ids: items.map(i => i.id), cost_usd }`.
- Imports: `db` from `"./db"`, `synthesiseWithSonnet` from `"./llm"`,
  `BRIEFING_SYSTEM_PROMPT, buildBriefingUserPrompt` from `"./prompts/briefing"`,
  `getCash, getPositions` from `"./trading212"`,
  `randomUUID` from `"crypto"`.

---

## Task 9 — Wire the three API routes

**Files:**
- `app/api/sync/route.ts` (rewrite placeholder)
- `app/api/classify/route.ts` (rewrite placeholder)
- `app/api/brief/route.ts` (rewrite placeholder)

**Depends on:** Tasks 2, 4, 6, 8 complete.

**Contract — each file exports only a POST handler:**

```typescript
// app/api/sync/route.ts
export async function POST(): Promise<NextResponse>
// Success 200: { portfolio: number, emails: number }
// Error   500: { error: string }

// app/api/classify/route.ts
export async function POST(): Promise<NextResponse>
// Success 200: { processed: number, cost_usd: number }
// Error   500: { error: string }

// app/api/brief/route.ts
export async function POST(): Promise<NextResponse>
// Success 200: { content: string, top_item_ids: string[], cost_usd: number }
// Error   500: { error: string }
```

**Constraints:**
- Wrap each handler body in `try/catch`; return `NextResponse.json({ error: err.message }, { status: 500 })` on failure.
- `POST /api/sync` runs `syncPortfolioToItems()` then `syncEmailsToItems()` in sequence
  (portfolio first, email second). Return `{ portfolio: r1.upserted, emails: r2.upserted }`.
- `POST /api/classify` calls `classifyUnprocessed()` and returns its result directly.
- `POST /api/brief` calls `generateBriefing()` and returns its result directly.
- Import functions from `lib/` using `@/lib/...` alias.
- No request body parsing needed for any route.

---

## Task 10 — Pipeline script

**Files:** `scripts/run-pipeline.ts` (new file — also create `scripts/` directory)

**Depends on:** Task 9 complete (routes exist; script calls lib functions directly, not HTTP).

**Contract:** No exports. A top-level async IIFE or `main()` call.

```typescript
// Pseudocode of what the script must print:
// [1/3] Syncing data sources...
//   Portfolio items upserted: N
//   Email items upserted: N
// [2/3] Classifying items...
//   Processed: N items   Cost: $X.XXXX
// [3/3] Generating briefing...
//   Cost: $X.XXXX
//
// ━━━ MORNING BRIEFING ━━━
// {content}
// ━━━ TOP ITEMS ━━━
// {top_item_ids joined by newline}
```

**Constraints:**
- Import directly from `lib/trading212`, `lib/gmail`, `lib/classifier`, `lib/briefing`
  (not via HTTP fetch — this is a local script).
- Load env vars at the top of the file:
  ```typescript
  import { config } from "dotenv";
  config({ path: ".env.local" });
  ```
  This requires `dotenv` — check `package.json` first. If not present, note it as a
  **required addition** in the task output (do not silently `npm install` — flag it for
  the user to approve per CLAUDE.md's "no new deps without asking" rule).
  Alternative if dotenv unavailable: document that the script must be run with
  `node --env-file=.env.local` prefix.
- Wrap everything in `try/catch`; print the error and `process.exit(1)` on failure.
- Run with: `npx tsx scripts/run-pipeline.ts`

---

## Task 11 — Commit

**Files:** all modified/created files from Tasks 1–10 plus `scripts/`.

**Contract:** Git commit with the exact message from PROMPT2.md:
```
feat: data adapters, classifier, briefing pipeline
```

**Constraints:**
- Stage only tracked source files. Do not stage `.env.local`, `data/`, or `node_modules/`.
- Verify `.gitignore` covers `data/` and `.env*` before committing (it already does from PROMPT1).

---

## Tasks to do in Claude Code instead of Codex

### Task 5 — `lib/prompts/classify.ts`

**Why Claude Code:** The classifier prompt is the highest-leverage piece in the pipeline.
Getting the scoring guidance right (calibrating the 1–10 scales, the category rules,
the finance-executive persona) requires iterative judgment, not mechanical code generation.
Codex will produce syntactically correct code but cannot reason about whether urgency=7
is the right call for an LP email vs a newsletter.

**Files:** `lib/prompts/classify.ts`

**Contract to implement:**

```typescript
import type { Item } from "../schema";

export const CLASSIFY_SYSTEM_PROMPT: string
// Full system prompt as specified in PROMPT2.md §3, with all scoring guidance included verbatim.

export function buildClassifyUserPrompt(item: Item): string
// Returns:
// "Item source: {item.source}\nFrom: {item.sender}\nSubject: {item.title}\nDate: {item.timestamp}\nBody:\n{item.body}"
```

**Constraints:**
- System prompt must instruct the model to return **only valid JSON** with no prose or markdown fences.
- JSON schema in the prompt must exactly match the fields that Task 6 will parse:
  `category`, `urgency`, `financial_impact`, `relationship_importance`, `actionability`,
  `risk`, `action_required`, `suggested_action`, `reasoning`.
- All scoring guidance from PROMPT2.md §3 must be included verbatim in the system prompt.
- No runtime logic beyond string interpolation in `buildClassifyUserPrompt`.

---

### Task 7 — `lib/prompts/briefing.ts`

**Why Claude Code:** The briefing prompt defines the voice, structure, and editorial
judgement of the output the user reads every morning. The style constraints (British English,
no em dashes, no bullet points in prose, specific paragraph order, ≤15-word action items)
need careful prompt construction and are worth getting right before the UI is built.

**Files:** `lib/prompts/briefing.ts`

**Contract to implement:**

```typescript
import type { Item } from "../schema";

export const BRIEFING_SYSTEM_PROMPT: string
// Full system prompt as specified in PROMPT2.md §5.

export interface PortfolioSnapshot {
  cash: number;
  totalValue: number;
  topMovers: Array<{ ticker: string; pctMove: number }>;
}

export function buildBriefingUserPrompt(
  items: Item[],
  portfolio: PortfolioSnapshot,
  date: string          // "YYYY-MM-DD"
): string
// Returns structured plain text (not JSON) containing:
//   - Today's date
//   - Top items (id, title, sender, priority_score, category, reasoning, suggested_action)
//   - Portfolio snapshot (cash, totalValue, each mover with pctMove formatted as ±X.X%)
```

**Constraints:**
- System prompt must be included verbatim from PROMPT2.md §5 with no paraphrasing.
- `buildBriefingUserPrompt` must format `pctMove` as `+2.3%` / `-1.1%` (sign always shown).
- Item ids must appear in the user prompt so the model can include them in the Actions list.
- No runtime logic beyond formatting — no LLM calls inside this file.
