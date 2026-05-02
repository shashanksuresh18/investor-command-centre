import AppShell from "@/components/AppShell";
import {
  cleanBriefingContent,
  getOverviewWorkspace,
  type PortfolioAlert,
} from "@/lib/workspace-queries";

export const dynamic = "force-dynamic";

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="rounded-full border border-gray-700 bg-gray-900/80 px-2.5 py-1 font-finance text-[10px] text-gray-300">
      {Math.round(score)}
    </span>
  );
}

function SectionHeading({
  accent,
  title,
  subtitle,
}: {
  accent: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-5">
      <h2 className={`text-[10px] font-bold uppercase tracking-[0.25em] ${accent} flex items-center gap-3`}>
        <span className="h-px w-8 bg-current opacity-40" />
        {title}
      </h2>
      <p className="mt-2 px-11 text-xs italic text-gray-400">{subtitle}</p>
    </div>
  );
}

function AlertPill({ alert }: { alert: PortfolioAlert }) {
  const colour =
    alert.severity === "high"
      ? "border-red-900/70 bg-red-950/40 text-red-300"
      : alert.severity === "medium"
      ? "border-amber-900/70 bg-amber-950/40 text-amber-300"
      : "border-gray-800 bg-gray-900/70 text-gray-400";

  return (
    <div className={`rounded-xl border p-4 ${colour}`}>
      <div className="flex items-center justify-between gap-4">
        <p className="font-finance text-[10px] uppercase tracking-[0.18em]">{alert.ticker}</p>
        <span className="text-[9px] uppercase tracking-widest">{alert.severity}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-gray-100">{alert.title}</p>
      <p className="mt-2 text-xs leading-relaxed text-gray-400">{alert.reason}</p>
    </div>
  );
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const demoMode = demo === "true";
  const data = await getOverviewWorkspace(demoMode);

  return (
    <AppShell active="overview" demoMode={demoMode}>
      <div className="space-y-10">
        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="glass-panel relative overflow-hidden rounded-2xl p-8">
            <div className="absolute inset-y-0 left-0 w-1 bg-blue-500/35" />
            <SectionHeading
              accent="text-blue-400"
              title="Morning Briefing"
              subtitle="Cross-source synthesis from portfolio, communications, tasks, and calendar"
            />
            {data.briefing ? (
              <div className="max-w-4xl whitespace-pre-line text-base leading-8 text-gray-200">
                {cleanBriefingContent(data.briefing.content)}
              </div>
            ) : (
              <p className="py-8 text-sm italic text-gray-500">
                No briefing yet. Refresh the pipeline to generate today&apos;s executive summary.
              </p>
            )}
          </div>

          <aside className="glass-panel rounded-2xl p-6">
            <p className="font-finance text-[10px] uppercase tracking-[0.22em] text-gray-500">
              Decision system
            </p>
            <h3 className="mt-3 text-lg font-semibold text-white">Today&apos;s control panel</h3>
            <div className="mt-6 space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-500">AI cost today</p>
                <p className="mt-1 font-finance text-2xl text-blue-300">
                  ${data.todayCost.cost_usd.toFixed(2)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3">
                  <p className="text-gray-500">Classified</p>
                  <p className="mt-1 font-finance text-lg text-gray-100">
                    {data.todayCost.classification_count}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3">
                  <p className="text-gray-500">Briefings</p>
                  <p className="mt-1 font-finance text-lg text-gray-100">
                    {data.todayCost.briefing_count}
                  </p>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-gray-500">
                Scores here are triage signals. Portfolio recommendations are rule-based decision
                support, not final investment advice.
              </p>
            </div>
          </aside>
        </section>

        <section>
          <SectionHeading
            accent="text-red-400"
            title="Decisions Today"
            subtitle="Only the five highest-value actions; each includes source and reason"
          />
          <div className="grid gap-4">
            {data.decisionsToday.length > 0 ? (
              data.decisionsToday.map((decision, index) => (
                <div
                  key={`${decision.source}-${decision.id}`}
                  className="glass-panel grid gap-4 rounded-xl p-5 md:grid-cols-[44px_1fr_80px] md:items-center"
                >
                  <div className="font-finance text-xl text-gray-600">{index + 1}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full border border-gray-800 bg-gray-900 px-2 py-0.5 text-[10px] uppercase tracking-widest text-gray-400">
                        {decision.source}
                      </span>
                      <h3 className="truncate text-sm font-semibold text-white">{decision.title}</h3>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-400">
                      Why: {decision.reason}
                    </p>
                  </div>
                  <div className="justify-self-start md:justify-self-end">
                    <ScoreBadge score={decision.score} />
                  </div>
                </div>
              ))
            ) : (
              <div className="glass-panel rounded-xl p-8 text-center text-sm italic text-gray-500">
                No high-value decisions detected.
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <SectionHeading
              accent="text-green-400"
              title="Portfolio Alerts"
              subtitle="Trading 212 positions that crossed rule-based review thresholds"
            />
            <div className="space-y-3">
              {data.portfolioAlerts.length > 0 ? (
                data.portfolioAlerts.map((alert) => <AlertPill key={alert.id} alert={alert} />)
              ) : (
                <div className="glass-panel rounded-xl p-6 text-sm italic text-gray-500">
                  No portfolio alert thresholds triggered.
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <SectionHeading
              accent="text-amber-400"
              title="Responses"
              subtitle="Email and Discord items that are worth replying to"
            />
            <div className="glass-panel divide-y divide-gray-800/60 overflow-hidden rounded-xl">
              {data.communicationsRequiringResponse.length > 0 ? (
                data.communicationsRequiringResponse.map((item) => (
                  <div key={item.id} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                      <ScoreBadge score={item.priority_score ?? 0} />
                    </div>
                    <p className="mt-1 text-[10px] uppercase tracking-widest text-gray-500">
                      {item.source}
                      {item.source_account ? ` / ${item.source_account}` : ""}
                    </p>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-400">
                      {item.suggested_action ?? item.reasoning ?? "Review source context"}
                    </p>
                  </div>
                ))
              ) : (
                <div className="p-6 text-sm italic text-gray-500">No responses require attention.</div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <SectionHeading
              accent="text-purple-400"
              title="Today&apos;s Schedule"
              subtitle="Calendar context for meetings that may affect decisions"
            />
            <div className="glass-panel divide-y divide-gray-800/60 overflow-hidden rounded-xl">
              {data.meetings.length > 0 ? (
                data.meetings.map((meeting) => (
                  <div key={meeting.id} className="p-4">
                    <p className="text-sm font-semibold text-white">{meeting.title}</p>
                    <p className="mt-1 font-finance text-[10px] uppercase tracking-widest text-gray-500">
                      {new Date(meeting.start).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      -{" "}
                      {new Date(meeting.end).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="mt-2 line-clamp-1 text-xs text-gray-500">
                      {meeting.attendees.slice(0, 3).join(", ") || "No attendees listed"}
                    </p>
                  </div>
                ))
              ) : (
                <div className="p-6 text-sm italic text-gray-500">
                  No calendar events in the next 48 hours.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
