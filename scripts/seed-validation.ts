import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import db from "../lib/db";

async function main() {
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

  console.log(`Seeded ${seedData.length} items.`);
}

main().catch(console.error);
