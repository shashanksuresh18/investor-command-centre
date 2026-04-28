# PLAN3 — Dashboard UI, feedback, weights, validation, deploy

Tasks are ordered by dependency. Each task is self-contained enough for a single agent run.
Tool assignments are at the bottom.

---

## Task 1 — DB migration: add `seed` column to items

**Files:** `lib/db.ts` (edit — add one migration block after the existing `db.exec`)

**Contract:**
```typescript
// Append after the existing db.exec block:
try {
  db.exec("ALTER TABLE items ADD COLUMN seed INTEGER NOT NULL DEFAULT 0");
} catch {
  // column already exists on subsequent starts — safe to ignore
}
```

**Constraints:**
- SQLite has no `ADD COLUMN IF NOT EXISTS`. The try/catch is the standard idempotent pattern.
- Seed items use `source='gmail'` (the existing CHECK constraint only allows `'gmail'|'trading212'`; do NOT add `'seed'` as a new source value — differentiate via this column instead).
- `seed=0` is the default for all live items. `seed=1` is set only by the seed script.
- No changes to `lib/schema.ts` or Zod — the seed flag is an internal DB concern.

---

## Task 2 — `lib/dashboard-queries.ts` (new file)

**Files:** `lib/dashboard-queries.ts`

**Contract:**
```typescript
import type { Item } from "./schema";

export interface PortfolioItem {
  ticker: string;
  currentPrice: number;
  averagePricePaid: number;
  pctMove: number;                  // (currentPrice - averagePricePaid) / averagePricePaid
  unrealizedProfitLoss: number;
  currentValue: number;
}

export interface TodayCost {
  cost_usd: number;                 // SUM from llm_calls WHERE created_at >= today 00:00
  classification_count: number;    // COUNT WHERE purpose='classify'
  briefing_count: number;          // COUNT WHERE purpose='briefing'
}

export interface DashboardData {
  briefing: { content: string; created_at: string } | null;
  topItems: Item[];                 // top 10 by priority_score DESC, seed=0 (or seed=1 in demo)
  rankedInbox: Item[];              // rank 11–30 by same ordering
  portfolioItems: PortfolioItem[];  // parsed from items WHERE source='trading212'
  todayCost: TodayCost;
}

export function getDashboardData(demoMode: boolean): DashboardData
```

**Implementation notes:**
- `briefing`: `SELECT * FROM briefings ORDER BY date DESC LIMIT 1`.
- `topItems` + `rankedInbox`: single query `SELECT * FROM items WHERE seed=? AND priority_score IS NOT NULL ORDER BY priority_score DESC LIMIT 30`; slice `[0,10]` and `[10,30]` in JS. Pass `demoMode ? 1 : 0` as the bind value.
- `portfolioItems`: `SELECT body FROM items WHERE source='trading212' AND seed=0 ORDER BY updated_at DESC`. Parse each `body` via `JSON.parse(body).position`, compute `pctMove`, return top 3 sorted by `Math.abs(pctMove) DESC`.
- `todayCost`: query `llm_calls` with `DATE(created_at) = DATE('now')`.
- This function runs **server-side only** (imports `db` from `./db`). Mark with a `"use server"` comment at the top if needed, or just ensure it is never imported by a Client Component.

---

## Task 3 — `lib/stats.ts` (new file)

**Files:** `lib/stats.ts`

**Contract:**
```typescript
// Spearman rank correlation: accepts two equal-length arrays of numbers.
// Returns NaN if fewer than 2 paired points.
export function spearmanCorrelation(x: number[], y: number[]): number
```

**Algorithm:**
1. Rank each array (average ranks for ties).
2. Compute Pearson correlation of the two rank arrays using the standard formula.
3. Return value in [−1, 1].

**Constraints:** No new dependencies. Pure TypeScript.

---

## Task 4 — `app/api/feedback/route.ts` (new file)

**Files:** `app/api/feedback/route.ts`

