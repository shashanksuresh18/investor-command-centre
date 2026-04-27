import { NextResponse } from "next/server";
import { syncEmailsToItems } from "@/lib/gmail";
import { syncPortfolioToItems } from "@/lib/trading212";

export async function POST(): Promise<NextResponse> {
  try {
    const portfolio = await syncPortfolioToItems();
    const emails = await syncEmailsToItems();

    return NextResponse.json({
      portfolio: portfolio.upserted,
      emails: emails.upserted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
