import { NextResponse } from "next/server";

// POST /api/sync — pulls fresh data from T212 + Gmail (implemented in PROMPT2)
export async function POST() {
  return NextResponse.json({ message: "Sync not yet implemented — see PROMPT2" }, { status: 501 });
}
