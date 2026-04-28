import db from "./db";
import { classifyWithHaiku } from "./llm";
import { CLASSIFY_SYSTEM_PROMPT, buildClassifyUserPrompt } from "./prompts/classify";
import { calculateScore } from "./scoring";
import type { Item } from "./schema";

type ItemRow = Omit<Item, "classified" | "action_required"> & {
  classified: number;
  action_required: number | null;
};

interface ClassificationResult {
  category: Item["category"];
  urgency: number;
  financial_impact: number;
  relationship_importance: number;
  actionability: number;
  risk: number;
  action_required: boolean;
  suggested_action: string | null;
  reasoning: string;
}

function toItem(row: ItemRow): Item {
  return {
    ...row,
    classified: Boolean(row.classified),
    action_required:
      row.action_required == null ? null : Boolean(row.action_required),
  };
}

// Haiku 4.5 occasionally wraps JSON in markdown fences despite instructions not to.
function stripJsonFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

// Model occasionally returns 0 or 11 despite the 1-10 instruction; clamp defensively.
function clampScore(value: unknown): number {
  const n = Number(value);
  return Math.min(10, Math.max(1, isNaN(n) ? 1 : Math.round(n)));
}

function normalise(raw: ClassificationResult): ClassificationResult {
  return {
    ...raw,
    urgency: clampScore(raw.urgency),
    financial_impact: clampScore(raw.financial_impact),
    relationship_importance: clampScore(raw.relationship_importance),
    actionability: clampScore(raw.actionability),
    risk: clampScore(raw.risk),
  };
}

async function classifyWithRetry(item: Item): Promise<ClassificationResult | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await classifyWithHaiku(
      CLASSIFY_SYSTEM_PROMPT,
      buildClassifyUserPrompt(item),
      "classify"
    );

    try {
      return normalise(JSON.parse(stripJsonFences(raw)) as ClassificationResult);
    } catch (error) {
      if (attempt === 1) {
        console.error(`Failed to parse classification JSON for item ${item.id}`, error);
      }
    }
  }

  return null;
}

function getClassificationCostTotal(): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(cost_usd), 0) as total FROM llm_calls WHERE purpose = ?")
    .get("classify") as { total: number };
  return row.total;
}

export async function classifyUnprocessed(): Promise<{
  processed: number;
  cost_usd: number;
}> {
  const beforeCost = getClassificationCostTotal();
  const rows = db
    .prepare("SELECT * FROM items WHERE classified = 0 ORDER BY timestamp DESC")
    .all() as ItemRow[];

  const updateClassification = db.prepare(`
    UPDATE items SET
      category = ?, urgency = ?, financial_impact = ?,
      relationship_importance = ?, actionability = ?, risk = ?,
      action_required = ?, suggested_action = ?, reasoning = ?,
      classified = 1, updated_at = ?
    WHERE id = ?
  `);

  const updateScore = db.prepare(`
    UPDATE items SET priority_score = ?, updated_at = ? WHERE id = ?
  `);

  let processed = 0;

  for (let offset = 0; offset < rows.length; offset += 10) {
    const batch = rows.slice(offset, offset + 10);

    for (const row of batch) {
      const item = toItem(row);
      const result = await classifyWithRetry(item);
      if (!result) continue;

      const updatedAt = new Date().toISOString();
      updateClassification.run(
        result.category,
        result.urgency,
        result.financial_impact,
        result.relationship_importance,
        result.actionability,
        result.risk,
        result.action_required ? 1 : 0,
        result.suggested_action,
        result.reasoning,
        updatedAt,
        item.id
      );

      const priorityScore = calculateScore({
        financial_impact: result.financial_impact,
        urgency: result.urgency,
        relationship_importance: result.relationship_importance,
        actionability: result.actionability,
        risk: result.risk,
      });

      if (priorityScore != null) {
        updateScore.run(priorityScore, new Date().toISOString(), item.id);
      }

      processed += 1;
    }
  }

  const afterCost = getClassificationCostTotal();
  return { processed, cost_usd: afterCost - beforeCost };
}