**Contract:**
```typescript
// PATCH /api/feedback
// Body:   { itemId: string; feedback: "important" | "noise" | null }
// 200:    { ok: true }
// 400:    { error: string }  — missing itemId, invalid feedback value
// 404:    { error: string }  — item not found
export async function PATCH(req: Request): Promise<NextResponse>
```

**Implementation:**
```sql
UPDATE items SET user_feedback = ?, updated_at = ? WHERE id = ?
```
Accept `null` to clear a previous label. Validate `feedback` is one of `'important' | 'noise' | null` before writing.

---

## Task 5 — `app/api/weights/route.ts` (new file)

**Files:** `app/api/weights/route.ts`

**Contract:**
```typescript
// POST /api/weights
// Body:   { financial_impact: number; urgency: number;
//           relationship_importance: number; actionability: number; risk: number }
// 200:    { updated: number }          — count of rows whose score changed
// 400:    { error: string }            — weights don't sum to 1.00 (±0.001 tolerance)
export async function POST(req: Request): Promise<NextResponse>
```

**Implementation:**
1. Validate sum ≈ 1.00.
2. `SELECT id, urgency, financial_impact, relationship_importance, actionability, risk FROM items WHERE classified = 1`.
3. For each row: `calculateScoreWithWeights(row, weights)` (import from `@/lib/scoring`).
4. Batch-update `priority_score` and `updated_at` where the new score differs.
5. Return `{ updated }`.

**Constraints:** Only touches `priority_score`. Does not re-run the classifier. Does not save the weights to the DB — they live only in the client until the user explicitly refreshes.

---

## Task 6 — `app/api/validation/route.ts` (new file)

One file with two handlers to keep the route tree flat.

**Files:** `app/api/validation/route.ts`

**Contract:**
```typescript
// POST /api/validation
// Body:   { action: "seed" }
//   → loads validation.json into items (seed=1), upserts by source_id='seed-{i}'
//   → 200: { seeded: number }
//
// POST /api/validation
// Body:   { action: "run" }
//   → calls classifyUnprocessed() (which now handles seed items too since seed items start as classified=0)
//   → reads back all seed items with priority_score
//   → loads validation.json to get my_label for each seed-{i}
//   → computes spearmanCorrelation(myLabels, systemScores)
//   → 200: { processed: number; correlation: number;
//            points: Array<{ myLabel: number; systemScore: number; subject: string }> }
//
// 400: { error: string }
export async function POST(req: Request): Promise<NextResponse>
```

**Implementation notes:**
- Seed upsert SQL: `INSERT INTO items (..., seed) VALUES (..., 1) ON CONFLICT(source, source_id) DO UPDATE SET body=excluded.body, classified=0, priority_score=NULL, updated_at=excluded.updated_at` — resetting `classified=0` on re-seed so they can be re-classified.
- After "run", only return seed items: `SELECT source_id, priority_score FROM items WHERE seed=1 AND priority_score IS NOT NULL`.
- Match to `my_label` by `source_id = 'seed-{i}'` where `i` is the index in validation.json.

---

## Task 7 — `scripts/seed-validation.ts` (new file)

**Files:** `scripts/seed-validation.ts`

**Contract:** No exports. CLI script.

```
npx tsx --env-file=.env.local scripts/seed-validation.ts
```

Behaviour:
1. Load `seed-data/validation.json`.
2. Insert each entry as an item with `source='gmail'`, `source_id='seed-{i}'`, `seed=1`, `classified=0`, `priority_score=null`.
3. Print `Seeded N items`.

**Constraints:** Duplicate runs must be idempotent (use the same upsert SQL from Task 6). Shares `lib/db.ts` directly — no HTTP calls.

---

## Task 8 — `seed-data/validation.json` (new file)

**Files:** `seed-data/validation.json`

**Schema per entry:**
```jsonc
{
  "from": "First Last <email@domain.com>",
  "subject": "...",
  "body": "...",         // 3–10 sentences, realistic content
  "my_label": 1          // integer 1–10
}
```

**Required mix (20 items total):**

