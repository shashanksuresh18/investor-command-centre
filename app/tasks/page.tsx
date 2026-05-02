import AppShell from "@/components/AppShell";
import { getTasksWorkspace, type Task } from "@/lib/workspace-queries";

export const dynamic = "force-dynamic";

const lanes: Task["lane"][] = [
  "Decide",
  "Review",
  "Reply",
  "Sign off",
  "Schedule",
  "Investigate",
];

function dueLabel(value: string | null) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default function TasksPage() {
  const tasks = getTasksWorkspace();

  return (
    <AppShell active="tasks">
      <div className="space-y-8">
        <section>
          <p className="font-finance text-[10px] uppercase tracking-[0.24em] text-purple-400">
            Decision queue
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Action board</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
            Notion tasks and high-confidence derived actions are grouped by what you need to do,
            not by where the signal came from.
          </p>
        </section>

        <section className="grid gap-4 xl:grid-cols-6">
          {lanes.map((lane) => {
            const items = tasks.filter((task) => task.lane === lane).slice(0, 10);
            return (
              <div key={lane} className="glass-panel min-h-[280px] rounded-2xl p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                    {lane}
                  </h3>
                  <span className="font-finance text-xs text-gray-600">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.length > 0 ? (
                    items.map((task) => (
                      <article key={task.id} className="rounded-xl border border-gray-800 bg-gray-900/35 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="rounded-full border border-gray-800 bg-gray-950 px-2 py-0.5 text-[9px] uppercase tracking-widest text-gray-500">
                            {task.source}
                          </span>
                          <span className="font-finance text-[10px] text-purple-300">
                            U{task.urgency}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-semibold leading-snug text-white">{task.title}</p>
                        <p className="mt-3 text-[10px] uppercase tracking-widest text-gray-500">
                          Due {dueLabel(task.dueDate)}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">Owner: {task.owner}</p>
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600">
                          Context: {task.linkedContext}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-xl border border-gray-800 bg-gray-900/20 p-4 text-xs italic text-gray-600">
                      Nothing queued.
                    </p>
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
