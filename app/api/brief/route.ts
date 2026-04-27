import { NextResponse } from "next/server";

// POST /api/brief — generates today's AI morning briefing via Sonnet (implemented in PROMPT2)
export async function POST() {
  return NextResponse.json({ message: "Brief not yet implemented — see PROMPT2" }, { status: 501 });
}