| Count | Type | `my_label` range | Notes |
|-------|------|-----------------|-------|
| 3 | LP updates | 9–10 | From named LPs; mention fund performance, capital calls, or quarterly reports |
| 2 | Board matters | 9–10 | Board pack requests, resolutions requiring sign-off |
| 4 | Founder pitches | 5–7 | Plausible company names, decks attached, some follow-ups |
| 3 | Admin / calendar | 3–5 | Expense reports, meeting invites with real dates |
| 4 | Newsletters | 1–2 | FT, Sifted, Axios Pro, one VC newsletter |
| 2 | Auto-notifications | 1 | DocuSign completion, Xero invoice, no action needed |
| 2 | Personal | 4–6 | From plausible names (not "John Smith"), casual tone |

**Constraints:**
- No fictional company names like "Example Corp" or "Acme Inc". Use plausible names (Pemberton Capital, Thornfield Ventures, etc.).
- Use realistic email domains (not @example.com).
- `body` must be long enough (~100–300 words) to give the classifier real signal.

---

## Task 9 — `app/components/RefreshButton.tsx` (new file)

**Files:** `app/components/RefreshButton.tsx`

**Contract:**
```typescript
"use client";
// Props: none
// State: { stage: "idle" | "syncing" | "classifying" | "briefing" | "done" | "error"; error?: string }
export default function RefreshButton(): JSX.Element
```

**Behaviour:**
1. On click: POST `/api/sync` → POST `/api/classify` → POST `/api/brief`, in sequence.
2. Update `stage` after each step (show a text label: "Syncing…", "Classifying…", "Generating briefing…").
3. On completion: call `router.refresh()` (from `next/navigation`) to re-render the Server Component.
4. On any error: set `stage='error'`, show the error message, re-enable the button.

**Styling:** Tailwind only. While running, show a subtle animated pulse or spinner. Never disable the button for more than the duration of the operation.

---

## Task 10 — `app/components/FeedbackButtons.tsx` (new file)

**Files:** `app/components/FeedbackButtons.tsx`

**Contract:**
```typescript
"use client";
interface Props {
  itemId: string;
  initialFeedback: "important" | "noise" | null;
}
export default function FeedbackButtons(props: Props): JSX.Element
// State: { feedback: "important" | "noise" | null; saving: boolean }
```

**Behaviour:**
- Two buttons: "Important" and "Noise".
- On click: optimistic update (set local state immediately), then `PATCH /api/feedback`.
- Clicking an already-active button sends `feedback: null` to clear it.
- Visual states (Tailwind):
  - `important` active: solid green background (`bg-green-600 text-white`).
  - `noise` active: solid slate background (`bg-slate-600 text-white`).
  - Inactive: outline only (`border border-gray-600 text-gray-400`).
  - Saving: reduced opacity (`opacity-50 pointer-events-none`).

---

## Task 11 — `app/components/WeightsPanel.tsx` (new file)

**Files:** `app/components/WeightsPanel.tsx`

**Contract:**
```typescript
"use client";
// Props: none
// State: {
//   open: boolean;
//   weights: ScoreWeights;   // import ScoreWeights from "@/lib/scoring"
//   applying: boolean;
// }
export default function WeightsPanel(): JSX.Element
```

**Behaviour:**
- Toggle button (top-right of header): "Weights ▾" / "Weights ▴".
- When open: panel slides down (or just appears) with 5 labelled sliders.
  - `<input type="range" min="0" max="1" step="0.01">`
  - Each slider shows its current value as a percentage (e.g. "30%").
  - Live sum shown below all sliders: "Sum: 1.00 ✓" (green) or "Sum: 0.97 ✗" (red border on panel).
- "Apply" button:
  - Disabled if sum ≠ 1.00.
  - On click: `POST /api/weights` → on success `router.refresh()` → set `applying=false`.
- "Reset" link: resets to default weights without calling the API.

**Default weights:** `{ financial_impact: 0.30, urgency: 0.25, relationship_importance: 0.20, actionability: 0.15, risk: 0.10 }`.

**Constraints:** Sum tolerance for "Apply" enable/disable is ±0.005 to account for slider float rounding.

---

## Task 12 — `app/components/DemoToggle.tsx` (new file)

