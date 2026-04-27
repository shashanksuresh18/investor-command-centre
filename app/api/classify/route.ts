import { NextResponse } from "next/server";
import { classifyUnprocessed } from "@/lib/classifier";

export async function POST(): Promise<NextResponse> {
  try {
    return NextResponse.json(await classifyUnprocessed());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
