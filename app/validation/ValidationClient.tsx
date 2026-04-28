"use client";

import { useState } from "react";
import ScatterPlot from "@/components/ScatterPlot";

interface Point {
  myLabel: number;
  systemScore: number;
  subject: string;
}

interface Props {
  initialPoints: Point[];
  initialCorrelation: number | null;
}

export default function ValidationClient({ initialPoints, initialCorrelation }: Props) {
  const [points, setPoints] = useState<Point[]>(initialPoints);
  const [correlation, setCorrelation] = useState<number | null>(initialCorrelation);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setStatus("Seeding validation items...");
    try {
      const seedRes = await fetch("/api/validation", {
        method: "POST",
        body: JSON.stringify({ action: "seed" }),
      });
      if (!seedRes.ok) throw new Error("Seeding failed");

      setStatus("Running classifier on seed items (this takes a minute)...");
      const runRes = await fetch("/api/validation", {
        method: "POST",
        body: JSON.stringify({ action: "run" }),
      });
      if (!runRes.ok) throw new Error("Classification run failed");

      const data = await runRes.json();
      setPoints(data.points);
      setCorrelation(data.correlation);
      setStatus(`Success! Processed ${data.processed} items.`);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-gray-900/50 border border-gray-900 rounded-2xl p-8 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-2">Spearman Correlation Test</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              This test compares manual human labels (1-10) with system-generated priority scores (0-100). 
              A higher Spearman correlation indicates that the system is ranking items in an order consistent with human judgement.
            </p>
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            className={`px-8 py-3 rounded-lg font-bold transition-all ${
              running
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
            }`}
          >
            {running ? "Processing..." : "Run Validation Suite"}
          </button>
        </div>
        {status && (
          <p className={`mt-4 text-sm font-medium ${status.startsWith("Error") ? "text-red-400" : "text-blue-400"}`}>
            {status}
          </p>
        )}
      </div>

      {correlation !== null && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <ScatterPlot points={points} correlation={correlation} />
          <div className="bg-gray-900/30 border border-gray-900 rounded-2xl p-8">
            <h3 className="text-lg font-bold mb-4">Interpreting the Results</h3>
            <ul className="space-y-4 text-sm text-gray-400">
              <li className="flex gap-3">
                <span className="text-blue-400 font-bold">Target:</span>
                <span>We aim for a correlation coefficient (r) ≥ 0.60.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-green-400 font-bold">r ≥ 0.6:</span>
                <span>Strong alignment. The system reliably ranks critical items higher than noise.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-amber-400 font-bold">r 0.4 - 0.6:</span>
                <span>Moderate alignment. Some fine-tuning of weights or prompts may be needed.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-red-400 font-bold">r &lt; 0.4:</span>
                <span>Weak alignment. Classifier is likely missing key context or weights are poorly calibrated.</span>
              </li>
            </ul>
            <div className="mt-8 pt-6 border-t border-gray-800">
              <p className="text-xs text-gray-500 italic">
                Note: Spearman correlation uses ranks rather than absolute values, making it robust to non-linear relationships.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
