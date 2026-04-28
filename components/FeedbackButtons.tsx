"use client";

import { useState } from "react";

interface Props {
  itemId: string;
  initialFeedback: "important" | "noise" | null;
}

export default function FeedbackButtons({ itemId, initialFeedback }: Props) {
  const [feedback, setFeedback] = useState<"important" | "noise" | null>(initialFeedback);
  const [saving, setSaving] = useState(false);

  const handleFeedback = async (type: "important" | "noise") => {
    const newValue = feedback === type ? null : type;
    setFeedback(newValue);
    setSaving(true);

    try {
      const res = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, feedback: newValue }),
      });
      if (!res.ok) throw new Error("Failed to save feedback");
    } catch (err) {
      console.error(err);
      // Revert on error
      setFeedback(initialFeedback);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`flex gap-2 ${saving ? "opacity-50 pointer-events-none" : ""}`}>
      <button
        onClick={() => handleFeedback("important")}
        className={`px-2 py-1 text-xs rounded border transition-colors ${
          feedback === "important"
            ? "bg-green-600 text-white border-green-600"
            : "border-gray-600 text-gray-400 hover:border-green-500 hover:text-green-500"
        }`}
      >
        Important
      </button>
      <button
        onClick={() => handleFeedback("noise")}
        className={`px-2 py-1 text-xs rounded border transition-colors ${
          feedback === "noise"
            ? "bg-slate-600 text-white border-slate-600"
            : "border-gray-600 text-gray-400 hover:border-slate-400 hover:text-slate-400"
        }`}
      >
        Noise
      </button>
    </div>
  );
}
