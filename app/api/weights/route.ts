import { NextResponse } from "next/server";
import db from "@/lib/db";
import { calculateScoreWithWeights } from "@/lib/scoring";

export async function POST(req: Request) {
  try {
    const weights = await req.json();
    const { financial_impact, urgency, relationship_importance, actionability, risk } = weights;

    const sum = financial_impact + urgency + relationship_importance + actionability + risk;
    if (Math.abs(sum - 1.0) > 0.005) {
      return NextResponse.json({ error: "Weights must sum to 1.00" }, { status: 400 });
    }

    const items = db.prepare(
      "SELECT id, urgency, financial_impact, relationship_importance, actionability, risk FROM items WHERE classified = 1"
    ).all() as any[];

    let updated = 0;
    const updateStmt = db.prepare(
      "UPDATE items SET priority_score = ?, updated_at = ? WHERE id = ?"
    );

    const now = new Date().toISOString();

    db.transaction(() => {
      for (const item of items) {
        const newScore = calculateScoreWithWeights(item, weights);
        updateStmt.run(newScore, now, item.id);
        updated++;
      }
    })();

    return NextResponse.json({ updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
