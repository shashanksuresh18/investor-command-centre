import type { Item } from "./schema";

export interface ScoreWeights {
  financial_impact: number;
  urgency: number;
  relationship_importance: number;
  actionability: number;
  risk: number;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  financial_impact: 0.30,
  urgency: 0.25,
  relationship_importance: 0.20,
  actionability: 0.15,
  risk: 0.10,
};

export function calculateScoreWithWeights(
  item: Pick<Item, "financial_impact" | "urgency" | "relationship_importance" | "actionability" | "risk">,
  weights: ScoreWeights
): number | null {
  const { financial_impact, urgency, relationship_importance, actionability, risk } = item;
  if (
    financial_impact == null ||
    urgency == null ||
    relationship_importance == null ||
    actionability == null ||
    risk == null
  ) {
    return null;
  }

  const raw =
    weights.financial_impact * financial_impact +
    weights.urgency * urgency +
    weights.relationship_importance * relationship_importance +
    weights.actionability * actionability +
    weights.risk * risk;

  return Math.min(100, Math.max(0, raw * 10));
}

export function calculateScore(
  item: Pick<Item, "financial_impact" | "urgency" | "relationship_importance" | "actionability" | "risk">
): number | null {
  return calculateScoreWithWeights(item, DEFAULT_WEIGHTS);
}
