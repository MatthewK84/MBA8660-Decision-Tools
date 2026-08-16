import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COLUMN_ALLOWLIST, FORBIDDEN_FRAGMENTS, OWNED_TABLES, checkSchema } from "../server/privacy-guard.js";
import { STATEMENTS } from "../server/migrate.js";

/**
 * Build an observed-schema fixture straight from the allowlist, which is what
 * a correctly migrated database looks like.
 *
 * @returns {{ table_name: string, column_name: string, data_type: string }[]}
 */
function cleanSchema() {
  return Object.entries(COLUMN_ALLOWLIST).flatMap(([table, columns]) =>
    columns.map((column) => ({ table_name: table, column_name: column, data_type: "text" }))
  );
}

describe("privacy guard", () => {
  it("passes on a schema containing exactly the allowlisted columns", () => {
    assert.deepEqual(checkSchema(cleanSchema()), { ok: true });
  });

  it("rejects a column that is not on the allowlist", () => {
    const drifted = [...cleanSchema(), { table_name: "scenario", column_name: "notes_extra", data_type: "text" }];
    const verdict = checkSchema(drifted);
    assert.equal(verdict.ok, false);
    assert.ok(verdict.violations.some((v) => v.includes("scenario.notes_extra")));
  });

  it("rejects an entirely unknown table", () => {
    const drifted = [...cleanSchema(), { table_name: "submissions", column_name: "body", data_type: "text" }];
    const verdict = checkSchema(drifted);
    assert.equal(verdict.ok, false);
    assert.ok(verdict.violations.some((v) => v.includes("Unknown table")));
  });

  it("rejects every forbidden fragment even if someone allowlists it", () => {
    for (const fragment of FORBIDDEN_FRAGMENTS) {
      const column = `scenario_${fragment}_field`;
      const verdict = checkSchema([{ table_name: "scenario", column_name: column, data_type: "text" }]);
      assert.equal(verdict.ok, false, `${fragment} slipped through`);
    }
  });

  it("rejects a text column added to the usage counter table", () => {
    const drifted = [
      ...cleanSchema(),
      { table_name: "tool_usage_daily", column_name: "detail", data_type: "character varying" },
    ];
    const verdict = checkSchema(drifted);
    assert.equal(verdict.ok, false);
    assert.ok(verdict.violations.some((v) => v.includes("counters only")));
  });

  it("keeps the usage table free of anything but a slug, a date, and counters", () => {
    assert.deepEqual(COLUMN_ALLOWLIST.tool_usage_daily, ["tool_slug", "usage_date", "run_count", "export_count"]);
  });

  it("allowlists exactly the tables the application owns", () => {
    assert.deepEqual(Object.keys(COLUMN_ALLOWLIST).sort(), [...OWNED_TABLES].sort());
  });
});

describe("migrations", () => {
  it("declares only additive, idempotent statements", () => {
    for (const statement of STATEMENTS) {
      const isAdditive =
        statement.includes("CREATE TABLE IF NOT EXISTS") ||
        statement.includes("CREATE INDEX IF NOT EXISTS") ||
        statement.includes("CREATE UNIQUE INDEX IF NOT EXISTS") ||
        statement.includes("ADD COLUMN IF NOT EXISTS");
      assert.ok(isAdditive, `Non-additive migration: ${statement.slice(0, 60)}`);
    }
  });

  it("contains no destructive verbs", () => {
    const destructive = /\b(DROP|TRUNCATE|DELETE FROM)\b/i;
    for (const statement of STATEMENTS) {
      assert.equal(destructive.test(statement), false, `Destructive migration: ${statement.slice(0, 60)}`);
    }
  });

  it("creates every table the allowlist claims the application owns", () => {
    const ddl = STATEMENTS.join(" ");
    for (const table of OWNED_TABLES) {
      assert.ok(ddl.includes(`CREATE TABLE IF NOT EXISTS ${table} `), `Migration missing for ${table}`);
    }
  });

  it("declares no column the guard would reject", () => {
    const ddl = STATEMENTS.join(" ").toLowerCase();
    for (const fragment of FORBIDDEN_FRAGMENTS) {
      assert.equal(ddl.includes(`${fragment} `), false, `Migration declares forbidden fragment "${fragment}"`);
    }
  });
});
