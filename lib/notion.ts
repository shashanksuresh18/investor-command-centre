import { randomUUID } from "crypto";
import { Client } from "@notionhq/client";
import db from "./db";

export interface NotionTask {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  priority: "High" | "Medium" | "Low" | null;
}

type NotionProperty = Record<string, any>;

function getClient(): Client {
  const auth = process.env.NOTION_API_KEY;
  if (!auth) throw new Error("Notion: NOTION_API_KEY is not set");
  return new Client({ auth });
}

function getDatabaseId(): string {
  const databaseId = process.env.NOTION_TASKS_DATABASE_ID;
  if (!databaseId) throw new Error("Notion: NOTION_TASKS_DATABASE_ID is not set");
  return databaseId;
}

function findPropertyByType(
  properties: Record<string, NotionProperty>,
  type: string
): NotionProperty | undefined {
  return Object.values(properties).find((property) => property.type === type);
}

function getTitle(properties: Record<string, NotionProperty>): string {
  const titleProperty =
    properties.Name?.type === "title"
      ? properties.Name
      : findPropertyByType(properties, "title");

  if (!titleProperty) {
    throw new Error(
      `Notion: no title property found. Actual properties: ${Object.keys(
        properties
      ).join(", ")}`
    );
  }

  const plainText = titleProperty?.title
    ?.map((part: { plain_text?: string }) => part.plain_text ?? "")
    .join("")
    .trim();

  return plainText || "(no title)";
}

function getStatus(properties: Record<string, NotionProperty>): string {
  const statusProperty = properties.Status;
  if (statusProperty?.type === "status") {
    return statusProperty.status?.name ?? "Unknown";
  }
  if (statusProperty?.type === "select") {
    return statusProperty.select?.name ?? "Unknown";
  }

  return "Unknown";
}

function getDueDate(properties: Record<string, NotionProperty>): string | null {
  const dueProperty =
    properties.Due?.type === "date"
      ? properties.Due
      : properties["Due Date"]?.type === "date"
        ? properties["Due Date"]
        : undefined;
  const start = dueProperty?.date?.start;
  if (!start) return null;

  return new Date(start).toISOString();
}

function getPriority(
  properties: Record<string, NotionProperty>
): NotionTask["priority"] {
  const priorityProperty = properties.Priority;
  const value =
    priorityProperty?.type === "select" ? priorityProperty.select?.name : null;

  if (value === "High" || value === "Medium" || value === "Low") {
    return value;
  }

  return null;
}

function mapPageToTask(page: { id: string; properties?: unknown }): NotionTask {
  const properties = (page.properties ?? {}) as Record<string, NotionProperty>;

  return {
    id: page.id,
    title: getTitle(properties),
    status: getStatus(properties),
    due_date: getDueDate(properties),
    priority: getPriority(properties),
  };
}

function scoreForPriority(priority: NotionTask["priority"]): {
  urgency: number;
  priority_score: number;
} {
  if (priority === "High") return { urgency: 9, priority_score: 75.0 };
  if (priority === "Medium") return { urgency: 6, priority_score: 50.0 };
  if (priority === "Low") return { urgency: 3, priority_score: 25.0 };
  return { urgency: 5, priority_score: 40.0 };
}

export async function fetchTasks(): Promise<NotionTask[]> {
  const client = getClient();
  const databaseId = getDatabaseId();
  const tasks: NotionTask[] = [];
  let startCursor: string | undefined;

  do {
    const response = await client.databases.query({
      database_id: databaseId,
      page_size: 100,
      start_cursor: startCursor,
    });

    tasks.push(
      ...response.results
        .filter((page) => "properties" in page)
        .map((page) =>
          mapPageToTask({
            id: page.id,
            properties: page.properties,
          })
        )
    );
    startCursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (startCursor);

  return tasks;
}

export async function syncTasksToItems(): Promise<{ upserted: number }> {
  const tasks = await fetchTasks();
  const insert = db.prepare(`
    INSERT INTO items (
      id, source, source_id, title, body, sender, timestamp, classified,
      category, urgency, financial_impact, relationship_importance,
      actionability, risk, action_required, suggested_action, reasoning,
      priority_score, user_feedback, created_at, updated_at, seed, source_account
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(source, source_id) DO UPDATE SET
      body = excluded.body,
      urgency = excluded.urgency,
      priority_score = excluded.priority_score,
      updated_at = excluded.updated_at
  `);

  let upserted = 0;

  for (const task of tasks) {
    const now = new Date().toISOString();
    const score = scoreForPriority(task.priority);
    const result = insert.run(
      randomUUID(),
      "notion",
      task.id,
      task.title,
      JSON.stringify(task),
      "notion",
      task.due_date ?? now,
      1,
      "admin",
      score.urgency,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      score.priority_score,
      null,
      now,
      now,
      0,
      null
    );

    upserted += result.changes;
  }

  return { upserted };
}
