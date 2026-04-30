import { NextResponse } from "next/server";
import db from "@/lib/db";
import { sendBriefing } from "@/lib/whatsapp";

export async function POST(): Promise<NextResponse> {
  try {
    const row = db
      .prepare("SELECT content FROM briefings ORDER BY created_at DESC LIMIT 1")
      .get() as { content: string } | undefined;

    if (!row) {
      return NextResponse.json({ error: "No briefing found" }, { status: 404 });
    }

    const result = await sendBriefing(row.content);
    if (result.success) {
      return NextResponse.json({
        success: true,
        messageSid: result.messageSid,
      });
    }

    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error === "Twilio not configured" ? 503 : 502 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