**Files:** `app/components/DemoToggle.tsx`

**Contract:**
```typescript
"use client";
// Props: { demoMode: boolean }
export default function DemoToggle({ demoMode }: { demoMode: boolean }): JSX.Element
```

**Behaviour:**
- Reads `demoMode` prop (passed from Server Component via `searchParams.demo === 'true'`).
- On toggle: `router.push(demoMode ? '/' : '/?demo=true')`.
- Visual: pill toggle. `LIVE` = green dot + green label. `DEMO` = amber dot + amber label.
- Constraint: label must be unambiguous — "DEMO DATA" / "LIVE DATA" in small caps, never just "on/off".

---

## Task 13 — `app/components/ScatterPlot.tsx` (new file)

**Files:** `app/components/ScatterPlot.tsx`

**Contract:**
```typescript
"use client";
interface Point { myLabel: number; systemScore: number; subject: string }
interface Props {
  points: Point[];
  correlation: number;
}
export default function ScatterPlot({ points, correlation }: Props): JSX.Element
```

**Implementation:** SVG-only, no charting library.
- `viewBox="0 0 400 300"`, responsive via `width="100%" height="auto"`.
- X-axis: my_label 1–10. Y-axis: system score 0–100.
- Each point: `<circle r="4">` with `<title>{subject}</title>` for hover tooltip.
- Axis labels + tick marks (every 2 on X, every 20 on Y).
- Correlation coefficient displayed as large text above the chart: "r = 0.73" coloured green if ≥0.6, amber if 0.4–0.59, red if <0.4.
- **No new dependencies.**

---

## Task 14 — `app/page.tsx` (full rewrite)

**Files:** `app/page.tsx`

**Contract:**
```typescript
// Server Component — no "use client"
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}): Promise<JSX.Element>
```

**Layout (Tailwind, dark theme `bg-gray-950 text-gray-100`):**

```
┌─────────────────────────────────────────────────────────┐
│ HEADER                                                  │
│  [DemoToggle]  Morning Command Centre  {date}  [Refresh]│
│                                        [Weights ▾]      │
│  [WeightsPanel — collapsible, full width]               │
├─────────────────────────────────────────────────────────┤
│ § MORNING BRIEFING                                      │
│  {briefing.content rendered as whitespace-pre-line}     │
│  OR "No briefing yet. Click Refresh."                   │
├─────────────────────────────────────────────────────────┤
│ § TOP PRIORITY (top 10)                                 │
│  [score] [source] [sender] [title] [category] [Why?]   │
│  [Important] [Noise]   ← FeedbackButtons per row        │
├─────────────────────────────────────────────────────────┤
│ § PORTFOLIO WATCH                                       │
│  Total: £X,XXX  Cash: £X,XXX                           │
│  Movers: TICK +2.3%  TICK -4.1%  TICK +1.8%            │
├─────────────────────────────────────────────────────────┤
│ § RANKED INBOX (items 11–30)                            │
│  same row format as Top Priority                        │
├─────────────────────────────────────────────────────────┤
│ § NEXT MODULES (greyed out)                             │
│  [Notion CRM] [Slack] [Google Calendar] [Private Cos]   │
├─────────────────────────────────────────────────────────┤
│ FOOTER  Today's AI cost: $0.13 (78 classifications,    │
│         1 briefing)                                     │
└─────────────────────────────────────────────────────────┘
```

**Score colour rules:**
- `>= 80`: `text-red-400 font-bold`
- `60–79`: `text-amber-400 font-bold`
- `< 60`: `text-gray-400`

**"Why" tooltip:** render as `title` attribute on a `?` icon span: `<span title={item.reasoning}>?</span>`. No JS needed.

**Briefing rendering:** Wrap in `<div className="whitespace-pre-line leading-relaxed">`. This preserves paragraph breaks and renders `**bold**` as literal asterisks, which is acceptable for v0.1. (If markdown rendering is wanted, flag it for explicit dep approval.)

**Data flow:** Call `getDashboardData(demoMode)` at the top of the async component. Pass `demoMode` down as a prop to `DemoToggle`. No API calls in this file — data comes from `getDashboardData` only.

