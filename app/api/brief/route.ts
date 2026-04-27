import { NextResponse } from "next/server";
import { generateBriefing } from "@/lib/briefing";

export async function POST(): Promise<NextResponse> {
  try {
    return NextResponse.json(await generateBriefing());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
