/**
 * The FERPA control, enforced in code rather than promised in a README.
 *
 * Every column this application is permitted to create is listed here. At
 * boot, the server reads the live schema out of information_schema and
 * refuses to start if it finds a column that is not on this list.
 *
 * The effect is that nobody can add a `student_name` column, or a text field
 * that could hold a memo answer, without also editing this file. A silent
 * schema drift becomes a loud startup failure.
 */

/** Tables this application owns. Anything else in the schema is foreign. */
export const OWNED_TABLES = Object.freeze([
  "scenario",
  "price_reference",
  "source_link",
  "tool_usage_daily",
]);

/**
 * Every permitted column, by table. Adding a column here is a deliberate act
 * that shows up in a diff and in code review.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const COLUMN_ALLOWLIST = Object.freeze({
  scenario: Object.freeze([
    "code",
    "name",
    "sector",
    "annual_budget_ceiling_usd",
    "workload_profile",
    "narrative",
    "is_active",
    "created_at",
    "updated_at",
  ]),
  price_reference: Object.freeze([
    "id",
    "vendor",
    "product",
    "unit_label",
    "unit_price_usd",
    "currency",
    "retrieved_at",
    "source_url",
    "note",
    "created_at",
  ]),
  source_link: Object.freeze([
    "id",
    "week",
    "title",
    "url",
    "source_class",
    "is_foundational",
    "published_on",
    "created_at",
  ]),
  tool_usage_daily: Object.freeze(["tool_slug", "usage_date", "run_count", "export_count"]),
});

/**
 * Columns that may never exist anywhere in this schema, checked by substring.
 * These are the shapes student identity would arrive in.
 *
 * @type {readonly string[]}
 */
export const FORBIDDEN_FRAGMENTS = Object.freeze([
  "student",
  "name_first",
  "first_name",
  "last_name",
  "email",
  "netid",
  "net_id",
  "user_id",
  "username",
  "ip_address",
  "session_id",
  "answer",
  "submission",
  "memo",
  "grade",
  "score",
  "roster",
  "canvas_id",
  "sis_id",
]);

/**
 * The usage table must carry counters only. No column on it may hold text
 * that a student typed. This is checked separately and by data type.
 *
 * @type {readonly string[]}
 */
export const USAGE_TEXT_COLUMNS = Object.freeze(["tool_slug"]);

/**
 * @typedef {{ table_name: string, column_name: string, data_type: string }} ColumnRow
 * @typedef {{ ok: true } | { ok: false, violations: string[] }} GuardVerdict
 */

/**
 * Check a set of observed columns against the allowlist.
 * Pure. The database read happens in the caller.
 *
 * @param {ColumnRow[]} observed
 * @returns {GuardVerdict}
 */
export function checkSchema(observed) {
  /** @type {string[]} */
  const violations = [];

  for (const row of observed) {
    const table = row.table_name;
    const column = row.column_name;
    const permitted = COLUMN_ALLOWLIST[table];

    if (permitted === undefined) {
      violations.push(`Unknown table "${table}" is not owned by this application.`);
      continue;
    }
    if (!permitted.includes(column)) {
      violations.push(`Column "${table}.${column}" is not on the allowlist.`);
    }
    const fragment = FORBIDDEN_FRAGMENTS.find((f) => column.toLowerCase().includes(f));
    if (fragment !== undefined) {
      violations.push(`Column "${table}.${column}" matches forbidden fragment "${fragment}".`);
    }
  }

  const usageText = observed.filter(
    (row) => row.table_name === "tool_usage_daily" && row.data_type.includes("char") && !USAGE_TEXT_COLUMNS.includes(row.column_name)
  );
  for (const row of usageText) {
    violations.push(`Usage table gained a text column "${row.column_name}". Usage rows are counters only.`);
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * Read the live schema and enforce the guard. Throws on violation, which
 * stops the process before it can serve a single request.
 *
 * @param {import("pg").Pool} pool
 * @returns {Promise<void>}
 */
export async function assertNoStudentColumns(pool) {
  const { rows } = await pool.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`
  );
  const verdict = checkSchema(rows);
  if (verdict.ok) {
    return;
  }
  const detail = verdict.violations.map((v) => `  - ${v}`).join("\n");
  throw new Error(`Privacy guard failed. Refusing to start.\n${detail}`);
}