**Constraints:**
- No `"use client"` on this file.
- No component library, no icon library.
- `RefreshButton`, `WeightsPanel`, `DemoToggle`, `FeedbackButtons` are all Client Components — import them normally; Next.js handles the boundary.

---

## Task 15 — `app/validation/page.tsx` (new file)

**Files:** `app/validation/page.tsx`, `app/validation/ValidationClient.tsx`

Split into two because the chart and button interactions require a Client Component:

```typescript
// app/validation/page.tsx — Server Component
export default async function ValidationPage(): Promise<JSX.Element>
// Fetches existing seed results (if any) from DB and passes as initialData to client

// app/validation/ValidationClient.tsx — Client Component
"use client";
interface Props {
  initialPoints: Array<{ myLabel: number; systemScore: number; subject: string }>;
  initialCorrelation: number | null;
}
export default function ValidationClient(props: Props): JSX.Element
```

**Page layout:**
- Title: "Validation — Spearman Correlation Test"
- Button: "Load 20 seed emails & run classifier" → `POST /api/validation` `{action:'seed'}` then `POST /api/validation` `{action:'run'}`.
- Status message during run.
- After run: show `ScatterPlot` + "Correlation: r = X.XX" in large text.
- Note below chart: "Target ≥ 0.60. Above this, system rankings agree with human judgement on majority of items."

---

## Task 16 — Vercel deployment ⚠ SQLite blocker

**Files:** `vercel.json` (new), `README.md` (optional update)

**Constraint — read before attempting:** `better-sqlite3` is a native Node addon that writes to the local filesystem. Vercel's serverless functions have an **ephemeral** filesystem: writes do not persist across invocations. The pipeline (sync, classify, brief) will appear to work but each invocation will start with an empty DB.

**Options (pick one before executing):**

| Option | Effort | Notes |
|--------|--------|-------|
| A. Switch SQLite to **Turso** (libsql cloud) | Medium | Drop-in for most queries; needs `@libsql/client` replacing `better-sqlite3`; Vercel works fine |
| B. Deploy to **Railway / Render / Fly.io** | Low | Persistent disk; no code changes needed |
| C. Skip cloud deploy for v0.1; demo locally | Zero | Add `npm run dev` to DEMO.md; revisit in v0.2 |

**If Option B (Railway) is chosen:**
- `railway.json` or `Procfile`: `web: npm start`
- `next.config.ts`: already clean, no changes needed
- Set all env vars in Railway dashboard

**If Vercel is required regardless:**
```json
// vercel.json
{
  "buildCommand": "next build",
  "outputDirectory": ".next",
  "env": {
    "ANTHROPIC_API_KEY": "@anthropic-api-key",
    "T212_API_KEY": "@t212-api-key",
    "T212_API_SECRET": "@t212-api-secret",
    "T212_BASE_URL": "@t212-base-url",
    "GOOGLE_CLIENT_ID": "@google-client-id",
    "GOOGLE_CLIENT_SECRET": "@google-client-secret",
    "GOOGLE_REFRESH_TOKEN": "@google-refresh-token"
  }
}
```
Add `NEXTAUTH_URL` and `NEXTAUTH_SECRET` if OAuth redirects are needed from the deployed domain.

---

## Task 17 — `DEMO.md` (new file)

**Files:** `DEMO.md`

**Required sections:**
1. **5-minute demo script** — step-by-step: what to click, what to say, in what order. Written for someone unfamiliar with the system (i.e., Zaid). Include the weights-tuning moment as the centrepiece.
2. **Architecture diagram** (ASCII) — showing: Gmail → sync → SQLite → classifier (Haiku) → scorer → briefing (Sonnet) → Next.js dashboard → browser.
3. **Roadmap v0.1 → v0.4** — four milestones, each one paragraph.
4. **Cost table** — daily / monthly / scaled (100 items/day vs 1000 items/day). Based on actual token counts from the pipeline run.
5. **Security posture** — read-only T212, `gmail.readonly` scope, local SQLite, no data persistence outside Anthropic API calls, no credentials in repo.

