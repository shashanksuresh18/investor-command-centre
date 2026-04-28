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
          className="text-sm text-gray-400 hover:text-white flex items-center gap-1 bg-gray-900 px-3 py-1 rounded-md border border-gray-800"
        >
          Weights {open ? "▴" : "▾"}
        </button>
      </div>

      {open && (
        <div className={`bg-gray-900 border ${isSumValid ? "border-gray-800" : "border-red-500"} p-6 rounded-lg mb-6 shadow-xl transition-all`}>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {(Object.keys(DEFAULT_WEIGHTS) as Array<keyof ScoreWeights>).map((key) => (
              <div key={key} className="flex flex-col gap-2">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {key.replace("_", " ")}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={weights[key]}
                  onChange={(e) => handleWeightChange(key, e.target.value)}
                  className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-sm text-gray-100 font-mono">
                  {Math.round(weights[key] * 100)}%
                </span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-gray-800 pt-4">
            <div className="flex items-center gap-4">
              <span className={`text-sm font-medium ${isSumValid ? "text-green-400" : "text-red-400"}`}>
                Sum: {sum.toFixed(2)} {isSumValid ? "✓" : "✗"}
              </span>
              <button
                onClick={handleReset}
                className="text-xs text-gray-500 hover:text-gray-300 underline"
              >
                Reset to defaults
              </button>
            </div>
            <button
              onClick={handleApply}
              disabled={!isSumValid || applying}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                !isSumValid || applying
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {applying ? "Applying..." : "Apply New Weights"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
