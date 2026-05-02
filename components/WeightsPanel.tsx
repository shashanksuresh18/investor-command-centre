"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ScoreWeights } from "@/lib/scoring";

const DEFAULT_WEIGHTS: ScoreWeights = {
  financial_impact: 0.30,
  urgency: 0.25,
  relationship_importance: 0.20,
  actionability: 0.15,
  risk: 0.10,
};

export default function WeightsPanel() {
  const [open, setOpen] = useState(false);
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [applying, setApplying] = useState(false);
  const router = useRouter();

  const sum = useMemo(() => {
    return Object.values(weights).reduce((a, b) => a + b, 0);
  }, [weights]);

  const isSumValid = Math.abs(sum - 1.0) <= 0.005;

  const handleWeightChange = (key: keyof ScoreWeights, value: string) => {
    setWeights((prev) => ({
      ...prev,
      [key]: parseFloat(value),
    }));
  };

  const handleApply = async () => {
    if (!isSumValid) return;
    setApplying(true);
    try {
      const res = await fetch("/api/weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(weights),
      });
      if (!res.ok) throw new Error("Failed to apply weights");
      router.refresh();
      setOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setApplying(false);
    }
  };

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault();
    setWeights(DEFAULT_WEIGHTS);
  };

  return (
    <div className="w-full">
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setOpen(!open)}
          className="text-[10px] font-finance uppercase tracking-widest text-gray-500 hover:text-white flex items-center gap-2 bg-gray-900/50 px-4 py-1.5 rounded-full border border-gray-800 transition-all hover:border-gray-700"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isSumValid ? "bg-green-500 animate-pulse-dot" : "bg-red-500"}`}></span>
          Weights Tuning {open ? "▴" : "▾"}
        </button>
      </div>

      {open && (
        <div className={`glass-panel p-8 rounded-2xl mb-8 shadow-2xl transition-all animate-fade-in-up`}>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            {(Object.keys(DEFAULT_WEIGHTS) as Array<keyof ScoreWeights>).map((key) => (
              <div key={key} className="flex flex-col gap-3 group">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] group-hover:text-gray-300 transition-colors">
                  {key.replace("_", " ")}
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={weights[key]}
                    onChange={(e) => handleWeightChange(key, e.target.value)}
                    className="flex-1 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <span className="text-xs font-finance text-blue-400 min-w-[3ch] text-right">
                    {Math.round(weights[key] * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-center justify-between border-t border-gray-800/50 pt-6">
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-widest text-gray-600 font-bold mb-1">Calibration Status</span>
                <span className={`text-xs font-finance ${isSumValid ? "text-green-400" : "text-red-400"} flex items-center gap-2`}>
                  <span className={`w-2 h-2 rounded-full ${isSumValid ? "bg-green-500" : "bg-red-500"}`}></span>
                  Sum: {sum.toFixed(2)} {isSumValid ? "(Target 1.00)" : "(Must equal 1.00)"}
                </span>
              </div>
              <button
                onClick={handleReset}
                className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
              >
                Reset Defaults
              </button>
            </div>
            <button
              onClick={handleApply}
              disabled={!isSumValid || applying}
              className={`px-8 py-2.5 rounded-lg font-finance text-xs uppercase tracking-widest transition-all ${
                !isSumValid || applying
                  ? "bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
              }`}
            >
              {applying ? "Recalculating..." : "Apply Calibration"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
