import AppShell from "@/components/AppShell";
import { getMeetings } from "@/lib/workspace-queries";

export const dynamic = "force-dynamic";

function timeRange(start: string, end: string) {
  const format = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${format.format(new Date(start))} - ${format.format(new Date(end))}`;
}

export default async function CalendarPage() {
  const meetings = await getMeetings();

  return (
    <AppShell active="calendar">
      <div className="space-y-8">
        <section>
          <p className="font-finance text-[10px] uppercase tracking-[0.24em] text-blue-400">
            Calendar context
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Today and tomorrow&apos;s meetings</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
            Calendar stays as context for the briefing and decision flow. It is not another ranked
            inbox; it tells you which conversations may change priority.
          </p>
        </section>

        <section className="glass-panel overflow-hidden rounded-2xl">
          <div className="border-b border-gray-800 px-6 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-300">
              Schedule
            </h3>
          </div>
          <div className="divide-y divide-gray-800/70">
            {meetings.length > 0 ? (
              meetings.map((meeting) => (
                <article key={meeting.id} className="grid gap-4 p-6 hover:bg-gray-800/20 md:grid-cols-[160px_1fr_280px]">
                  <p className="font-finance text-sm text-blue-300">{timeRange(meeting.start, meeting.end)}</p>
                  <div>
                    <p className="font-semibold text-white">{meeting.title}</p>
                    {meeting.description && (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">
                        {meeting.description}
                      </p>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-gray-500">
                    {meeting.attendees.slice(0, 5).join(", ") || "No attendees listed"}
                  </p>
                </article>
              ))
            ) : (
              <p className="p-8 text-sm italic text-gray-500">No meetings found in the next 48 hours.</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
