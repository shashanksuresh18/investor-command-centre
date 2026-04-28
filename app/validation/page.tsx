import db from "@/lib/db";
import { spearmanCorrelation } from "@/lib/stats";
import fs from "fs";
import path from "path";
import ValidationClient from "./ValidationClient";

export const dynamic = "force-dynamic";

export default async function ValidationPage() {
  // Read back all seed items with priority_score
  const seedItems = db.prepare(
    "SELECT source_id, title, priority_score FROM items WHERE seed = 1 AND priority_score IS NOT NULL"
  ).all() as any[];

  // Load validation.json to get my_label
  let initialPoints: any[] = [];
  let initialCorrelation: number | null = null;

  try {
    const seedPath = path.join(process.cwd(), "seed-data", "validation.json");
    if (fs.existsSync(seedPath)) {
      const seedData = JSON.parse(fs.readFileSync(seedPath, "utf-8"));

      const myLabels: number[] = [];
      const systemScores: number[] = [];

      for (const item of seedItems) {
        const index = parseInt(item.source_id.split("-")[1], 10);
        const entry = seedData[index];
        if (entry) {
          myLabels.push(entry.my_label);
          systemScores.push(item.priority_score);
          initialPoints.push({
            myLabel: entry.my_label,
            systemScore: item.priority_score,
            subject: item.title,
          });
        }
      }

      if (myLabels.length >= 2) {
        initialCorrelation = spearmanCorrelation(myLabels, systemScores);
      }
    }
  } catch (e) {
    console.error("Error loading initial validation data", e);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <a href="/" className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </a>
          <h1 className="text-3xl font-bold">System Validation</h1>
        </div>

        <ValidationClient initialPoints={initialPoints} initialCorrelation={initialCorrelation} />
      </div>
    </div>
  );
}
