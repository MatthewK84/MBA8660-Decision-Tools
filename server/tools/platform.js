/**
 * Week 1 to Week 4 tools: platform architecture.
 * Every export is a pure function. No I/O, no clock, no database.
 */

import {
  line,
  num,
  requireChoice,
  requirePositive,
  requireRange,
  requireRetrievalDate,
  usd,
} from "./kit.js";

const BYTES_PER_GIB = 1024 ** 3;
const COLUMNAR_COMPRESSION = 4;
const SINGLE_NODE_MAX_GIB = 512;

/**
 * Week 1. Sizes a working set against single-node memory.
 * Computes the arithmetic. Refuses to say which architecture to choose.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function computeSizing(input) {
  const rows = requirePositive(input.rows, "Row count");
  const bytesPerRow = requirePositive(input.bytesPerRow, "Bytes per row");
  const scanFraction = requireRange(input.scanFraction, "Fraction of table scanned", 0.01, 1);
  const growth = requireRange(input.annualGrowthPct, "Annual growth percent", 0, 500);
  const concurrency = requirePositive(input.peakConcurrentQueries, "Peak concurrent queries");

  const rawGib = (rows * bytesPerRow) / BYTES_PER_GIB;
  const compressedGib = rawGib / COLUMNAR_COMPRESSION;
  const workingGib = compressedGib * scanFraction;
  const concurrentGib = workingGib * concurrency;
  const threeYearGib = concurrentGib * (1 + growth / 100) ** 3;
  const headroom = SINGLE_NODE_MAX_GIB / threeYearGib;

  const warnings = [];
  if (scanFraction > 0.6) {
    warnings.push("A scan fraction above 0.6 usually means the access pattern, not the data size, is the problem.");
  }
  if (growth > 100) {
    warnings.push("Growth above 100 percent per year compounds hard. Check that this figure is defensible.");
  }

  return {
    computed: [
      line("Raw uncompressed size", num(rawGib, 1, "GiB")),
      line(`Columnar estimate at ${COLUMNAR_COMPRESSION}x`, num(compressedGib, 1, "GiB")),
      line("Working set per query", num(workingGib, 1, "GiB")),
      line("Working set at peak concurrency", num(concurrentGib, 1, "GiB")),
      line("Working set in year three", num(threeYearGib, 1, "GiB")),
      line(`Headroom against a ${SINGLE_NODE_MAX_GIB} GiB single node`, `${num(headroom, 2, "x")}`),
    ],
    assumptions: [
      line("Rows", rows.toLocaleString("en-US")),
      line("Bytes per row", num(bytesPerRow, 0, "bytes")),
      line("Fraction scanned per query", num(scanFraction, 2, "")),
      line("Annual growth", num(growth, 0, "percent")),
      line("Peak concurrent queries", num(concurrency, 0, "")),
      line("Compression ratio assumed", `${COLUMNAR_COMPRESSION}x, columnar`),
      line("Single-node ceiling assumed", num(SINGLE_NODE_MAX_GIB, 0, "GiB")),
    ],
    unresolved: [
      "Headroom is a ratio, not a decision. State whether you accept single-node compute and say what headroom figure you consider adequate.",
      "The 4x compression ratio is my assumption, not a measurement. Justify it or replace it with a measured figure and say where you got it.",
      "Name the failure that would force you to distributed compute, and say how you would detect it before it happens.",
    ],
    warnings,
  };
}

const FORMATS = ["Iceberg", "Delta Lake", "Hudi"];
const ENGINES_KNOWN = ["Spark", "Trino", "Flink", "DuckDB", "Snowflake", "Databricks", "BigQuery"];

/**
 * Week 2. Surfaces the lock-in surface of a table format choice.
 * Scores exposure. Does not rank the formats.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function scoreLockIn(input) {
  const format = requireChoice(input.format, "Table format", FORMATS);
  const engines = requireRange(input.engineCount, "Number of engines that must read the table", 1, 10);
  const primary = requireChoice(input.primaryEngine, "Primary engine", ENGINES_KNOWN);
  const catalogVendor = requireChoice(input.catalogVendor, "Catalog vendor", ["Same as engine", "Independent"]);
  const migrationPb = requirePositive(input.dataVolumePb, "Data volume in petabytes");

  const engineExposure = engines === 1 ? "Single engine. Format portability buys you nothing today." : `${engines} engines. Portability is load-bearing.`;
  const catalogExposure =
    catalogVendor === "Same as engine"
      ? "Catalog and engine share a vendor. The lock-in moved up a layer, out of the format."
      : "Catalog is independent of the engine. The exit cost sits in the catalog migration, not the data.";
  const rewriteHours = (migrationPb * 1000) / 5;

  return {
    computed: [
      line("Format under evaluation", format),
      line("Engine exposure", engineExposure),
      line("Catalog exposure", catalogExposure),
      line("Rough full-rewrite time at 5 TB/hr", num(rewriteHours, 0, "hours")),
      line("Rough full-rewrite time in days", num(rewriteHours / 24, 1, "days")),
    ],
    assumptions: [
      line("Table format", format),
      line("Primary engine", primary),
      line("Engines requiring read access", num(engines, 0, "")),
      line("Catalog vendor relationship", catalogVendor),
      line("Data volume", num(migrationPb, 2, "PB")),
      line("Rewrite throughput assumed", "5 TB per hour"),
    ],
    unresolved: [
      "Rewrite hours measure the mechanical cost of leaving. State the organizational cost, which is larger and which I cannot compute.",
      "Name the lock-in you are accepting. Every choice here accepts one. Saying you avoided lock-in is not an answer.",
      "State what would have to change for this choice to become wrong, and roughly when you would expect to find out.",
    ],
    warnings: engines === 1 ? ["With one engine, format portability is a hedge against a future you have not described. Describe it or drop the argument."] : [],
  };
}

/**
 * Week 3. Surfaces catalog failure modes from the operating posture chosen.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function surfaceFailureModes(input) {
  const hosting = requireChoice(input.hosting, "Catalog hosting", ["Managed by vendor", "Self-hosted"]);
  const credentialMode = requireChoice(input.credentialMode, "Credential handling", ["Vended by catalog", "Direct storage credentials"]);
  const agentAccess = requireChoice(input.agentAccess, "Autonomous agent access", ["Permitted", "Not permitted"]);
  const rto = requirePositive(input.rtoMinutes, "Recovery time objective in minutes");
  const tables = requirePositive(input.tableCount, "Table count");

  /** @type {string[]} */
  const modes = [];
  modes.push(
    hosting === "Managed by vendor"
      ? "Catalog outage is a vendor incident. Your RTO is their RTO, and you cannot shorten it with money or effort."
      : "Catalog outage is yours to fix. Your RTO depends on staffing at the hour it breaks."
  );
  modes.push(
    credentialMode === "Vended by catalog"
      ? "Catalog compromise vends credentials to every table at once. Blast radius equals the whole estate."
      : "Direct storage credentials bypass catalog authorization. Access decisions are enforced in two places that can disagree."
  );
  if (agentAccess === "Permitted") {
    modes.push("Non-human identities query without a person present. An over-broad grant produces no complaint and no signal.");
  }

  const auditRowsPerYear = tables * 365 * 24;

  return {
    computed: [
      line("Failure modes surfaced", num(modes.length, 0, "")),
      ...modes.map((m, i) => line(`Mode ${i + 1}`, m)),
      line("Rough audit rows per year at hourly granularity", auditRowsPerYear.toLocaleString("en-US")),
      line("Stated recovery time objective", num(rto, 0, "minutes")),
    ],
    assumptions: [
      line("Hosting", hosting),
      line("Credential handling", credentialMode),
      line("Agent access", agentAccess),
      line("Recovery time objective", num(rto, 0, "minutes")),
      line("Tables under management", num(tables, 0, "")),
    ],
    unresolved: [
      "For each failure mode above, say how you would detect it and how long detection would take.",
      "Your stated RTO is a target. Say who is accountable when it is missed and what they are empowered to do.",
      "Name the failure mode you are choosing to accept without a control, and say why accepting it is defensible.",
    ],
    warnings: rto < 15 ? ["An RTO under 15 minutes usually implies staffing or automation you have not costed. Check Week 7."] : [],
  };
}

