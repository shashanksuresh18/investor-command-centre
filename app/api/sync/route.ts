import { NextResponse } from "next/server";
import { syncEmailsToItems } from "@/lib/gmail";
import { syncTasksToItems } from "@/lib/notion";
import { syncPortfolioToItems } from "@/lib/trading212";

export async function POST(): Promise<NextResponse> {
  try {
    const portfolio = await syncPortfolioToItems();
    const emails = await syncEmailsToItems();
    let tasks = { upserted: 0 };

    if (process.env.NOTION_API_KEY && process.env.NOTION_TASKS_DATABASE_ID) {
      try {
        tasks = await syncTasksToItems();
      } catch (err) {
        console.error("Notion sync failed (non-fatal):", err);
      }
    }

    return NextResponse.json({
      portfolio: portfolio.upserted,
      emails: emails.upserted,
      tasks: tasks.upserted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
