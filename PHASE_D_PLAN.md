# Phase D — WhatsApp Briefing Delivery

**Goal:** After morning briefing generation, optionally push the briefing to WhatsApp via the Twilio sandbox. Two delivery paths: auto-send during pipeline runs (env-gated) and manual send via a dashboard button.

**Dependency to install:** `npm install twilio` (one new prod dependency, explicitly approved in this plan).

---

## Architecture overview

```
lib/whatsapp.ts          ← delivery adapter; knows nothing about briefing generation
app/api/send-whatsapp/   ← REST endpoint; fetches latest briefing, calls adapter
scripts/run-pipeline.ts  ← calls adapter post-briefing when SEND_WHATSAPP=true
components/SendWhatsAppButton.tsx  ← client component; POST /api/send-whatsapp
app/page.tsx             ← mounts button in header next to RefreshButton
.env.local.example       ← documents the 5 new env vars
```

The briefing layer (`lib/briefing.ts`) is untouched — it generates and persists, knows nothing about delivery.

---

## Task list

### T1 — Create `lib/whatsapp.ts` *(Codex — backend)*

**Files:** `lib/whatsapp.ts` (new)

**Contract:**

```ts
export interface WhatsAppResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}

export async function sendBriefing(briefingText: string): Promise<WhatsAppResult>
```

**Implementation rules:**

1. **Env guard (fast path).** Read `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_TO` from `process.env`. If any are missing or empty, return `{ success: false, error: 'Twilio not configured' }` immediately — no network call.

2. **Truncation.** If `briefingText.length <= 1500`, send as-is. Otherwise apply `truncateForWhatsApp(briefingText)`:
   - Split on `\n\n` to get paragraphs.
   - Locate the "Actions today" block: the paragraph (or trailing lines) that begins with `Actions today` (case-insensitive match on the first word of the paragraph).
   - Build candidate: `[paragraph 0] + "\n\n" + [actions block]`.
   - If candidate `<= 1500` chars, use it.
   - If candidate is still `> 1500` chars (unlikely), truncate at the last sentence boundary (last index of `. ` or `.\n` before position 1500), inclusive of the period. Do not cut mid-word.
   - If no sentence boundary exists within 1500 chars, hard-truncate at 1500 and append `…`.
   - Export `truncateForWhatsApp` separately — it is pure and testable with no external deps.

3. **Twilio call.** Import `twilio` (official Node SDK). Instantiate client with the SID + token. Call `client.messages.create({ from, to, body })`. The `from` value is `TWILIO_WHATSAPP_FROM` (already prefixed `whatsapp:+...` in env); `to` is `TWILIO_WHATSAPP_TO`.

4. **Error isolation.** Wrap the Twilio call in `try/catch`. On success return `{ success: true, messageSid: message.sid }`. On error return `{ success: false, error: err.message }`. Never throw.

5. **Logging constraint.** Log `[whatsapp] sent ${result.messageSid}` on success, or `[whatsapp] failed: ${result.error}` on failure. **Never log `briefingText` or any substring of it.**

**Verification:** Unit-testable by calling `truncateForWhatsApp` directly with a synthetic 2000-char string. Check: (a) result ≤ 1500 chars; (b) paragraph 1 is intact; (c) "Actions today" block is present; (d) no mid-sentence cuts.

---

### T2 — Create `app/api/send-whatsapp/route.ts` *(Codex — backend)*

**Files:** `app/api/send-whatsapp/route.ts` (new)

**Contract:** `POST /api/send-whatsapp` → `{ success: boolean, messageSid?: string, error?: string }`

**Implementation rules:**

1. Import `db` from `@/lib/db` and `sendBriefing` from `@/lib/whatsapp`.

2. Query for the most recent briefing:
   ```sql
   SELECT content FROM briefings ORDER BY created_at DESC LIMIT 1
   ```
   Cast the result row as `{ content: string } | undefined`.

3. If no row: return `NextResponse.json({ error: 'No briefing found' }, { status: 404 })`.

