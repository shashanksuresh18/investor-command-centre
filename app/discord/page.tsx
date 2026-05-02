import AppShell from "@/components/AppShell";
import { getDiscordWorkspace, type DiscordMessage } from "@/lib/workspace-queries";

export const dynamic = "force-dynamic";

const groups: DiscordMessage["state"][] = ["requires response", "monitor", "noise"];

function groupStyle(group: DiscordMessage["state"]) {
  if (group === "requires response") return "text-red-300 border-red-900/60 bg-red-950/30";
  if (group === "monitor") return "text-indigo-300 border-indigo-900/60 bg-indigo-950/30";
  return "text-gray-500 border-gray-800 bg-gray-900/30";
}

export default function DiscordPage() {
  const messages = getDiscordWorkspace();
  const channels = Array.from(new Set(messages.map((message) => message.channel))).slice(0, 8);

  return (
    <AppShell active="discord">
      <div className="space-y-8">
        <section>
          <p className="font-finance text-[10px] uppercase tracking-[0.24em] text-indigo-400">
            Discord workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Community signal with channel context</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
            Discord messages are grouped by response posture so technical discussion and market
            commentary do not get flattened into email-style rows.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {channels.map((channel) => (
              <span key={channel} className="rounded-full border border-indigo-900/50 bg-indigo-950/20 px-3 py-1 font-finance text-[10px] text-indigo-300">
                #{channel}
              </span>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          {groups.map((group) => {
            const items = messages.filter((message) => message.state === group).slice(0, 12);
            return (
              <div key={group} className="glass-panel overflow-hidden rounded-2xl">
                <div className={`border-b px-5 py-4 ${groupStyle(group)}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em]">{group}</h3>
                    <span className="font-finance text-xs">{items.length}</span>
                  </div>
                </div>
                <div className="divide-y divide-gray-800/70">
                  {items.length > 0 ? (
                    items.map((message) => (
                      <article key={message.id} className="p-5 hover:bg-gray-800/20">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-xs text-gray-500">
                            {message.server} / #{message.channel}
                          </p>
                          <span className="font-finance text-xs text-gray-400">
                            {Math.round(message.score)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-white">{message.summary}</p>
                        <p className="mt-1 text-xs text-gray-500">From {message.sender}</p>
                        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-gray-400">
                          Why: {message.whyItMatters}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                          {["reply hook", "follow up", "monitor"].map((action) => (
                            <span key={action} className="rounded-full border border-gray-800 bg-gray-900 px-2 py-1 text-gray-500">
                              {action}
                            </span>
                          ))}
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="p-6 text-sm italic text-gray-500">No messages in this group.</p>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
