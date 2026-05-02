"use client";

import { useState } from "react";

export default function SendWhatsAppButton() {
  const [stage, setStage] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    setStage("loading");
    setError(null);

    try {
      const response = await fetch("/api/send-whatsapp", { method: "POST" });
      const data = await response.json();

      if (data.success) {
        setStage("success");
        setTimeout(() => setStage("idle"), 3000);
      } else {
        setStage("error");
        setError(data.error || "Send failed");
        setTimeout(() => {
          setStage("idle");
          setError(null);
        }, 3000);
      }
    } catch (err: any) {
      setStage("error");
      setError(err.message || "Network error");
      setTimeout(() => {
        setStage("idle");
        setError(null);
      }, 3000);
    }
  };

  const labels = {
    idle: "Send to WhatsApp",
    loading: "Sending...",
    success: "Sent",
    error: "Error",
  };

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleSend}
        disabled={stage === "loading" || stage === "success"}
        className={`px-4 py-2 rounded-md font-finance text-xs uppercase tracking-widest transition-all duration-300 shadow-lg ${
          stage === "error"
            ? "bg-red-600 hover:bg-red-700 text-white shadow-red-900/20"
            : stage === "success"
            ? "bg-green-600 text-white shadow-green-900/20"
            : stage === "idle"
            ? "bg-green-700 hover:bg-green-600 text-white shadow-green-900/20 hover:shadow-green-500/20"
            : "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
        }`}
      >
        <span className="flex items-center gap-2">
          {stage === "loading" && (
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
