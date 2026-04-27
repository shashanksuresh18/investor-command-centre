# Investor Morning Command Centre — CLAUDE.md

## Project summary

A read-only personal dashboard that pulls emails from Gmail and portfolio positions from Trading 212, ranks every item by priority using a weighted scoring formula, and generates a concise AI morning briefing via Anthropic's Claude. The stack is Next.js 15 (App Router), TypeScript, Tailwind, SQLite (better-sqlite3), Zod, and the Anthropic SDK. Everything runs locally; there is no remote database, no background queue, and no external auth service beyond Gmail OAuth.

## Hard rules

- **Read-only everywhere.** No order placement on Trading 212. No sending, deleting, or modifying email. Gmail OAuth scope is `gmail.readonly` only.
- **Secrets in `.env.local` only.** Never commit `.env*` files. They are in `.gitignore`.
- **Single LLM gateway.** Every Anthropic call goes through `lib/llm.ts` (`classifyWithHaiku` / `synthesiseWithSonnet`). Do not call the Anthropic SDK anywhere else.
- **No agentic frameworks.** No LangChain, LangGraph, Celery, Redis, Supabase, or similar. Plain TypeScript only.

## Item schema

Defined in `lib/schema.ts` (Zod) and mirrored in `lib/db.ts` (SQLite).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` uuid | Primary key |
| `source` | `"gmail" \| "trading212"` | |
| `source_id` | `string` | Original ID from the source system |
| `title` | `string` | Email subject or "Position: TICKER" |
| `body` | `string` | Email body or JSON-stringified portfolio event |
| `sender` | `string` | Email from-address or `"trading212"` |
| `timestamp` | ISO string | |
| `classified` | `boolean` | False until the classifier has run |
| `category` | `"portfolio"\|"pipeline"\|"admin"\|"personal"\|"newsletter"\|"noise"\|null` | |
| `urgency` | `1–10 int \| null` | |
| `financial_impact` | `1–10 int \| null` | |
| `relationship_importance` | `1–10 int \| null` | |
| `actionability` | `1–10 int \| null` | |
| `risk` | `1–10 int \| null` | |
| `action_required` | `boolean \| null` | |
| `suggested_action` | `string \| null` | |
| `reasoning` | `string \| null` | Why the classifier scored it this way |
| `priority_score` | `0–100 float \| null` | Computed by `lib/scoring.ts` |
| `user_feedback` | `"important"\|"noise"\|null` | Manual override |
| `created_at` | ISO string | |
| `updated_at` | ISO string | |

## Priority scoring formula

```
score = (0.30 × financial_impact
       + 0.25 × urgency
       + 0.20 × relationship_importance
       + 0.15 × actionability
       + 0.10 × risk) × 10
```

Result is clamped to **0–100**. Implemented in `lib/scoring.ts` as:
- `calculateScore(item)` — uses the default weights above.
- `calculateScoreWithWeights(item, weights)` — accepts custom weights for the live-tuning panel.

## How to work on this repo

1. **Read this file first** before touching any code.
2. **Prefer small, focused changes.** One concern per PR/commit.
3. **Always write types first.** Define the Zod schema or TypeScript interface before writing implementation code.
4. **Never introduce new dependencies without asking.** The dependency list is intentionally minimal; additions need explicit approval.
