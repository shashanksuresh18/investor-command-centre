import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import db from "./db";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const HAIKU_MODEL = "claude-haiku-4-5";
const SONNET_MODEL = "claude-sonnet-4-6";

// Approximate USD cost per 1M tokens (update when pricing changes)
const COST_PER_M: Record<string, { input: number; output: number }> = {
  [HAIKU_MODEL]: { input: 0.80, output: 4.00 },
  [SONNET_MODEL]: { input: 3.00, output: 15.00 },
};

function logCall(
  model: string,
  input_tokens: number,
  output_tokens: number,
  purpose: string
) {
  const pricing = COST_PER_M[model] ?? { input: 0, output: 0 };
  const cost_usd =
    (input_tokens / 1_000_000) * pricing.input +
    (output_tokens / 1_000_000) * pricing.output;

  db.prepare(`
    INSERT INTO llm_calls (id, model, input_tokens, output_tokens, cost_usd, purpose, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    model,
    input_tokens,
    output_tokens,
    cost_usd,
    purpose,
    new Date().toISOString()
  );
}

export async function classifyWithHaiku(
  systemPrompt: string,
  userInput: string,
  purpose = "classify"
): Promise<string> {
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userInput }],
  });

  const usage = response.usage;
  logCall(HAIKU_MODEL, usage.input_tokens, usage.output_tokens, purpose);

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type from Haiku");
  return block.text;
}

export async function synthesiseWithSonnet(
  systemPrompt: string,
  userInput: string,
  purpose = "briefing"
): Promise<string> {
  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userInput }],
  });

  const usage = response.usage;
  logCall(SONNET_MODEL, usage.input_tokens, usage.output_tokens, purpose);

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type from Sonnet");
  return block.text;
}
