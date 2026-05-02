import AppShell from "@/components/AppShell";
import { getEmailWorkspace, type EmailMessage } from "@/lib/workspace-queries";

export const dynamic = "force-dynamic";

const states: EmailMessage["state"][] = [
  "urgent reply",
  "admin / sign-off",
  "low priority",
  "archive candidates",
];

function stateStyle(state: EmailMessage["state"]) {
  if (state === "urgent reply") return "text-red-300 border-red-900/60 bg-red-950/30";
  if (state === "admin / sign-off") return "text-amber-300 border-amber-900/60 bg-amber-950/30";
  if (state === "archive candidates") return "text-gray-500 border-gray-800 bg-gray-900/30";
  return "text-blue-300 border-blue-900/60 bg-blue-950/30";
}

export default function GmailPage() {
  const messages = getEmailWorkspace();

  return (
    <AppShell active="gmail">
      <div className="space-y-8">
        <section>
          <p className="font-finance text-[10px] uppercase tracking-[0.24em] text-red-400">
            Gmail workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Email triage by action state</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
            Email stays email-native here: sender, account, subject, recommended next action,
            and reasoning are visible without mixing it into portfolio signals.
          </p>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          {states.map((state) => {
            const group = messages.filter((message) => message.state === state).slice(0, 12);
            return (
              <div key={state} className="glass-panel overflow-hidden rounded-2xl">
                <div className={`border-b px-5 py-4 ${stateStyle(state)}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em]">{state}</h3>
                    <span className="font-finance text-xs">{group.length}</span>
                  </div>
                </div>
                <div className="divide-y divide-gray-800/70">
                  {group.length > 0 ? (
                    group.map((message) => (
                      <article key={message.id} className="p-5 hover:bg-gray-800/20">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{message.subject}</p>
                            <p className="mt-1 truncate text-xs text-gray-500">
                              {message.sender} via {message.account}
                            </p>
                          </div>
                          <span className="font-finance text-xs text-gray-400">
                            {Math.round(message.score)}
                          </span>
                        </div>
                        <p className="mt-3 text-xs leading-relaxed text-gray-400">
                          Next: {message.suggestedAction}
                        </p>
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600">
                          Why: {message.reasoning}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                          {["reply", "archive", "snooze", "mark important"].map((action) => (
                            <span key={action} className="rounded-full border border-gray-800 bg-gray-900 px-2 py-1 text-gray-500">
                              {action}
                            </span>
                          ))}
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="p-6 text-sm italic text-gray-500">No messages in this state.</p>
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
