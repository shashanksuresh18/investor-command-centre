"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function DemoToggle({ demoMode }: { demoMode: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const toggle = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (demoMode) {
      params.delete("demo");
    } else {
      params.set("demo", "true");
    }
    router.push(`/?${params.toString()}`);
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-800 bg-gray-900 transition-colors hover:border-gray-700"
    >
      <div className={`w-2 h-2 rounded-full ${demoMode ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"}`} />
      <span className={`text-[10px] font-bold tracking-widest uppercase ${demoMode ? "text-amber-500" : "text-green-500"}`}>
        {demoMode ? "Demo Data" : "Live Data"}
      </span>
    </button>
  );
}
