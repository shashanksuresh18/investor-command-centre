import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import db from "@/lib/db";
import { classifyUnprocessed } from "@/lib/classifier";
import { spearmanCorrelation } from "@/lib/stats";

export async function POST(req: Request) {
  try {
    const { action } = await req.json();

    if (action === "seed") {
      const seedPath = path.join(process.cwd(), "seed-data", "validation.json");
      const seedData = JSON.parse(fs.readFileSync(seedPath, "utf-8"));

      const insertStmt = db.prepare(`
        INSERT INTO items (
          id, source, source_id, title, body, sender, timestamp, 
          classified, created_at, updated_at, seed
        ) VALUES (
          ?, 'gmail', ?, ?, ?, ?, ?, 0, ?, ?, 1
        ) ON CONFLICT(source, source_id) DO UPDATE SET 
          body=excluded.body, 
          classified=0, 
          priority_score=NULL, 
          updated_at=excluded.updated_at
      `);

      const now = new Date().toISOString();

      db.transaction(() => {
        for (let i = 0; i < seedData.length; i++) {
          const entry = seedData[i];
          insertStmt.run(
            uuidv4(),
            `seed-${i}`,
            entry.subject,
            entry.body,
            entry.from,
            now,
            now,
            now
          );
        }
      })();

      return NextResponse.json({ seeded: seedData.length });
    }

    if (action === "run") {
      // 1. Run classifier on any unclassified items (including seed items)
      const { processed } = await classifyUnprocessed();

      // 2. Read back all seed items with priority_score
      const seedItems = db.prepare(
        "SELECT source_id, title, priority_score FROM items WHERE seed = 1 AND priority_score IS NOT NULL"
      ).all() as any[];

      // 3. Load validation.json to get my_label
      const seedPath = path.join(process.cwd(), "seed-data", "validation.json");
      const seedData = JSON.parse(fs.readFileSync(seedPath, "utf-8"));

      const myLabels: number[] = [];
      const systemScores: number[] = [];
      const points: any[] = [];

      for (const item of seedItems) {
        const index = parseInt(item.source_id.split("-")[1], 10);
        const entry = seedData[index];
        if (entry) {
          myLabels.push(entry.my_label);
          systemScores.push(item.priority_score);
          points.push({
            myLabel: entry.my_label,
            systemScore: item.priority_score,
            subject: item.title,
          });
        }
      }

      const correlation = spearmanCorrelation(myLabels, systemScores);

      return NextResponse.json({
        processed,
        correlation,
        points,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
