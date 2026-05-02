import Link from "next/link";
import DemoToggle from "@/components/DemoToggle";
import RefreshButton from "@/components/RefreshButton";
import SendWhatsAppButton from "@/components/SendWhatsAppButton";
import WeightsPanel from "@/components/WeightsPanel";

const navItems = [
  { href: "/", label: "Overview", key: "overview" },
  { href: "/portfolio", label: "Portfolio", key: "portfolio" },
  { href: "/gmail", label: "Gmail", key: "gmail" },
  { href: "/discord", label: "Discord", key: "discord" },
  { href: "/tasks", label: "Tasks", key: "tasks" },
  { href: "/calendar", label: "Calendar", key: "calendar" },
] as const;

export type AppSection = (typeof navItems)[number]["key"];

export default function AppShell({
  active,
  demoMode = false,
  children,
}: {
  active: AppSection;
  demoMode?: boolean;
  children: React.ReactNode;
}) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 selection:bg-blue-500/30 font-sans">
      <header className="glass-panel sticky top-0 z-20 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-center gap-5">
              <DemoToggle demoMode={demoMode} />
              <div>
                <p className="text-[10px] font-finance uppercase tracking-[0.24em] text-blue-400">
                  Live decision support
                </p>
                <h1 className="text-xl font-bold tracking-tight text-white animate-soft-glow">
                  Investor Command Centre
                </h1>
                <p className="text-xs font-finance text-gray-500 uppercase tracking-widest">
                  {today}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <RefreshButton />
              <SendWhatsAppButton />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-gray-800/50 pt-4">
            <nav className="flex flex-wrap items-center gap-2 text-[10px] font-finance uppercase tracking-[0.18em]">
              {navItems.map((item) => {
                const isActive = active === item.key;
                return (
                  <Link
                    key={item.key}
                    href={demoMode && item.key === "overview" ? "/?demo=true" : item.href}
                    className={`rounded-full border px-3 py-1.5 transition-colors ${
                      isActive
                        ? "border-blue-500/60 bg-blue-500/10 text-blue-300"
                        : "border-gray-800 bg-gray-900/30 text-gray-500 hover:border-gray-700 hover:text-gray-200"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="min-w-[220px] flex-1 md:flex-none">
              <WeightsPanel />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 pb-20">{children}</main>
    </div>
  );
}
