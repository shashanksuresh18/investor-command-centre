import { NextResponse } from "next/server";

// POST /api/classify — runs Haiku classifier on unclassified items (implemented in PROMPT2)
export async function POST() {
  return NextResponse.json({ message: "Classify not yet implemented — see PROMPT2" }, { status: 501 });
}
