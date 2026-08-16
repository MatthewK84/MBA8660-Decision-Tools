/**
 * Seeds instructor-authored reference data from data/*.json.
 *
 * Idempotent: every insert upserts on a natural key, so running this after
 * every deploy is safe. Run with `npm run seed`.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
 * Insert reference prices, skipping placeholder rows.
 *
 * @param {import("pg").Pool} pool
 * @param {unknown[]} rows
 * @returns {Promise<number>}
 */
async function seedPrices(pool, rows) {
  const real = rows.filter((row) => /** @type {Record<string, unknown>} */ (row).vendor !== "REPLACE_ME");
  for (const row of real) {
    const p = /** @type {Record<string, unknown>} */ (row);
    await pool.query(
      `INSERT INTO price_reference (vendor, product, unit_label, unit_price_usd, retrieved_at, source_url, note)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [p.vendor, p.product, p.unitLabel, p.unitPriceUsd, p.retrievedAt, p.sourceUrl ?? "", p.note ?? ""]
    );
  }
  return real.length;
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

  console.log(`Seeded ${String(scenarios)} scenarios, ${String(prices)} prices, ${String(sources)} sources.`);
  await pool.end();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed failed: ${message}`);
  process.exit(1);
});
