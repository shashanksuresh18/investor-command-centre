Pipeline works. Now build the UI. Keep it clean. Tailwind only, no component library, no icon library beyond what ships with Next.js.

WHAT I WANT YOU TO DO IN THIS PROMPT

1. Build app/page.tsx as a Server Component that reads from SQLite directly (no API roundtrip for initial render):

   Layout (single screen, desktop-first):
   - Header: "Morning Command Centre" + today's date + "Refresh" button (triggers /api/sync then /api/classify then /api/brief)
   - Section 1: Morning Briefing. Renders the latest briefing as prose. If none exists, show "No briefing yet. Click Refresh."
   - Section 2: Top Priority (top 10 items by score). Each row shows: priority score (0-100, coloured: 80+ red, 60-79 amber, else grey), source icon, sender, title, category tag, "Why" tooltip showing reasoning.
   - Section 3: Portfolio Watch. Total value, cash, top 3 movers (ticker, %, £). Pulled from latest T212 sync.
   - Section 4: Ranked Inbox (next 20 items after top 10).
   - Section 5 (greyed out, labelled "Next modules"): four tiles — Notion CRM, Slack, Google Calendar, Private Company Updates. Each with a one-line description.

2. Add feedback buttons on each priority item: "Important" and "Noise". Clicking writes to items.user_feedback. Show a subtle visual state change. This is the labelled data for v0.2 retuning.

3. Build the weights panel (collapsible, top right):
   - 5 sliders for the weights (financial_impact, urgency, relationship, actionability, risk)
   - Default values: 0.30, 0.25, 0.20, 0.15, 0.10
   - Sliders must sum to 1.00 — show a live sum and red border if off
   - "Apply" button recalculates all priority_scores in the DB with the new weights and re-renders
   - This is the single most important demo moment — Zaid can retune live.

4. Add a /validation page:
   - Button "Load 20 seed emails with hand labels"
   - Runs classifier on them
   - Computes Spearman correlation between my labels and system priority_scores
   - Shows a scatter plot: x-axis my label (1-10), y-axis system score (0-100)
   - Display correlation coefficient prominently. Target above 0.6.
   - Create scripts/seed-validation.ts that loads 20 pre-labelled emails from seed-data/validation.json into the items table with a seed=true flag.

5. Create seed-data/validation.json with 20 realistic emails for a finance exec. Mix: 3 LP updates (importance 9-10), 2 board matters (9-10), 4 founder pitches (5-7), 3 admin/calendar (3-5), 4 newsletters (1-2), 2 noise/auto-notifications (1), 2 personal (4-6). Each entry: {from, subject, body, my_label (1-10)}. Make them sound real — no "Example Corp", use plausible names and domains.

6. Add a "Demo mode" toggle in the header: switches between live data and seed data. Label it clearly so I never confuse the two during the demo.

7. Add a cost footer (bottom of page, small text): "Today's AI cost: $X.XX (N classifications, 1 briefing)". Read from the llm_calls table.

8. Deploy to Vercel:
   - Push to a new GitHub repo: investor-command-centre
   - Vercel config: set all env vars, set the Gmail OAuth redirect URL
   - Test the deployed URL works with Refresh

9. Create DEMO.md at the project root. Contents:
   - 5-minute demo script (what to click, what to say, in order)
   - Architecture diagram (ASCII is fine)
   - The 0.1 to 0.4 roadmap
   - Cost table: daily / monthly / scaled
   - Security posture: read-only, IP-restricted T212 key, gmail.readonly scope, local SQLite, no data leaves the machine except to Anthropic API

10. Commit: "feat: dashboard UI, feedback, weights tuning, validation, demo polish"

When done, show me: the live Vercel URL, a screenshot of the dashboard with real data, and the Spearman correlation from the validation page.