import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "cmdcentre.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id                      TEXT PRIMARY KEY,
    source                  TEXT NOT NULL CHECK(source IN ('gmail','trading212','notion')),
    source_id               TEXT NOT NULL,
    title                   TEXT NOT NULL,
    body                    TEXT NOT NULL,
    sender                  TEXT NOT NULL,
    timestamp               TEXT NOT NULL,
    classified              INTEGER NOT NULL DEFAULT 0,
    category                TEXT CHECK(category IN ('portfolio','pipeline','admin','personal','newsletter','noise')),
    urgency                 INTEGER CHECK(urgency BETWEEN 1 AND 10),
    financial_impact        INTEGER CHECK(financial_impact BETWEEN 1 AND 10),
    relationship_importance INTEGER CHECK(relationship_importance BETWEEN 1 AND 10),
    actionability           INTEGER CHECK(actionability BETWEEN 1 AND 10),
    risk                    INTEGER CHECK(risk BETWEEN 1 AND 10),
    action_required         INTEGER,
    suggested_action        TEXT,
    reasoning               TEXT,
    priority_score          REAL CHECK(priority_score BETWEEN 0 AND 100),
    user_feedback           TEXT CHECK(user_feedback IN ('important','noise')),
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    seed                    INTEGER NOT NULL DEFAULT 0,
    source_account          TEXT,
    UNIQUE(source, source_id)
  );

  CREATE TABLE IF NOT EXISTS briefings (
    id                TEXT PRIMARY KEY,
    date              TEXT NOT NULL UNIQUE,
    content           TEXT NOT NULL,
    top_item_ids_json TEXT NOT NULL,
    created_at        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS llm_calls (
    id            TEXT PRIMARY KEY,
    model         TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd      REAL NOT NULL,
    purpose       TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );
`);

try {
  db.exec("ALTER TABLE items ADD COLUMN seed INTEGER NOT NULL DEFAULT 0");
} catch {
  // column already exists on subsequent starts — safe to ignore
}

try {
  db.exec("ALTER TABLE items ADD COLUMN source_account TEXT");
} catch {
  // column already exists on subsequent starts - safe to ignore
}

try {
  db.exec(
    "CREATE UNIQUE INDEX idx_items_src_account ON items(source, source_id, COALESCE(source_account, ''))"
  );
} catch {
  // index already exists on subsequent starts - safe to ignore
}

try {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'"
  ).get() as { sql: string } | undefined;

  if (row && !row.sql.includes("'notion'")) {
    db.exec(`
      BEGIN;
      CREATE TABLE items_migration (
        id                      TEXT PRIMARY KEY,
        source                  TEXT NOT NULL CHECK(source IN ('gmail','trading212','notion')),
        source_id               TEXT NOT NULL,
        title                   TEXT NOT NULL,
        body                    TEXT NOT NULL,
        sender                  TEXT NOT NULL,
        timestamp               TEXT NOT NULL,
        classified              INTEGER NOT NULL DEFAULT 0,
        category                TEXT CHECK(category IN ('portfolio','pipeline','admin','personal','newsletter','noise')),
        urgency                 INTEGER CHECK(urgency BETWEEN 1 AND 10),
        financial_impact        INTEGER CHECK(financial_impact BETWEEN 1 AND 10),
        relationship_importance INTEGER CHECK(relationship_importance BETWEEN 1 AND 10),
        actionability           INTEGER CHECK(actionability BETWEEN 1 AND 10),
        risk                    INTEGER CHECK(risk BETWEEN 1 AND 10),
        action_required         INTEGER,
        suggested_action        TEXT,
        reasoning               TEXT,
        priority_score          REAL CHECK(priority_score BETWEEN 0 AND 100),
        user_feedback           TEXT CHECK(user_feedback IN ('important','noise')),
        created_at              TEXT NOT NULL,
        updated_at              TEXT NOT NULL,
        seed                    INTEGER NOT NULL DEFAULT 0,
        source_account          TEXT,
        UNIQUE(source, source_id)
      );
      INSERT INTO items_migration SELECT * FROM items;
      DROP TABLE items;
      ALTER TABLE items_migration RENAME TO items;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_items_src_account
        ON items(source, source_id, COALESCE(source_account, ''));
      COMMIT;
    `);
  }
} catch {
  // migration already applied or table does not exist yet - safe to ignore
}

export default db;
