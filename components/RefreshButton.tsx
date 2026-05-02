"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RefreshButton() {
  const [stage, setStage] = useState<"idle" | "syncing" | "classifying" | "briefing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleRefresh = async () => {
    setStage("syncing");
    setError(null);

    try {
      const syncRes = await fetch("/api/sync", { method: "POST" });
      if (!syncRes.ok) throw new Error("Sync failed");

      setStage("classifying");
      const classifyRes = await fetch("/api/classify", { method: "POST" });
      if (!classifyRes.ok) throw new Error("Classification failed");

      setStage("briefing");
      const briefRes = await fetch("/api/brief", { method: "POST" });
      if (!briefRes.ok) throw new Error("Briefing generation failed");

      setStage("done");
      router.refresh();
      setTimeout(() => setStage("idle"), 2000);
    } catch (err: any) {
      setStage("error");
      setError(err.message);
    }
  };

  const labels = {
    idle: "Refresh",
    syncing: "Syncing...",
    classifying: "Classifying...",
    briefing: "Generating briefing...",
    done: "Done!",
    error: "Error",
  };

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleRefresh}
        disabled={stage !== "idle" && stage !== "error" && stage !== "done"}
        className={`px-4 py-2 rounded-md font-finance text-xs uppercase tracking-widest transition-all duration-300 shadow-lg ${
          stage === "error"
            ? "bg-red-600 hover:bg-red-700 text-white shadow-red-900/20"
            : stage === "done"
            ? "bg-green-600 text-white shadow-green-900/20"
            : stage === "idle"
            ? "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20 hover:shadow-blue-500/20"
            : "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
        }`}
      >
        <span className="flex items-center gap-2">
          {(stage === "syncing" || stage === "classifying" || stage === "briefing") && (
            <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {labels[stage]}
        </span>
      </button>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
