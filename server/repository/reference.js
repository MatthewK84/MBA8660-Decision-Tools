/**
 * Read access to instructor-authored reference data, and write access to
 * aggregate counters. There is no repository for student work because there
 * is no student work in this database.
 */

/**
 * @typedef {{
 *   code: string, name: string, sector: string,
 *   annualBudgetCeilingUsd: number, workloadProfile: Record<string, unknown>,
 *   narrative: string
 * }} Scenario
 * @typedef {{
 *   vendor: string, product: string, unitLabel: string,
 *   unitPriceUsd: number, currency: string, retrievedAt: string,
 *   sourceUrl: string, note: string
 * }} PriceReference
 * @typedef {{ week: number, title: string, url: string, sourceClass: string, isFoundational: boolean }} SourceLink
 */

/**
 * List every active case organization.
 *
 * @param {import("pg").Pool} pool
 * @returns {Promise<Scenario[]>}
 */
export async function listScenarios(pool) {
  const { rows } = await pool.query(
    `SELECT code, name, sector, annual_budget_ceiling_usd, workload_profile, narrative
       FROM scenario WHERE is_active = TRUE ORDER BY code`
  );
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    sector: row.sector,
    annualBudgetCeilingUsd: Number(row.annual_budget_ceiling_usd),
    workloadProfile: row.workload_profile,
    narrative: row.narrative,
  }));
}

/**
 * List reference prices, newest retrieval first.
 *
 * @param {import("pg").Pool} pool
 * @returns {Promise<PriceReference[]>}
 */
export async function listPrices(pool) {
  const { rows } = await pool.query(
    `SELECT vendor, product, unit_label, unit_price_usd, currency, retrieved_at, source_url, note
       FROM price_reference ORDER BY vendor, product, retrieved_at DESC`
  );
  return rows.map((row) => ({
    vendor: row.vendor,
    product: row.product,
    unitLabel: row.unit_label,
    unitPriceUsd: Number(row.unit_price_usd),
    currency: row.currency,
    retrievedAt: row.retrieved_at.toISOString().slice(0, 10),
    sourceUrl: row.source_url,
    note: row.note,
  }));
}

/**
 * List the assigned sources for one week.
 *
 * @param {import("pg").Pool} pool
 * @param {number} week
 * @returns {Promise<SourceLink[]>}
 */
export async function listSources(pool, week) {
  const { rows } = await pool.query(
    `SELECT week, title, url, source_class, is_foundational
       FROM source_link WHERE week = $1 ORDER BY is_foundational DESC, title`,
    [week]
  );
  return rows.map((row) => ({
    week: row.week,
    title: row.title,
    url: row.url,
    sourceClass: row.source_class,
    isFoundational: row.is_foundational,
  }));
}

/**
 * Increment a daily counter. The only values written are a tool slug, a date,
 * and an integer. No request body ever reaches this function.
 *
 * @param {import("pg").Pool} pool
 * @param {string} toolSlug
 * @param {"run" | "export"} kind
 * @param {Date} now
 * @returns {Promise<void>}
 */
export async function recordUsage(pool, toolSlug, kind, now) {
  const usageDate = now.toISOString().slice(0, 10);
  const runDelta = kind === "run" ? 1 : 0;
  const exportDelta = kind === "export" ? 1 : 0;
  await pool.query(
    `INSERT INTO tool_usage_daily (tool_slug, usage_date, run_count, export_count)
          VALUES ($1, $2, $3, $4)
     ON CONFLICT (tool_slug, usage_date) DO UPDATE
            SET run_count    = tool_usage_daily.run_count    + EXCLUDED.run_count,
                export_count = tool_usage_daily.export_count + EXCLUDED.export_count`,
    [toolSlug, usageDate, runDelta, exportDelta]
  );
}

/**
 * Aggregate usage for the instructor dashboard.
 *
 * @param {import("pg").Pool} pool
 * @returns {Promise<{ toolSlug: string, runs: number, exports: number }[]>}
 */
export async function summariseUsage(pool) {
  const { rows } = await pool.query(
    `SELECT tool_slug, SUM(run_count) AS runs, SUM(export_count) AS exports
       FROM tool_usage_daily GROUP BY tool_slug ORDER BY tool_slug`
  );
  return rows.map((row) => ({
    toolSlug: row.tool_slug,
    runs: Number(row.runs),
    exports: Number(row.exports),
  }));
}
