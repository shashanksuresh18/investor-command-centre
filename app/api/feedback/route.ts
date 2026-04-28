import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function PATCH(req: Request) {
  try {
    const { itemId, feedback } = await req.json();

    if (!itemId) {
      return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
    }

    if (feedback !== null && feedback !== "important" && feedback !== "noise") {
      return NextResponse.json({ error: "Invalid feedback value" }, { status: 400 });
    }

    const result = db.prepare(
      "UPDATE items SET user_feedback = ?, updated_at = ? WHERE id = ?"
    ).run(feedback, new Date().toISOString(), itemId);

    if (result.changes === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