/**
 * Week 4. Fits an engine cost estimate against a fixed budget ceiling.
 *
 * @param {Record<string, unknown>} input
 * @param {Date} now
 * @returns {import("./kit.js").ToolResult}
 */
export function fitEngineToBudget(input, now) {
  const budget = requirePositive(input.annualBudgetUsd, "Annual budget ceiling");
  const unitPrice = requirePositive(input.unitPriceUsd, "Published unit price");
  const unitLabel = requireChoice(input.unitLabel, "Price unit", ["per credit", "per TB scanned", "per DBU", "per node hour"]);
  const unitsPerMonth = requirePositive(input.unitsPerMonth, "Expected units per month");
  const retrievedAt = requireRetrievalDate(input.priceRetrievedAt, "Price retrieval date", now);
  const commitDiscount = requireRange(input.commitDiscountPct, "Committed-use discount percent", 0, 60);

  const listAnnual = unitPrice * unitsPerMonth * 12;
  const discountedAnnual = listAnnual * (1 - commitDiscount / 100);
  const remaining = budget - discountedAnnual;
  const utilisation = (discountedAnnual / budget) * 100;
  const breakEvenUnits = (budget / (1 - commitDiscount / 100) / unitPrice) / 12;

  const warnings = [];
  if (remaining < 0) {
    warnings.push("This configuration exceeds the ceiling. The artifact fails on constraint 1 unless you change the configuration or the assumptions.");
  }
  if (utilisation > 85 && remaining >= 0) {
    warnings.push("Above 85 percent of the ceiling leaves no room for growth or error inside the budget year.");
  }

  return {
    computed: [
      line("List cost per year", usd(listAnnual)),
      line(`Cost after ${num(commitDiscount, 0, "percent")} commit discount`, usd(discountedAnnual)),
      line("Budget remaining", usd(remaining)),
      line("Ceiling utilisation", num(utilisation, 1, "percent")),
      line(`Units per month that exhaust the ceiling`, num(breakEvenUnits, 0, unitLabel.replace("per ", ""))),
    ],
    assumptions: [
      line("Annual budget ceiling", usd(budget)),
      line("Published unit price", `${usd(unitPrice)} ${unitLabel}`),
      line("Price retrieved on", retrievedAt),
      line("Expected units per month", unitsPerMonth.toLocaleString("en-US")),
      line("Committed-use discount", num(commitDiscount, 0, "percent")),
    ],
    unresolved: [
      "Units per month is a forecast you supplied. State how you derived it and what happens to the model if it is 50 percent high.",
      "Name the capability you gave up to stay inside the ceiling. Every budget-constrained choice sacrifices something.",
      "A committed-use discount is a multi-year obligation. State what you owe if the workload moves off this engine in year two.",
    ],
    warnings,
  };
}
