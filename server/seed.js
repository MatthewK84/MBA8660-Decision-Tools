/**
 * Seeds instructor-authored reference data from data/*.json.
 *
 * Idempotent: every insert upserts on a natural key, so running this after
 * every deploy is safe. Run with `npm run seed`.
 */

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv } from "./config.js";
import { connectWithRetry, createPool } from "./db.js";
import { runMigrations } from "./migrate.js";
import { assertNoStudentColumns } from "./privacy-guard.js";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

/**
 * Read and parse one JSON data file.
 *
 * @param {string} filename
 * @returns {Promise<unknown[]>}
 */
async function readJson(filename) {
  const raw = await readFile(join(DATA_DIR, filename), "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${filename} must contain a JSON array.`);
  }
  return parsed;
}

/**
 * Upsert case organizations.
 *
 * @param {import("pg").Pool} pool
 * @param {unknown[]} rows
 * @returns {Promise<number>}
 */
async function seedScenarios(pool, rows) {
  for (const row of rows) {
    const s = /** @type {Record<string, unknown>} */ (row);
    await pool.query(
      `INSERT INTO scenario (code, name, sector, annual_budget_ceiling_usd, workload_profile, narrative)
            VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (code) DO UPDATE
              SET name = EXCLUDED.name,
                  sector = EXCLUDED.sector,
                  annual_budget_ceiling_usd = EXCLUDED.annual_budget_ceiling_usd,
                  workload_profile = EXCLUDED.workload_profile,
                  narrative = EXCLUDED.narrative,
                  updated_at = NOW()`,
      [s.code, s.name, s.sector, s.annualBudgetCeilingUsd, JSON.stringify(s.workloadProfile ?? {}), s.narrative ?? ""]
    );
  }
  return rows.length;
}

/**
 * Insert reference prices, skipping placeholder rows and rows already held.
 *
 * `price_reference` is a dated snapshot table: the same product retrieved on
 * two different dates is two legitimate rows, and keeping both is the point.
 * The natural key is therefore (vendor, product, retrieved_at), and this
 * guards on it so re-seeding is idempotent.
 *
 * The guard lives here rather than in a unique index because a deployment
 * that has already been seeded more than once holds duplicates, and adding
 * the index would fail the migration and stop the server from booting. See
 * "Removing duplicate price rows" in the README for the one-time cleanup.
 *
 * @param {import("pg").Pool} pool
 * @param {unknown[]} rows
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
async function seedPrices(pool, rows) {
  const real = rows.filter((row) => /** @type {Record<string, unknown>} */ (row).vendor !== "REPLACE_ME");
  let inserted = 0;
  for (const row of real) {
    const p = /** @type {Record<string, unknown>} */ (row);
    const { rowCount } = await pool.query(
      `INSERT INTO price_reference (vendor, product, unit_label, unit_price_usd, retrieved_at, source_url, note)
            SELECT $1, $2, $3, $4, $5, $6, $7
             WHERE NOT EXISTS (
                   SELECT 1 FROM price_reference
                    WHERE vendor = $1 AND product = $2 AND retrieved_at = $5
             )`,
      [p.vendor, p.product, p.unitLabel, p.unitPriceUsd, p.retrievedAt, p.sourceUrl ?? "", p.note ?? ""]
    );
    inserted += rowCount ?? 0;
  }
  return { inserted, skipped: real.length - inserted };
}

/**
 * Upsert weekly source links on the (week, url) natural key.
 *
 * @param {import("pg").Pool} pool
 * @param {unknown[]} rows
 * @returns {Promise<number>}
 */
async function seedSources(pool, rows) {
  for (const row of rows) {
    const s = /** @type {Record<string, unknown>} */ (row);
    await pool.query(
      `INSERT INTO source_link (week, title, url, source_class, is_foundational)
            VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (week, url) DO UPDATE
              SET title = EXCLUDED.title,
                  source_class = EXCLUDED.source_class,
                  is_foundational = EXCLUDED.is_foundational`,
      [s.week, s.title, s.url, s.sourceClass, s.isFoundational ?? false]
    );
  }
  return rows.length;
}

/**
 * Run the full seed.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const config = readEnv(process.env);
  const pool = createPool(config);
  if (pool === null) {
    throw new Error("DATABASE_URL is not set. Nothing to seed.");
  }
  await connectWithRetry(pool, (message) => {
    console.log(message);
  });
  await runMigrations(pool);
  await assertNoStudentColumns(pool);

  const scenarios = await seedScenarios(pool, await readJson("scenarios.json"));
  const prices = await seedPrices(pool, await readJson("price-reference.json"));
  const sources = await seedSources(pool, await readJson("sources.json"));

  const priceReport = prices.skipped === 0
    ? `${String(prices.inserted)} prices`
    : `${String(prices.inserted)} new prices, ${String(prices.skipped)} already current`;
  console.log(`Seeded ${String(scenarios)} scenarios, ${priceReport}, ${String(sources)} sources.`);
  await pool.end();
}

/** Exported for the integration suite, which asserts re-seeding is idempotent. */
export { seedPrices as seedPricesForTest };

/**
 * True only when this file was run directly, as `npm run seed` does.
 *
 * Without this guard, importing the module to test one function would run the
 * whole seed against whatever DATABASE_URL happened to be set, which is a
 * genuinely bad thing for a test to do by accident.
 *
 * @returns {boolean}
 */
function isDirectRun() {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Seed failed: ${message}`);
    process.exit(1);
  });
}