4. Call `await sendBriefing(row.content)`.

5. If `result.success`: return `NextResponse.json({ success: true, messageSid: result.messageSid })`.

6. If `!result.success`: return `NextResponse.json({ success: false, error: result.error }, { status: 502 })`.
   - Exception: if `result.error === 'Twilio not configured'`, return `{ status: 503 }` instead of 502 to let the UI show a more specific message.

7. Wrap everything in `try/catch`; return 500 on unexpected errors.

**Logging constraint:** Do not log `row.content`. Log only the send result.

**Verification:** With Twilio unconfigured (env vars absent): `POST /api/send-whatsapp` returns 503. With no briefing in DB: returns 404.

---

### T3 — Update `scripts/run-pipeline.ts` *(Codex — backend)*

**Files:** `scripts/run-pipeline.ts` (edit)

**Change:** After the existing `console.log("### TOP ITEMS ###")` block, add:

```ts
if (process.env.SEND_WHATSAPP === 'true') {
  const { sendBriefing } = await import('../lib/whatsapp');
  const result = await sendBriefing(briefing.content);
  if (result.success) {
    console.log(`[whatsapp] Sent. SID: ${result.messageSid}`);
  } else {
    console.error(`[whatsapp] Send failed: ${result.error}`);
  }
}
```

**Rules:**
- Dynamic import (consistent with the existing import pattern in `main()`).
- If `SEND_WHATSAPP` is unset, `'false'`, or any value other than `'true'`: skip silently — no log output at all.
- A WhatsApp send failure must not call `process.exit(1)` or throw — the pipeline already succeeded for briefing purposes.
- **Do not log `briefing.content`** in the new block. (Note: the existing `console.log(briefing.content)` line at line 65 is pre-existing and outside the scope of this change.)

**Verification:** Run pipeline with `SEND_WHATSAPP=false` (or unset): no `[whatsapp]` log line appears. Run with `SEND_WHATSAPP=true` and valid Twilio creds: message arrives on phone (manual).

---

### T4 — Create `components/SendWhatsAppButton.tsx` *(Gemini — UI)*

**Files:** `components/SendWhatsAppButton.tsx` (new)

**Contract:** `export default function SendWhatsAppButton()` — no props.

**Implementation rules:**

1. `"use client"` directive at top.

2. State: `stage: "idle" | "loading" | "success" | "error"`, `error: string | null`.

3. On click:
   - Set stage to `"loading"`.
   - `POST /api/send-whatsapp` with no body.
   - On HTTP 200 with `success: true`: set stage to `"success"`, then `setTimeout(() => setStage("idle"), 3000)`.
   - On any failure (non-200, `success: false`, network error): set stage to `"error"`, set error to response `error` field or `"Send failed"`.

4. Button labels:
   ```
   idle    → "Send to WhatsApp"
   loading → "Sending..."
   success → "Sent ✓"
   error   → "Error"
   ```

5. Button disabled when `stage === "loading"`.

