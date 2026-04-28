"use client";

interface Point {
  myLabel: number;
  systemScore: number;
  subject: string;
}

interface Props {
  points: Point[];
  correlation: number;
}

export default function ScatterPlot({ points, correlation }: Props) {
  const width = 400;
  const height = 300;
  const padding = 40;

  const xScale = (val: number) => padding + ((val - 1) / 9) * (width - 2 * padding);
  const yScale = (val: number) => height - padding - (val / 100) * (height - 2 * padding);

  const rColor = correlation >= 0.6 ? "text-green-400" : correlation >= 0.4 ? "text-amber-400" : "text-red-400";

  return (
    <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Spearman Correlation</h3>
          <p className={`text-4xl font-bold font-mono ${rColor}`}>r = {correlation.toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">n = {points.length} samples</p>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Grid lines */}
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <g key={v}>
            <line
              x1={padding}
              y1={yScale(v)}
              x2={width - padding}
              y2={yScale(v)}
              stroke="#1f2937"
              strokeWidth="1"
            />
            <text x={padding - 10} y={yScale(v) + 4} fill="#6b7280" fontSize="10" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
          <g key={v}>
            <line
              x1={xScale(v)}
              y1={height - padding}
              x2={xScale(v)}
              y2={padding}
              stroke="#1f2937"
              strokeWidth="1"
            />
            <text x={xScale(v)} y={height - padding + 20} fill="#6b7280" fontSize="10" textAnchor="middle">
              {v}
            </text>
          </g>
        ))}

        {/* Axis Labels */}
        <text x={width / 2} y={height - 5} fill="#4b5563" fontSize="10" textAnchor="middle">
          Human Label (1-10)
        </text>
        <text x={5} y={height / 2} fill="#4b5563" fontSize="10" textAnchor="middle" transform={`rotate(-90, 5, ${height / 2})`}>
          System Score (0-100)
        </text>

        {/* Points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xScale(p.myLabel)}
            cy={yScale(p.systemScore)}
            r="4"
            className="fill-blue-500 hover:fill-blue-400 cursor-pointer transition-colors"
          >
            <title>{`${p.subject}\nHuman: ${p.myLabel}, System: ${p.systemScore.toFixed(1)}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
