/**
 * Schema migrations. Every statement is additive and idempotent, so running
 * this on every boot is safe and no migration state table is required.
 *
 * Nothing declared here can hold student work. See server/privacy-guard.js,
 * which enforces that claim against the live schema at startup rather than
 * trusting this comment.
 */

/** @type {readonly string[]} */
const STATEMENTS = Object.freeze([
  `CREATE TABLE IF NOT EXISTS scenario (
     code                      TEXT PRIMARY KEY,
     name                      TEXT NOT NULL,
     sector                    TEXT NOT NULL DEFAULT '',
     annual_budget_ceiling_usd NUMERIC(14,2) NOT NULL CHECK (annual_budget_ceiling_usd > 0),
     workload_profile          JSONB NOT NULL DEFAULT '{}'::jsonb,
     narrative                 TEXT NOT NULL DEFAULT '',
     is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
     created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  `CREATE TABLE IF NOT EXISTS price_reference (
     id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     vendor         TEXT NOT NULL,
     product        TEXT NOT NULL,
     unit_label     TEXT NOT NULL,
     unit_price_usd NUMERIC(14,6) NOT NULL CHECK (unit_price_usd >= 0),
     currency       TEXT NOT NULL DEFAULT 'USD',
     retrieved_at   DATE NOT NULL,
     source_url     TEXT NOT NULL DEFAULT '',
     note           TEXT NOT NULL DEFAULT '',
     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  `CREATE TABLE IF NOT EXISTS source_link (
     id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     week            SMALLINT NOT NULL CHECK (week BETWEEN 1 AND 15),
     title           TEXT NOT NULL,
     url             TEXT NOT NULL,
     source_class    TEXT NOT NULL,
     is_foundational BOOLEAN NOT NULL DEFAULT FALSE,
     published_on    DATE,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  `CREATE TABLE IF NOT EXISTS tool_usage_daily (
     tool_slug    TEXT NOT NULL CHECK (char_length(tool_slug) <= 32),
     usage_date   DATE NOT NULL,
     run_count    INTEGER NOT NULL DEFAULT 0 CHECK (run_count >= 0),
     export_count INTEGER NOT NULL DEFAULT 0 CHECK (export_count >= 0),
     PRIMARY KEY (tool_slug, usage_date)
   )`,

  `CREATE INDEX IF NOT EXISTS price_reference_vendor_idx
     ON price_reference (vendor, retrieved_at DESC)`,

  `CREATE INDEX IF NOT EXISTS source_link_week_idx ON source_link (week)`,

  `CREATE UNIQUE INDEX IF NOT EXISTS source_link_unique_idx ON source_link (week, url)`,
]);

/**
 * Apply every migration statement inside one transaction.
 *
 * @param {import("pg").Pool} pool
 * @returns {Promise<number>}
 */
export async function runMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of STATEMENTS) {
      await client.query(statement);
    }
    await client.query("COMMIT");
    return STATEMENTS.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    client.release();
  }
}

/** Exported for tests that assert the schema stays additive. */
export { STATEMENTS };