6. Tailwind styling — match `RefreshButton` exactly:
   - `idle`: `bg-green-700 hover:bg-green-600 text-white`  (green to distinguish from Refresh's blue)
   - `loading`: `bg-green-900 text-green-300 cursor-not-allowed`
   - `success`: `bg-green-600 text-white`
   - `error`: `bg-red-600 hover:bg-red-700 text-white`
   - Base classes: `px-4 py-2 rounded-md font-medium transition-colors`

7. Spinner SVG (same as `RefreshButton`) shown during `loading`.

8. Error message: `{error && <p className="text-red-400 text-xs mt-1">{error}</p>}` below the button — matches the `RefreshButton` pattern.

9. Wrap button + error message in `<div className="flex flex-col items-end">` — identical wrapper to `RefreshButton`.

**Verification:** Button renders; click triggers POST; loading spinner appears; on success label changes to "Sent ✓" for 3 s then resets.

---

### T5 — Mount button in `app/page.tsx` *(Gemini — UI)*

**Files:** `app/page.tsx` (edit)

**Change:** Import `SendWhatsAppButton` and place it in the header's button group:

```tsx
// Add import at top
import SendWhatsAppButton from "@/components/SendWhatsAppButton";

// In the header, change:
<div className="flex items-center gap-4">
  <RefreshButton />
</div>

// To:
<div className="flex items-center gap-4">
  <SendWhatsAppButton />
  <RefreshButton />
</div>
```

`SendWhatsAppButton` goes to the left of `RefreshButton` — it is a secondary action.

**Verification:** Dashboard loads without TypeScript errors; both buttons visible in header; WhatsApp button does not affect Refresh button behaviour.

---

### T6 — Update `.env.local.example` *(manual)*

**Files:** `.env.local.example` (edit)

**Append to the existing file:**

```env
# Twilio WhatsApp delivery (Phase D)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WHATSAPP_TO=whatsapp:+44XXXXXXXXXX
SEND_WHATSAPP=false
```

**Note:** `TWILIO_WHATSAPP_FROM` defaults to the Twilio sandbox number. For production, swap to a registered WhatsApp Business number (v0.2 concern).

**Verification:** `.env.local.example` committed; `.env.local` not committed (it is in `.gitignore`).

---

## Dependency change

```
npm install twilio
```

Add `twilio` to `package.json` `dependencies` (not `devDependencies` — it is used at runtime in the API route and pipeline script).

---

## Test plan

| # | Scenario | Expected result |
|---|---|---|
| 1 | Pipeline run, `SEND_WHATSAPP` unset | No `[whatsapp]` log line; no Twilio call |
| 2 | Pipeline run, `SEND_WHATSAPP=false` | Same as above |
| 3 | Pipeline run, `SEND_WHATSAPP=true`, valid creds | `[whatsapp] Sent. SID: SM...` logged; message arrives on phone *(manual)* |
| 4 | Pipeline run, `SEND_WHATSAPP=true`, invalid creds | `[whatsapp] Send failed: ...` logged; pipeline still exits 0 |
| 5 | `POST /api/send-whatsapp`, Twilio not configured (no env) | 503 `{ success: false, error: 'Twilio not configured' }` |
| 6 | `POST /api/send-whatsapp`, no briefing in DB | 404 `{ error: 'No briefing found' }` |
| 7 | `POST /api/send-whatsapp`, valid creds, briefing exists | 200 `{ success: true, messageSid: '...' }`; message on phone *(manual)* |
| 8 | Dashboard button click (happy path) | Loading spinner → "Sent ✓" for 3 s → idle |
| 9 | Dashboard button click, Twilio unconfigured | Error state; inline error message displayed |
| 10 | Briefing > 1500 chars | `truncateForWhatsApp` returns ≤ 1500 chars; paragraph 1 intact; "Actions today" present; no mid-sentence cut |
| 11 | Briefing ≤ 1500 chars | Sent verbatim, no truncation |
| 12 | Demo Mode active | WhatsApp button still visible; send uses real briefing from DB (demo mode only affects data display, not delivery) |
| 13 | Phase A (Notion sync) | Unaffected; `app/api/sync/route.ts` unchanged |
| 14 | Phase B (Calendar in briefing) | Unaffected; `lib/briefing.ts` unchanged |
| 15 | Phase C (Discord sync) | Unaffected; `lib/discord.ts` and sync route unchanged |
| 16 | Phase 1 (Gmail multi-account) | Unaffected; `lib/gmail.ts` unchanged |

---

## File change summary

| File | Action | Owner |
|---|---|---|
| `lib/whatsapp.ts` | Create | Codex |
| `app/api/send-whatsapp/route.ts` | Create | Codex |
| `scripts/run-pipeline.ts` | Edit (add ~10 lines after briefing log) | Codex |
| `components/SendWhatsAppButton.tsx` | Create | Gemini |
| `app/page.tsx` | Edit (add import + mount button) | Gemini |
| `.env.local.example` | Edit (append 5 vars) | Manual |
| `package.json` / `package-lock.json` | Edit (add `twilio`) | npm |