---

## Task 18 — Commit

**Files:** all modified/new files from Tasks 1–17.

**Commit message** (exact, from PROMPT3.md):
```
feat: dashboard UI, feedback, weights tuning, validation, demo polish
```

**Constraints:**
- Do not stage `data/`, `.env.local`, `node_modules/`.
- Verify the `seed-data/` directory is **not** in `.gitignore` (it's safe to commit — contains no secrets).

---

## Tool assignments

### Gemini CLI — Tailwind-heavy UI components

These tasks require careful visual layout, Tailwind class choices, and SVG work. Gemini's context window handles long component files well and it is strong on UI structure.

| Task | Reason |
|------|--------|
| **Task 9** — `RefreshButton.tsx` | Client component with loading states and Tailwind animation |
| **Task 10** — `FeedbackButtons.tsx` | Optimistic UI, multiple visual states |
| **Task 11** — `WeightsPanel.tsx` | Most complex UI piece: 5 sliders, live sum validation, collapsible |
| **Task 12** — `DemoToggle.tsx` | Pill toggle, two visual modes |
| **Task 13** — `ScatterPlot.tsx` | SVG chart — requires coordinate math and axis layout |
| **Task 14** — `app/page.tsx` | Full dashboard layout — longest Tailwind file in the project |
| **Task 15** — `app/validation/page.tsx` + `ValidationClient.tsx` | Orchestrates all validation UI |

**Give Gemini the full contents of** `lib/scoring.ts`, `lib/schema.ts`, and the contracts in Tasks 9–15 above as context. It does not need to see `lib/db.ts` or any API routes.

---

### Codex CLI — Data layer, API routes, scripts, deployment

Pure TypeScript logic and config with no visual judgment required.

| Task | Reason |
|------|--------|
| **Task 1** — DB migration | One-line SQL migration |
| **Task 2** — `dashboard-queries.ts` | SQL queries + data shaping, no UI |
| **Task 3** — `lib/stats.ts` | Algorithm — Spearman ranking logic |
| **Task 4** — Feedback route | Simple PATCH endpoint |
| **Task 5** — Weights route | Bulk score recalculation |
| **Task 6** — Validation route | Seed + run + correlation pipeline |
| **Task 7** — `seed-validation.ts` | CLI script using existing db/schema |
| **Task 16** — Vercel/Railway deploy | Config files, env var wiring |
| **Task 18** — Commit | Git operations |

**Give Codex the full contents of** `lib/db.ts`, `lib/scoring.ts`, `lib/schema.ts`, `lib/classifier.ts`, and the relevant task contract above. Do not give it UI files.

---

### Claude — Content that requires judgment and realism

| Task | Reason |
|------|--------|
| **Task 8** — `seed-data/validation.json` | Generating 20 emails that sound authentic — plausible names, domains, realistic finance-executive prose — is a content/judgment task, not a code task. Codex will produce structurally valid JSON with fake-sounding content. |
| **Task 17** — `DEMO.md` | Writing a persuasive, accurate 5-minute demo script and architecture narrative requires knowing how the system actually behaves (from the pipeline run). Also the cost table should use the real numbers from the run ($0.11 classify, $0.01 brief). |

---

## Dependency order for execution

```
Task 1  (DB migration)
  └─ Task 2  (dashboard-queries — needs seed column)
  └─ Task 7  (seed script — needs seed column)
       └─ Task 8  (seed data — consumed by Task 7)

Task 3  (stats — no deps)
Task 4  (feedback route — no deps)
Task 5  (weights route — needs scoring.ts, already exists)
Task 6  (validation route — needs Tasks 3, 7, 8)

Tasks 9–13  (UI components — can be parallelised, no deps on each other)

Task 14  (app/page.tsx — needs Tasks 2, 9, 10, 11, 12)
Task 15  (validation page — needs Tasks 6, 13)

Task 16  (deploy — needs everything above built and passing `next build`)
Task 17  (DEMO.md — needs real pipeline output numbers, write last)
Task 18  (commit — final)
```
