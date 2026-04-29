import { getDashboardData } from "@/lib/dashboard-queries";
import RefreshButton from "@/components/RefreshButton";
import WeightsPanel from "@/components/WeightsPanel";
import DemoToggle from "@/components/DemoToggle";
import FeedbackButtons from "@/components/FeedbackButtons";
import type { Item } from "@/lib/schema";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const demoMode = demo === "true";
  const data = await getDashboardData(demoMode);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-red-400 font-bold";
    if (score >= 60) return "text-amber-400 font-bold";
    return "text-gray-400";
  };

  const formatSterling = (value: number | null | undefined) =>
    value == null
      ? "£---,---"
      : new Intl.NumberFormat("en-GB", {
          style: "currency",
          currency: "GBP",
          maximumFractionDigits: 0,
        }).format(value);

  const topMovers = data.portfolioSummary?.topMovers.length
    ? data.portfolioSummary.topMovers
    : data.portfolioItems.map((item) => ({
        ticker: item.ticker,
        name: item.ticker,
        pctMove: item.pctMove,
        currency: "",
      }));

  const getPriorityStyle = (priority: string | null) => {
    if (priority === "High") return "bg-red-950 text-red-400 border-red-900";
    if (priority === "Medium") return "bg-amber-950 text-amber-400 border-amber-900";
    return "bg-gray-800 text-gray-400 border-gray-700";
  };

  const formatTaskDueDate = (dueDate: string | null) =>
    dueDate
      ? new Date(dueDate).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        })
      : "—";

  const renderItemRow = (item: Item) => (
    <div key={item.id} className="grid grid-cols-[60px_40px_1fr_2fr_120px_40px_180px] gap-4 py-3 border-b border-gray-900 items-center text-sm group">
      <div className={getScoreColor(item.priority_score || 0)}>
        {item.priority_score?.toFixed(1)}
      </div>
      <div className="flex justify-center">
        {item.source === "gmail" ? (
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 4.5v15c0 .85-.65 1.5-1.5 1.5H21V7.39l-9 6.58-9-6.58V21H1.5C.65 21 0 20.35 0 19.5v-15c0-.42.17-.8.45-1.08.28-.27.66-.42 1.05-.42h.75l9.75 7.15L21.75 3h.75c.4 0 .77.15 1.05.42.28.28.45.66.45 1.08z"/>
          </svg>
        ) : (
          <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-gray-400" title={item.sender}>
          {item.sender.split("<")[0].trim()}
        </div>
        {item.source === "gmail" && item.source_account && (
          <div className="text-xs text-gray-500 truncate mt-0.5" title={item.source_account}>
            via {item.source_account}
          </div>
        )}
      </div>
      <div className="truncate text-gray-100 font-medium">
        {item.title}
      </div>
      <div>
        <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-gray-800 text-gray-400 border border-gray-700">
          {item.category}
        </span>
      </div>
      <div className="flex justify-center">
        <span 
          className="cursor-help text-gray-600 hover:text-gray-400 transition-colors"
          title={item.reasoning || "No reasoning provided"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <FeedbackButtons itemId={item.id} initialFeedback={item.user_feedback} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 selection:bg-blue-500/30">
      {/* Header */}
      <header className="border-b border-gray-900 bg-gray-950/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <DemoToggle demoMode={demoMode} />
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">Morning Command Centre</h1>
                <p className="text-sm text-gray-500">{today}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <RefreshButton />
            </div>
          </div>
          <div className="mt-4">
            <WeightsPanel />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        {/* Morning Briefing */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-blue-500 mb-6 flex items-center gap-3">
            <span className="w-8 h-[1px] bg-blue-500/30"></span>
            Morning Briefing
          </h2>
          <div className="bg-gray-900/50 border border-gray-900 rounded-2xl p-8 backdrop-blur-sm">
            {data.briefing ? (
              <div className="whitespace-pre-line leading-relaxed text-gray-300 text-lg max-w-4xl">
                {data.briefing.content}
              </div>
            ) : (
              <div className="text-gray-500 py-4 italic">
                No briefing yet. Click Refresh to generate one.
              </div>
            )}
          </div>
        </section>

        {/* Top Priority */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-red-500 mb-6 flex items-center gap-3">
            <span className="w-8 h-[1px] bg-red-500/30"></span>
            Top Priority
          </h2>
          <div className="bg-gray-900/30 border border-gray-900 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[60px_40px_1fr_2fr_120px_40px_180px] gap-4 px-6 py-3 bg-gray-900/50 text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-900">
              <div>Score</div>
              <div className="text-center">Src</div>
              <div>Sender</div>
              <div>Title</div>
              <div>Category</div>
              <div className="text-center">Why</div>
              <div>Feedback</div>
            </div>
            <div className="px-6">
              {data.topItems.length > 0 ? (
                data.topItems.map(renderItemRow)
              ) : (
                <div className="py-8 text-center text-gray-500 italic">No prioritized items found.</div>
              )}
            </div>
          </div>
        </section>

        {/* Portfolio Watch */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-green-500 mb-6 flex items-center gap-3">
            <span className="w-8 h-[1px] bg-green-500/30"></span>
            Portfolio Watch
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gray-900/50 border border-gray-900 p-6 rounded-2xl">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Value</p>
              <p className="text-2xl font-bold">{formatSterling(data.portfolioSummary?.totalValue)}</p>
              <p className="text-xs text-gray-600 mt-2">Approx. raw position value + cash</p>
            </div>
            <div className="bg-gray-900/50 border border-gray-900 p-6 rounded-2xl">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Free Cash</p>
              <p className="text-2xl font-bold">{formatSterling(data.portfolioSummary?.freeCash)}</p>
              <p className="text-xs text-gray-600 mt-2">Ready to deploy</p>
            </div>
            <div className="md:col-span-2 bg-gray-900/50 border border-gray-900 p-6 rounded-2xl flex flex-col justify-between">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Top Movers</p>
              <div className="flex gap-8">
                {topMovers.length > 0 ? (
                  topMovers.map((item) => (
                    <div key={item.ticker}>
                      <p className="text-sm font-bold" title={item.name}>
                        {item.ticker}
                      </p>
                      {item.currency && (
                        <p className="text-[10px] text-gray-600 uppercase">{item.currency}</p>
                      )}
                      <p className={`text-lg font-mono ${item.pctMove >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {item.pctMove >= 0 ? "+" : ""}{(item.pctMove * 100).toFixed(2)}%
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 italic">No data available</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Today's Tasks */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-purple-500 mb-6 flex items-center gap-3">
            <span className="w-8 h-[1px] bg-purple-500/30"></span>
            Today&apos;s Tasks
          </h2>
          <div className="bg-gray-900/30 border border-gray-900 rounded-2xl overflow-hidden">
            <div className="px-6">
              {data.todaysTasks.length > 0 ? (
                data.todaysTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-4 py-3 border-b border-gray-800 last:border-0 text-sm"
                  >
                    <span
                      className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${getPriorityStyle(
                        task.priority
                      )}`}
                    >
                      {task.priority ?? "Low"}
                    </span>
                    <div className="min-w-0 flex-1 truncate text-gray-100 font-medium">
                      {task.title}
                    </div>
                    <div className="text-xs text-gray-500 whitespace-nowrap">
                      {formatTaskDueDate(task.due_date)}
                    </div>
                    <div className="text-xs text-gray-600 whitespace-nowrap">
                      {task.status}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-gray-500 italic">
                  {demoMode
                    ? "Notion tasks not included in demo data. Toggle to Live to see your real tasks."
                    : "No tasks pulled from Notion. Confirm NOTION_TASKS_DATABASE_ID is set and the integration has access to the database."}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Ranked Inbox */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-6 flex items-center gap-3">
            <span className="w-8 h-[1px] bg-gray-500/30"></span>
            Ranked Inbox
          </h2>
          <div className="bg-gray-900/30 border border-gray-900 rounded-2xl overflow-hidden">
            <div className="px-6">
              {data.rankedInbox.length > 0 ? (
                data.rankedInbox.map(renderItemRow)
              ) : (
                <div className="py-8 text-center text-gray-500 italic">No items in inbox.</div>
              )}
            </div>
          </div>
        </section>

        {/* Next Modules */}
        <section className="opacity-40 grayscale">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-600 mb-6 flex items-center gap-3">
            <span className="w-8 h-[1px] bg-gray-600/30"></span>
            Next Modules
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { title: "Slack", desc: "Internal team coordination" },
              { title: "Google Calendar", desc: "Daily schedule density" },
              { title: "Private Cos", desc: "Direct data room sync" },
            ].map((m) => (
              <div key={m.title} className="bg-gray-900/20 border border-gray-800 p-6 rounded-2xl cursor-not-allowed">
                <p className="text-sm font-bold mb-1">{m.title}</p>
                <p className="text-xs text-gray-600">{m.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-gray-900 flex justify-between items-center text-xs text-gray-600">
        <div>
          Today&apos;s AI cost: <span className="text-gray-400 font-mono">${data.todayCost.cost_usd.toFixed(2)}</span> ({data.todayCost.classification_count} classifications, {data.todayCost.briefing_count} briefing)
        </div>
        <div className="flex gap-6">
          <a href="/validation" className="hover:text-blue-400 transition-colors">System Validation</a>
          <span>v0.1 Prototype</span>
        </div>
      </footer>
    </div>
  );
}
