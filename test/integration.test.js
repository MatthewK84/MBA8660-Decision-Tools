/**
 * Integration tests. Requires a real PostgreSQL instance at TEST_DATABASE_URL.
 * Skipped automatically when that variable is absent, so `npm test` stays fast
 * and dependency-free on a laptop with no database.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";

import { runMigrations } from "../server/migrate.js";
import { assertNoStudentColumns, COLUMN_ALLOWLIST } from "../server/privacy-guard.js";
import { listPrices, listScenarios, recordUsage, summariseUsage } from "../server/repository/reference.js";
import { allRates } from "../server/reference/rates.js";

const URL = process.env.TEST_DATABASE_URL ?? "";
const NOW = new Date("2026-08-15T12:00:00Z");

describe("postgres integration", { skip: URL === "" ? "TEST_DATABASE_URL not set" : false }, () => {
  /** @type {import("pg").Pool} */
  let pool;

  before(async () => {
    pool = new pg.Pool({ connectionString: URL, max: 3 });
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  });

  after(async () => {
    await pool.end();
  });

  it("applies migrations from an empty schema", async () => {
    const applied = await runMigrations(pool);
    assert.ok(applied > 0);
    const { rows } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    assert.deepEqual(
      rows.map((r) => r.table_name),
      ["price_reference", "scenario", "source_link", "tool_usage_daily"]
    );
  });

  it("is idempotent, so running migrations twice changes nothing", async () => {
    const before2 = await pool.query("SELECT count(*) FROM information_schema.columns WHERE table_schema='public'");
    await runMigrations(pool);
    const after2 = await pool.query("SELECT count(*) FROM information_schema.columns WHERE table_schema='public'");
    assert.equal(before2.rows[0].count, after2.rows[0].count);
  });

  it("passes the privacy guard on the real migrated schema", async () => {
    await assertNoStudentColumns(pool);
  });

  it("fails the privacy guard the moment a student column appears", async () => {
    await pool.query("ALTER TABLE scenario ADD COLUMN student_email TEXT");
    await assert.rejects(() => assertNoStudentColumns(pool), /Privacy guard failed/);
    await pool.query("ALTER TABLE scenario DROP COLUMN student_email");
    await assertNoStudentColumns(pool);
  });

  it("declares in the live schema exactly what the allowlist declares", async () => {
    const { rows } = await pool.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'"
    );
    for (const row of rows) {
      const permitted = COLUMN_ALLOWLIST[row.table_name];
      assert.ok(permitted !== undefined, `unlisted table ${row.table_name}`);
      assert.ok(permitted.includes(row.column_name), `unlisted column ${row.table_name}.${row.column_name}`);
    }
  });

  it("round-trips a scenario", async () => {
    await pool.query(
      `INSERT INTO scenario (code, name, sector, annual_budget_ceiling_usd, workload_profile, narrative)
       VALUES ('TESTCO', 'Test Company', 'Testing', 500000, '{"largestTableRows": 100}'::jsonb, 'A narrative.')`
    );
    const scenarios = await listScenarios(pool);
    const found = scenarios.find((s) => s.code === "TESTCO");
    assert.ok(found !== undefined);
    assert.equal(found.annualBudgetCeilingUsd, 500000);
    assert.equal(found.workloadProfile.largestTableRows, 100);
  });

  it("increments usage counters without storing anything else", async () => {
    await recordUsage(pool, "sizing", "run", NOW);
    await recordUsage(pool, "sizing", "run", NOW);
    await recordUsage(pool, "sizing", "export", NOW);
    const summary = await summariseUsage(pool);
    const sizing = summary.find((s) => s.toolSlug === "sizing");
    assert.ok(sizing !== undefined);
    assert.equal(sizing.runs, 2);
    assert.equal(sizing.exports, 1);

    const { rows } = await pool.query("SELECT * FROM tool_usage_daily");
    assert.deepEqual(Object.keys(rows[0]).sort(), ["export_count", "run_count", "tool_slug", "usage_date"]);
  });

  it("rejects a tool slug long enough to smuggle content", async () => {
    await assert.rejects(() => recordUsage(pool, "x".repeat(64), "run", NOW), /violates check constraint/);
  });

  it("seeds every published price exactly once, however often the seeder runs", async () => {
    // The instructor is told to re-run `npm run seed` after every deploy and
    // whenever prices are re-verified. A bare INSERT would duplicate the whole
    // price table on each run and quietly corrupt what students are shown.
    const { seedPricesForTest } = await import("../server/seed.js");
    const rows = allRates().map(({ key: _key, ...rest }) => rest);

    await pool.query("TRUNCATE price_reference");
    const first = await seedPricesForTest(pool, rows);
    const second = await seedPricesForTest(pool, rows);
    const third = await seedPricesForTest(pool, rows);

    assert.equal(first.inserted, rows.length, "first seed should insert every rate");
    assert.equal(second.inserted, 0, "second seed should insert nothing");
    assert.equal(third.inserted, 0, "third seed should insert nothing");

    const stored = await listPrices(pool);
    assert.equal(stored.length, rows.length, "price table grew across re-seeds");

    const { rows: dupes } = await pool.query(
      `SELECT vendor, product, retrieved_at FROM price_reference
        GROUP BY vendor, product, retrieved_at HAVING count(*) > 1`
    );
    assert.deepEqual(dupes, [], "the same price was stored twice");
  });

  it("adds a genuinely new price snapshot without disturbing the old one", async () => {
    // A later retrieval date is a new row on purpose: this table is a dated
    // snapshot, and the history of what a price was on a given day is evidence.
    const { seedPricesForTest } = await import("../server/seed.js");
    const rows = allRates().map(({ key: _key, ...rest }) => rest);
    await pool.query("TRUNCATE price_reference");
    await seedPricesForTest(pool, rows);

    const reprice = rows.map((r, i) => (i === 0 ? { ...r, retrievedAt: "2027-01-15", unitPriceUsd: 0.031 } : r));
    const result = await seedPricesForTest(pool, reprice);

    assert.equal(result.inserted, 1, "a re-dated price should be added, not swallowed");
    assert.equal((await listPrices(pool)).length, rows.length + 1);
  });

  it("rejects a negative budget ceiling", async () => {
    await assert.rejects(
      () => pool.query("INSERT INTO scenario (code, name, annual_budget_ceiling_usd) VALUES ('BAD','Bad',-1)"),
      /violates check constraint/
    );
  });
});
