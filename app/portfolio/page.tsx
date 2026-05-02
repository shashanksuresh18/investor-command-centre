import AppShell from "@/components/AppShell";
import { getPortfolioWorkspace, type RecommendationAction } from "@/lib/workspace-queries";

export const dynamic = "force-dynamic";

function money(value: number | null, currency = "GBP") {
  if (value == null) return "Unavailable";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function portfolioNarrative(data: Awaited<ReturnType<typeof getPortfolioWorkspace>>) {
  if (data.positions.length === 0) {
    return {
      headline: "Portfolio data is not available yet.",
      bullets: [
        "Trading 212 positions were not returned in this request.",
        "Refresh the pipeline to sync the latest holdings before making decisions.",
      ],
    };
  }

  const strongest = data.topMovers[0];
  const largest = [...data.positions].sort((a, b) => b.concentration - a.concentration)[0];
  const reviewCount = data.positions.filter(
    (position) => position.recommendation.action !== "HOLD",
  ).length;
  const positive = data.positions.filter((position) => position.unrealisedPLPct >= 0).length;

  return {
    headline:
      reviewCount > 0
        ? `${reviewCount} holding${reviewCount === 1 ? "" : "s"} triggered a decision-support rule.`
        : "No holdings triggered the review rules.",
    bullets: [
      strongest
        ? `${strongest.ticker} is the largest move versus average cost at ${pct(strongest.dailyMovePct)}.`
        : "No material mover detected.",
      largest
        ? `${largest.ticker} is the largest concentration at ${(largest.concentration * 100).toFixed(0)}% of position value.`
        : "Concentration could not be calculated.",
      `${positive} of ${data.positions.length} holdings are above average cost.`,
    ],
  };
}

function actionStyle(action: RecommendationAction) {
  switch (action) {
    case "ADD":
      return "border-green-900 bg-green-950/50 text-green-300";
    case "TRIM":
      return "border-amber-900 bg-amber-950/50 text-amber-300";
    case "EXIT":
      return "border-red-900 bg-red-950/50 text-red-300";
    case "INVESTIGATE":
      return "border-blue-900 bg-blue-950/50 text-blue-300";
    default:
      return "border-gray-800 bg-gray-900/80 text-gray-400";
  }
}

export default async function PortfolioPage() {
  const data = await getPortfolioWorkspace();
  const overview = portfolioNarrative(data);

  return (
    <AppShell active="portfolio">
      <div className="space-y-8">
        <section>
          <p className="font-finance text-[10px] uppercase tracking-[0.24em] text-green-400">
            Trading 212 intelligence
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Portfolio decision support</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
            Rule-based support for review discipline. These are internal prompts to investigate,
            not final investment recommendations.
          </p>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
            <div>
              <p className="font-finance text-[10px] uppercase tracking-[0.22em] text-green-400">
                What is happening
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">{overview.headline}</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-400">
                This summary is generated from synced Trading 212 positions and rule thresholds.
                It highlights what needs review, not what you should automatically trade.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {overview.bullets.map((bullet) => (
                <div key={bullet} className="rounded-xl border border-gray-800 bg-gray-900/35 p-4">
                  <p className="text-xs leading-relaxed text-gray-300">{bullet}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[
            ["Total value", money(data.summary.totalValue)],
            ["Free cash", money(data.summary.freeCash)],
            ["Daily P/L", data.summary.dailyPL == null ? "Unavailable" : money(data.summary.dailyPL)],
            ["Unrealised P/L", money(data.summary.totalUnrealisedPL)],
            ["Concentration", data.summary.concentrationRisk],
            ["Exposure", data.summary.exposure],
          ].map(([label, value]) => (
            <div key={label} className="glass-panel rounded-2xl p-5">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">{label}</p>
              <p className="mt-3 break-words font-finance text-lg font-semibold text-white">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="glass-panel rounded-2xl p-6">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-300">
              Move vs average cost
            </h3>
            <div className="mt-5 space-y-3">
              {data.topMovers.length > 0 ? (
                data.topMovers.map((position) => (
                  <div key={position.ticker} className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/30 p-4">
                    <div>
                      <p className="font-semibold text-white">{position.ticker}</p>
                      <p className="text-xs text-gray-500">{position.companyName}</p>
                    </div>
                    <p className={`font-finance text-sm font-semibold ${position.dailyMovePct >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {pct(position.dailyMovePct)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm italic text-gray-500">No live positions available.</p>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-300">
              Watchlist / investigate
            </h3>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {data.watchlist.length > 0 ? (
                data.watchlist.map((position) => (
                  <div key={position.ticker} className="rounded-xl border border-blue-900/60 bg-blue-950/25 p-4">
                    <p className="font-semibold text-white">{position.companyName}</p>
                    <p className="mt-2 text-xs leading-relaxed text-gray-400">
                      {position.recommendation.reasons[0]}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm italic text-gray-500">No names currently require manual review.</p>
              )}
            </div>
          </div>
        </section>

        <section className="glass-panel overflow-hidden rounded-2xl">
          <div className="border-b border-gray-800/70 px-6 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-300">
              Positions and recommendations
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-gray-900/40 text-[10px] uppercase tracking-[0.18em] text-gray-500">
                <tr>
                  {[
                    "Ticker",
                    "Company",
                    "Qty",
                    "Avg cost",
                    "Current",
                    "Unrealised",
                    "Move vs cost",
                    "Thesis",
                    "Catalyst",
                    "Action",
                    "Why",
                  ].map((head) => (
                    <th key={head} className="px-4 py-3 font-semibold">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {data.positions.map((position) => (
                  <tr key={position.ticker} className="hover:bg-gray-800/20">
                    <td className="px-4 py-4 font-finance text-white">{position.ticker}</td>
                    <td className="px-4 py-4 text-gray-200">{position.companyName}</td>
                    <td className="px-4 py-4 font-finance text-gray-400">{position.quantity.toFixed(2)}</td>
                    <td className="px-4 py-4 font-finance text-gray-400">{position.averageCost.toFixed(2)}</td>
                    <td className="px-4 py-4 font-finance text-gray-200">{position.currentPrice.toFixed(2)}</td>
                    <td className={`px-4 py-4 font-finance ${position.unrealisedPLPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {pct(position.unrealisedPLPct)}
                    </td>
                    <td className={`px-4 py-4 font-finance ${position.dailyMovePct >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {pct(position.dailyMovePct)}
                    </td>
                    <td className="px-4 py-4 text-gray-400">{position.thesisStatus}</td>
                    <td className="px-4 py-4 text-gray-500">{position.nextCatalyst}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full border px-2 py-1 font-finance text-[10px] ${actionStyle(position.recommendation.action)}`}>
                        {position.recommendation.action}
                      </span>
                    </td>
                    <td className="max-w-[300px] px-4 py-4">
                      <details>
                        <summary className="cursor-pointer text-xs text-blue-300">
                          Confidence {position.recommendation.confidence}%
                        </summary>
                        <div className="mt-3 space-y-2 text-xs leading-relaxed text-gray-400">
                          {position.recommendation.reasons.map((reason) => (
                            <p key={reason}>Reason: {reason}</p>
                          ))}
                          <p className="text-gray-500">
                            Verify: {position.recommendation.missingInformation.join("; ")}
                          </p>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
