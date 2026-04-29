import { z } from "zod";

export const ItemSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(["gmail", "trading212", "notion"]),
  source_id: z.string(),
  source_account: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  sender: z.string(),
  timestamp: z.string().datetime(),
  classified: z.boolean(),
  category: z
    .enum(["portfolio", "pipeline", "admin", "personal", "newsletter", "noise"])
    .nullable(),
  urgency: z.number().int().min(1).max(10).nullable(),
  financial_impact: z.number().int().min(1).max(10).nullable(),
  relationship_importance: z.number().int().min(1).max(10).nullable(),
  actionability: z.number().int().min(1).max(10).nullable(),
  risk: z.number().int().min(1).max(10).nullable(),
  action_required: z.boolean().nullable(),
  suggested_action: z.string().nullable(),
  reasoning: z.string().nullable(),
  priority_score: z.number().min(0).max(100).nullable(),
  user_feedback: z.enum(["important", "noise"]).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Item = z.infer<typeof ItemSchema>;

export const BriefingSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  content: z.string(),
  top_item_ids_json: z.string(),
  created_at: z.string().datetime(),
});

export type Briefing = z.infer<typeof BriefingSchema>;

export const LlmCallSchema = z.object({
  id: z.string().uuid(),
  model: z.string(),
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  cost_usd: z.number(),
  purpose: z.string(),
  created_at: z.string().datetime(),
});

export type LlmCall = z.infer<typeof LlmCallSchema>;
