/**
 * The tool catalog. One entry per course week.
 *
 * The catalog drives the API and the entire user interface. Adding a tool
 * means adding an entry here and a pure function in one of the sibling
 * modules. No new React page is required.
 *
 * Four things beyond the calculation live here, and all four are teaching
 * surface rather than arithmetic:
 *
 *   explainer  what this week is actually about, in plain language
 *   terms      the glossary keys a student needs to read this week's output
 *   presets    realistic starting inputs drawn from the seeded case organizations
 *   min/max    numeric bounds, so the client can offer a slider and a student
 *              can watch a figure move instead of guessing at one value
 *
 * @typedef {"number" | "text" | "select" | "date"} FieldType
 * @typedef {{
 *   key: string,
 *   label: string,
 *   type: FieldType,
 *   options?: readonly string[],
 *   unit?: string,
 *   help?: string,
 *   term?: string,
 *   min?: number,
 *   max?: number,
 *   step?: number
 * }} FieldDef
 * @typedef {{ name: string, note: string, values: Record<string, string | number> }} Preset
 * @typedef {{
 *   slug: string,
 *   week: number,
 *   title: string,
 *   decision: string,
 *   explainer: string,
 *   terms: readonly string[],
 *   presets: readonly Preset[],
 *   fields: readonly FieldDef[],
 *   run: (input: Record<string, unknown>, now: Date) => import("./kit.js").ToolResult
 * }} ToolDef
 */

import { computeSizing, fitEngineToBudget, scoreLockIn, surfaceFailureModes } from "./platform.js";
import { CUT_CATEGORIES, annualControlCost, breakEven, simulateCut } from "./economics.js";
import {
  AGENT_SCOPES,
  CRITERIA,
  buildScopeMatrix,
  costPrivacyPaths,
  draftRetentionPolicy,
  exposureTimeline,
  weighOperatingModel,
} from "./governance.js";
import { resolveTerms } from "../glossary.js";

/**
 * Build a numeric field definition, with the bounds a slider needs.
 *
 * @param {string} key
 * @param {string} label
 * @param {string} unit
 * @param {string} help
 * @param {{ min?: number, max?: number, step?: number, term?: string }} extra
 * @returns {FieldDef}
 */
function numberField(key, label, unit, help, extra = {}) {
  return { key, label, type: "number", unit, help, ...extra };
}

/**
 * Build a select field definition.
 *
 * @param {string} key
 * @param {string} label
 * @param {readonly string[]} options
 * @param {string} help
 * @param {string} term
 * @returns {FieldDef}
 */
function selectField(key, label, options, help = "", term = "") {
  return { key, label, type: "select", options, help, term };
}

/**
 * Build a preset.
 *
 * @param {string} name
 * @param {string} note
 * @param {Record<string, string | number>} values
 * @returns {Preset}
 */
function preset(name, note, values) {
  return { name, note, values };
}

/** @returns {FieldDef[]} */
function cutFields() {
  const spend = CUT_CATEGORIES.map((c) =>
    numberField(`spend${c}`, `${c} annual spend`, "USD", `Current annual ${c.toLowerCase()} spend, from the invoice rather than the budget.`, { min: 0, max: 5000000, step: 10000 })
  );
  const cuts = CUT_CATEGORIES.map((c) =>
    numberField(`cut${c}`, `${c} cut`, "percent", `Share of ${c.toLowerCase()} you propose to remove. Drag it and watch the total move.`, { min: 0, max: 100, step: 1 })
  );
  return [...spend, ...cuts];
}

/** @returns {FieldDef[]} */
function governanceFields() {
  return CRITERIA.flatMap((criterion) => {
    const slug = criterion.replace(/\s+/g, "");
    return [
      numberField(`weight${slug}`, `${criterion}: weight`, "0 to 10", `How much ${criterion.toLowerCase()} matters to this organization. Zero means it does not count.`, { min: 0, max: 10, step: 1 }),
      numberField(`central${slug}`, `${criterion}: centralized`, "0 to 10", "How well a central platform team does on this criterion.", { min: 0, max: 10, step: 1 }),
      numberField(`federated${slug}`, `${criterion}: federated`, "0 to 10", "How well domain-owned teams do on this criterion.", { min: 0, max: 10, step: 1 }),
    ];
  });
}

/** @returns {FieldDef[]} */
function scopeFields() {
  return AGENT_SCOPES.map((scope) =>
    selectField(
      `grant${scope.replace(/\s+/g, "")}`,
      scope,
      ["Denied", "Granted"],
      "Every grant is permanent until revoked, and sits inside the blast radius whether or not the agent uses it.",
      "blast-radius"
    )
  );
}

/** Preset values shared by the three seeded case organizations for Week 1. */
const SIZING_PRESETS = [
  preset("Meridian Health Partners", "4.2B claim rows, 310 bytes each, 22 percent growth, 14 concurrent queries.", {
    rows: 4200000000, bytesPerRow: 310, compressionRatio: 4, scanFraction: 0.08,
    annualGrowthPct: 22, peakConcurrentQueries: 14, queriesPerDay: 900, computeHoursPerDay: 12,
  }),
  preset("Atlas Freight Systems", "9.8B telemetry rows, narrow at 96 bytes, growing 41 percent a year.", {
    rows: 9800000000, bytesPerRow: 96, compressionRatio: 6, scanFraction: 0.03,
    annualGrowthPct: 41, peakConcurrentQueries: 9, queriesPerDay: 1400, computeHoursPerDay: 24,
  }),
  preset("Caldera Outdoor Brands", "640M order rows, three-person data team, heavy seasonality.", {
    rows: 640000000, bytesPerRow: 220, compressionRatio: 4, scanFraction: 0.15,
    annualGrowthPct: 18, peakConcurrentQueries: 6, queriesPerDay: 300, computeHoursPerDay: 8,
  }),
];

/** @type {readonly ToolDef[]} */
export const TOOLS = Object.freeze([
  {
    slug: "sizing",
    week: 1,
    title: "Working Set Sizing and Cost",
    decision: "Does this workload need a distributed system? Recommend yes or no, and show the sizing arithmetic and the dollar figures that support your answer.",
    explainer:
      "A distributed system splits one job across several machines that coordinate over a network. You need one when the data a query must hold at once will not fit in the largest single machine you can rent, when you need more throughput than one machine provides, or when the job must survive a machine dying. None of those is 'the table is big'. This week you size the working set, price both architectures at published list rates, and see what compression is worth in dollars. Distribution does not make compute cheaper per GiB, and the shuffle it requires is a bill the single machine never pays.",
    terms: ["working-set", "distributed-system", "why-distribute", "shuffle", "compression", "compression-ratio", "columnar", "scan-fraction", "concurrency", "headroom", "gib", "single-node", "object-storage", "per-tb-scanned", "partitioning"],
    presets: SIZING_PRESETS,
    fields: [
      numberField("rows", "Row count", "rows", "The largest single table you must query, not the size of the whole estate.", { min: 1, max: 100000000000, step: 1000000, term: "working-set" }),
      numberField("bytesPerRow", "Bytes per row", "bytes", "Uncompressed average across every column. A wide analytics table is often 200 to 400 bytes.", { min: 1, max: 4000, step: 10 }),
      numberField("compressionRatio", "Compression ratio", "x", "How many times smaller the data gets on disk. Parquet with ZSTD is typically 3x to 10x. Yours is a measurement, not a constant.", { min: 1, max: 20, step: 0.5, term: "compression-ratio" }),
      numberField("scanFraction", "Fraction scanned per query", "0.01 to 1", "0.1 means a typical query touches a tenth of the table after partition pruning.", { min: 0.01, max: 1, step: 0.01, term: "scan-fraction" }),
      numberField("annualGrowthPct", "Annual growth", "percent", "Compounded over three years to size the architecture you are choosing today.", { min: 0, max: 500, step: 1 }),
      numberField("peakConcurrentQueries", "Peak concurrent queries", "queries", "Queries running at the same instant at your busiest moment. Not users, and not daily volume.", { min: 1, max: 500, step: 1, term: "concurrency" }),
      numberField("queriesPerDay", "Queries per day", "queries", "Total daily query volume. This drives the per-TB-scanned bill, usually the largest line.", { min: 1, max: 200000, step: 50, term: "per-tb-scanned" }),
      numberField("computeHoursPerDay", "Compute hours per day", "hours", "Hours the engine is actually running. An idle cluster bills at the same rate as a busy one.", { min: 0.5, max: 24, step: 0.5 }),
    ],
    run: (input) => computeSizing(input),
  },
  {
    slug: "lock-in",
    week: 2,
    title: "Table Format Lock-In and Exit Cost",
    decision: "Recommend a table format. Name the vendor lock-in you are accepting, say why you accept it, and price the exit.",
    explainer:
      "An open table format is a specification that turns a pile of compressed files in object storage into something with transactions, snapshots, and schema evolution. Iceberg, Delta Lake, and Hudi all do this. Choosing an open format does not mean you avoided lock-in; it usually moves the lock-in from the file layer up to the catalog. This week prices what leaving would actually cost: the compute to rewrite every byte, and the egress charge if the data leaves the cloud. Egress at $0.09 per GB is roughly four times what it costs to store that byte for a month, which is why it, and not the file format, is the real exit barrier.",
    terms: ["table-format", "columnar", "catalog", "egress", "object-storage", "compression"],
    presets: [
      preset("Multi-engine lakehouse", "Iceberg, three engines, independent catalog, 1.5 PB, staying in one cloud.", {
        format: "Iceberg", primaryEngine: "Trino", engineCount: 3, catalogVendor: "Independent", dataVolumePb: 1.5, crossesCloudBoundary: "No",
      }),
      preset("Single-vendor estate", "Delta Lake on Databricks, one engine, vendor catalog, 0.4 PB.", {
        format: "Delta Lake", primaryEngine: "Databricks", engineCount: 1, catalogVendor: "Same as engine", dataVolumePb: 0.4, crossesCloudBoundary: "No",
      }),
      preset("Cloud exit under consideration", "Iceberg, 2 PB, and the migration leaves the cloud entirely.", {
        format: "Iceberg", primaryEngine: "Spark", engineCount: 4, catalogVendor: "Independent", dataVolumePb: 2, crossesCloudBoundary: "Yes",
      }),
    ],
    fields: [
      selectField("format", "Table format", ["Iceberg", "Delta Lake", "Hudi"], "The specification governing commits, snapshots, and schema evolution over your files.", "table-format"),
      selectField("primaryEngine", "Primary engine", ["Spark", "Trino", "Flink", "DuckDB", "Snowflake", "Databricks", "BigQuery"], "The engine doing most of the reading. Its relationship to the catalog is where lock-in usually lives."),
      numberField("engineCount", "Engines requiring read access", "1 to 10", "Portability is only load-bearing when more than one engine must read the same table.", { min: 1, max: 10, step: 1 }),
      selectField("catalogVendor", "Catalog vendor relationship", ["Same as engine", "Independent"], "Whether the catalog can be replaced without also replacing the engine.", "catalog"),
      numberField("dataVolumePb", "Data volume", "PB", "Total bytes that would have to be rewritten to leave. Use decimals for sub-petabyte estates.", { min: 0.01, max: 100, step: 0.1 }),
      selectField("crossesCloudBoundary", "Migration leaves the cloud", ["No", "Yes"], "Egress is charged only when the bytes leave. Inside one cloud this line is zero.", "egress"),
    ],
    run: (input) => scoreLockIn(input),
  },
  {
    slug: "catalog-failure",
    week: 3,
    title: "Catalog Failure Modes and Cost",
    decision: "Choose a catalog. Name the failure mode you inherit with that choice, say how you would detect it, and price the catalog itself.",
    explainer:
      "The catalog is the service that knows which tables exist, where their files are, and who may read them. Every query goes through it before touching a byte, which makes it the smallest and most load-bearing thing on the platform. This week prices it: object charges driven by partition count rather than table count, request charges driven by query count rather than data size, and the compute bill if you run it yourself. The figures come out small. That is the lesson. A component that costs a few hundred dollars a month can take down every engine you run, and the decision about how much to spend protecting it cannot be made from the price alone.",
    terms: ["catalog", "credential-vending", "rto", "blast-radius", "partitioning", "determinism"],
    presets: [
      preset("Managed catalog, credential vending", "Vendor-hosted, vends credentials, agents permitted, 900 tables.", {
        hosting: "Managed by vendor", credentialMode: "Vended by catalog", agentAccess: "Permitted", rtoMinutes: 60, tableCount: 900, partitionsPerTable: 1095, queriesPerDay: 20000,
      }),
      preset("Self-hosted, direct credentials", "You run it, engines hold their own storage keys, no agents.", {
        hosting: "Self-hosted", credentialMode: "Direct storage credentials", agentAccess: "Not permitted", rtoMinutes: 240, tableCount: 400, partitionsPerTable: 365, queriesPerDay: 5000,
      }),
      preset("Aggressive RTO", "A 10-minute recovery objective nobody has costed yet.", {
        hosting: "Self-hosted", credentialMode: "Vended by catalog", agentAccess: "Permitted", rtoMinutes: 10, tableCount: 2200, partitionsPerTable: 1095, queriesPerDay: 40000,
      }),
    ],
    fields: [
      selectField("hosting", "Catalog hosting", ["Managed by vendor", "Self-hosted"], "Who runs the process, and therefore who owns the outage at 3am.", "rto"),
      selectField("credentialMode", "Credential handling", ["Vended by catalog", "Direct storage credentials"], "Whether authorization is enforced in one place or in two that can disagree.", "credential-vending"),
      selectField("agentAccess", "Autonomous agent access", ["Not permitted", "Permitted"], "Whether non-human identities query with no person present to notice anything odd."),
      numberField("rtoMinutes", "Recovery time objective", "minutes", "How long you have agreed the catalog may stay down. A target, not a demonstrated capability.", { min: 1, max: 1440, step: 5, term: "rto" }),
      numberField("tableCount", "Tables under management", "tables", "Every table is one catalog object.", { min: 1, max: 50000, step: 50 }),
      numberField("partitionsPerTable", "Partitions per table", "partitions", "Each partition is also a catalog object. Three years of daily partitions is about 1,095.", { min: 1, max: 20000, step: 100, term: "partitioning" }),
      numberField("queriesPerDay", "Queries per day", "queries", "Catalog requests scale with query count, not with data volume. Assumes 4 lookups per query.", { min: 1, max: 200000, step: 500 }),
    ],
    run: (input) => surfaceFailureModes(input),
  },
  {
    slug: "engine-budget",
    week: 4,
    title: "Engine Cost Against Budget Ceiling",
    decision: "Recommend an engine under a fixed annual budget. State explicitly what capability you gave up to stay inside it.",
    explainer:
      "Engines are priced in units that are deliberately hard to compare: Snowflake sells credits at $2.00 each, Databricks sells DBUs at $0.15 to $0.55 on top of the cloud machines you also rent, BigQuery sells either bytes scanned at $6.25 per TiB or slot-hours at $0.04. This week converts whichever unit you chose into an annual figure, adds the storage bill that a compute-only budget quietly omits, and fits the total against a ceiling. The remaining budget is your entire margin for being wrong about the forecast, and forecasts of query volume are wrong routinely.",
    terms: ["credit", "dbu", "slot-hour", "per-tb-scanned", "commit-discount", "object-storage", "unit-economics"],
    presets: [
      preset("Snowflake, Standard edition", "12,000 credits a month at $2.00, 20 percent commit discount, 400 TB stored.", {
        annualBudgetUsd: 1450000, unitPriceUsd: 2, unitLabel: "per credit", priceRetrievedAt: "2026-08-15", unitsPerMonth: 12000, commitDiscountPct: 20, storageTb: 400,
      }),
      preset("Athena, pay per scan", "60,000 TB scanned a year at $5.00 per TB, no commitment available.", {
        annualBudgetUsd: 780000, unitPriceUsd: 5, unitLabel: "per TB scanned", priceRetrievedAt: "2026-08-15", unitsPerMonth: 5000, commitDiscountPct: 0, storageTb: 900,
      }),
      preset("Databricks Jobs Compute", "180,000 DBU a month at $0.15, small estate, tight ceiling.", {
        annualBudgetUsd: 420000, unitPriceUsd: 0.15, unitLabel: "per DBU", priceRetrievedAt: "2026-08-15", unitsPerMonth: 180000, commitDiscountPct: 15, storageTb: 120,
      }),
    ],
    fields: [
      numberField("annualBudgetUsd", "Annual budget ceiling", "USD", "The Final Artifact constraint. Breaching it fails the rubric, not just the spreadsheet.", { min: 1000, max: 20000000, step: 10000 }),
      numberField("unitPriceUsd", "Published unit price", "USD", "From the vendor pricing page, not from memory. Reference prices are listed under Published prices below.", { min: 0.0001, max: 100, step: 0.01 }),
      selectField("unitLabel", "Price unit", ["per credit", "per TB scanned", "per DBU", "per node hour"], "Engines price in deliberately incomparable units. Naming yours is half the analysis.", "credit"),
      { key: "priceRetrievedAt", label: "Price retrieved on", type: "date", help: "Required, and cannot be in the future. The artifact rubric checks this.", term: "" },
      numberField("unitsPerMonth", "Expected units per month", "units", "A forecast you supplied, and the single largest source of error in this model.", { min: 1, max: 5000000, step: 100 }),
      numberField("commitDiscountPct", "Committed-use discount", "percent", "A multi-year obligation traded for a lower rate. You owe it even if the workload leaves.", { min: 0, max: 60, step: 1, term: "commit-discount" }),
      numberField("storageTb", "Storage under management", "TB", "A compute-only budget is not a platform budget. Storage grows whether or not anyone queries.", { min: 0.1, max: 20000, step: 10, term: "object-storage" }),
    ],
    run: (input, now) => fitEngineToBudget(input, now),
  },
  {
    slug: "finops-cut",
    week: 5,
    title: "Spend Reduction and Unit Economics",
    decision: "Cut 20 percent of platform spend. Name what breaks, who complains, what you tell them, and what the cut does to cost per query.",
    explainer:
      "FinOps is the practice of treating cloud spend as an engineering decision with an owner rather than a bill that arrives. Its central move is denominating spend in units the business recognizes: cost per query, cost per active user, cost per retrain. A platform whose total spend rises while its cost per query falls is getting more efficient, and reporting only the total hides that entirely. This week simulates a cut across five categories and restates the result in both forms, so you can see the difference between a real efficiency gain and maintenance you have simply deferred into next year.",
    terms: ["finops", "unit-economics", "observability", "storage-tier", "per-tb-scanned", "object-storage"],
    presets: [
      preset("Compute-heavy estate", "$1.8M total, most of it compute. The obvious cut is also the painful one.", {
        targetReductionPct: 20, queriesPerYear: 4000000, activeUsers: 850,
        spendStorage: 300000, spendCompute: 900000, spendIngestion: 200000, spendObservability: 150000, spendLicences: 250000,
        cutStorage: 10, cutCompute: 25, cutIngestion: 15, cutObservability: 5, cutLicences: 30,
      }),
      preset("Licence-heavy estate", "Vendor licences dominate. Cutting compute barely moves the total.", {
        targetReductionPct: 20, queriesPerYear: 1200000, activeUsers: 300,
        spendStorage: 90000, spendCompute: 260000, spendIngestion: 140000, spendObservability: 60000, spendLicences: 610000,
        cutStorage: 5, cutCompute: 10, cutIngestion: 10, cutObservability: 0, cutLicences: 30,
      }),
      preset("Cutting observability first", "The tempting plan. Check it against Week 7 before you defend it.", {
        targetReductionPct: 20, queriesPerYear: 2500000, activeUsers: 500,
        spendStorage: 200000, spendCompute: 700000, spendIngestion: 180000, spendObservability: 220000, spendLicences: 200000,
        cutStorage: 5, cutCompute: 8, cutIngestion: 5, cutObservability: 75, cutLicences: 10,
      }),
    ],
    fields: [
      numberField("targetReductionPct", "Target reduction", "percent", "The mandate you were handed. The syllabus sets it at 20 percent.", { min: 1, max: 90, step: 1 }),
      numberField("queriesPerYear", "Queries per year", "queries", "The denominator for cost per query, which is the figure a business owner can act on.", { min: 1, max: 200000000, step: 100000, term: "unit-economics" }),
      numberField("activeUsers", "Monthly active users", "people", "The denominator for cost per user. Denominates the platform in people rather than infrastructure.", { min: 1, max: 100000, step: 25 }),
      ...cutFields(),
    ],
    run: (input) => simulateCut(input),
  },
  {
    slug: "build-vs-buy",
    week: 6,
    title: "Build Versus Buy Break-Even",
    decision: "Build or buy. Show the break-even in months and name the single assumption the answer hinges on.",
    explainer:
      "Build versus buy is an arithmetic question wrapped around one estimate nobody makes well: how many hours a month the built thing will need after it launches. This week prices both sides, including the infrastructure a built system runs on, which compute-time-only comparisons omit. Break-even is the month at which cumulative build cost equals cumulative vendor cost. If break-even falls outside your stated horizon, the horizon decided the question, not the arithmetic, and you should say so rather than pretend otherwise.",
    terms: ["break-even", "blended-rate", "data-contract", "unit-economics"],
    presets: [
      preset("Managed connector versus in-house", "$9,000 a month vendor, 900 build hours, 30 maintenance hours.", {
        vendorMonthlyUsd: 9000, priceRetrievedAt: "2026-08-15", buildHours: 900, blendedHourlyUsd: 140, maintenanceHoursMonthly: 30, buildInfraMonthlyUsd: 1200, horizonMonths: 36,
      }),
      preset("Cheap vendor, expensive build", "The case where buying obviously wins and people still argue.", {
        vendorMonthlyUsd: 2500, priceRetrievedAt: "2026-08-15", buildHours: 1600, blendedHourlyUsd: 140, maintenanceHoursMonthly: 24, buildInfraMonthlyUsd: 900, horizonMonths: 24,
      }),
      preset("Maintenance underestimated", "Same build, maintenance doubled. Watch break-even move.", {
        vendorMonthlyUsd: 9000, priceRetrievedAt: "2026-08-15", buildHours: 900, blendedHourlyUsd: 140, maintenanceHoursMonthly: 60, buildInfraMonthlyUsd: 1200, horizonMonths: 36,
      }),
    ],
    fields: [
      numberField("vendorMonthlyUsd", "Vendor monthly price", "USD", "The quoted price, dated. Not the price you remember from a conference talk.", { min: 1, max: 500000, step: 100 }),
      { key: "priceRetrievedAt", label: "Price retrieved on", type: "date", help: "Required, and cannot be in the future.", term: "" },
      numberField("buildHours", "One-time build effort", "hours", "Engineering to first production use. Excludes the second system you build when the first is wrong.", { min: 1, max: 20000, step: 20 }),
      numberField("blendedHourlyUsd", "Blended hourly cost", "USD", "Fully loaded, not salary divided by 2,080. Commonly 1.25 to 1.5 times the raw salary rate.", { min: 1, max: 1000, step: 5, term: "blended-rate" }),
      numberField("maintenanceHoursMonthly", "Maintenance effort", "hours per month", "Ongoing engineering after launch. The figure teams underestimate most, and the one break-even rests on.", { min: 0.5, max: 400, step: 1 }),
      numberField("buildInfraMonthlyUsd", "Infrastructure for the build", "USD per month", "Servers, storage, and network your own version runs on. A vendor price already includes theirs.", { min: 1, max: 200000, step: 100 }),
      numberField("horizonMonths", "Evaluation horizon", "months", "The window over which you are comparing. It frequently decides the answer by itself.", { min: 6, max: 60, step: 1 }),
    ],
    run: (input, now) => breakEven(input, now),
  },
  {
    slug: "control-cost",
    week: 7,
    title: "Reliability Control Pricing",
    decision: "Which single control would have caught this incident, what does it cost per year, and how much faster would you have known?",
    explainer:
      "A control costs money every year and prevents some share of incidents. Two numbers decide whether it is worth funding, and you supply both: the share of incidents it would actually have caught, and how long an incident currently runs before anybody notices. Detection time is the multiplier on every other cost in an incident, and it is usually the cheapest thing to improve. This week also computes cost per incident caught, which is the unit economics of reliability and a far better argument than a raw net position.",
    terms: ["observability", "catch-rate", "blended-rate", "rto", "unit-economics", "data-contract"],
    presets: [
      preset("Freshness SLA monitor", "$48,000 tooling, 60 percent catch rate, detection from 18 hours to 1.", {
        controlName: "Freshness SLA monitor on the orders table", toolingAnnualUsd: 48000, setupHours: 120, opsHoursMonthly: 8,
        blendedHourlyUsd: 140, incidentCostUsd: 400000, incidentsPerYear: 1.5, catchRatePct: 60, detectionHoursBefore: 18, detectionHoursAfter: 1,
      }),
      preset("Schema contract in CI", "Cheap, narrow, and catches a specific and common failure.", {
        controlName: "Schema contract check in the ingestion pipeline", toolingAnnualUsd: 6000, setupHours: 80, opsHoursMonthly: 3,
        blendedHourlyUsd: 140, incidentCostUsd: 120000, incidentsPerYear: 4, catchRatePct: 45, detectionHoursBefore: 26, detectionHoursAfter: 0.25,
      }),
      preset("Expensive platform, thin evidence", "A 95 percent catch rate claim the tool will argue with.", {
        controlName: "Full-estate data observability platform", toolingAnnualUsd: 240000, setupHours: 400, opsHoursMonthly: 24,
        blendedHourlyUsd: 140, incidentCostUsd: 400000, incidentsPerYear: 1.5, catchRatePct: 95, detectionHoursBefore: 18, detectionHoursAfter: 2,
      }),
    ],
    fields: [
      { key: "controlName", label: "Control name", type: "text", help: "One control, not a programme. A programme cannot be priced on one page.", term: "" },
      numberField("toolingAnnualUsd", "Annual tooling cost", "USD", "Licence or subscription. The line finance can already see.", { min: 0.01, max: 2000000, step: 1000 }),
      numberField("setupHours", "Setup effort", "hours", "One-time integration, paid in year one only.", { min: 0.5, max: 5000, step: 10 }),
      numberField("opsHoursMonthly", "Operating effort", "hours per month", "Tuning, triage, and acting on what it finds. Controls are not free after purchase.", { min: 0.5, max: 200, step: 1 }),
      numberField("blendedHourlyUsd", "Blended hourly cost", "USD", "Fully loaded cost of an engineering hour.", { min: 1, max: 1000, step: 5, term: "blended-rate" }),
      numberField("incidentCostUsd", "Cost of one incident", "USD", "Your estimate of one incident's total cost, including the work to recover from it.", { min: 1, max: 20000000, step: 10000 }),
      numberField("incidentsPerYear", "Expected incidents per year", "incidents", "Frequency, from your own history or from the assigned post-mortem.", { min: 0.01, max: 500, step: 0.25 }),
      numberField("catchRatePct", "Share of incidents caught", "percent", "What it would actually have caught, not what it is designed to catch. Above 90 is a strong claim.", { min: 0, max: 100, step: 5, term: "catch-rate" }),
      numberField("detectionHoursBefore", "Hours to detect today", "hours", "How long an incident runs before anyone knows. The multiplier on every other cost.", { min: 0.01, max: 720, step: 0.5 }),
      numberField("detectionHoursAfter", "Hours to detect with the control", "hours", "What this control changes. Faster detection shrinks the blast radius of the same failure.", { min: 0.01, max: 720, step: 0.25, term: "blast-radius" }),
    ],
    run: (input) => annualControlCost(input),
  },
  {
    slug: "governance-model",
    week: 8,
    title: "Operating Model Weighting and Staffing Cost",
    decision: "Centralize or federate data ownership. Defend the choice against its strongest counterargument, not its weakest.",
    explainer:
      "Centralized and federated data ownership are mostly a payroll decision wearing an architecture costume. A central platform team is cheaper on salary and slower at the domain boundary; embedded engineers per domain are faster in context and multiply headcount by the number of domains. This week scores both on five criteria you weight yourself, then prices the staffing each implies, and divides the cost difference by the score margin. If a model costs an extra $1.4M a year to win by 0.3 points on weights you chose yourself, that is worth seeing plainly.",
    terms: ["blended-rate", "data-contract", "unit-economics", "blast-radius"],
    presets: [
      preset("Six domains, mid-size platform", "8 central engineers, or 6 domains with 2 each plus enablement.", {
        weightSpeedofchange: 8, centralSpeedofchange: 4, federatedSpeedofchange: 8,
        weightConsistencyofdefinitions: 9, centralConsistencyofdefinitions: 9, federatedConsistencyofdefinitions: 4,
        weightDomainexpertise: 7, centralDomainexpertise: 3, federatedDomainexpertise: 9,
        weightAuditburden: 6, centralAuditburden: 8, federatedAuditburden: 4,
        weightStaffingreality: 9, centralStaffingreality: 7, federatedStaffingreality: 3,
        centralFteCount: 8, federatedFtePerDomain: 2, domainCount: 6, fullyLoadedFteUsd: 190000,
      }),
      preset("Small team, three domains", "Caldera's reality: three people total. Staffing reality outweighs everything.", {
        weightSpeedofchange: 6, centralSpeedofchange: 6, federatedSpeedofchange: 7,
        weightConsistencyofdefinitions: 7, centralConsistencyofdefinitions: 9, federatedConsistencyofdefinitions: 3,
        weightDomainexpertise: 5, centralDomainexpertise: 5, federatedDomainexpertise: 8,
        weightAuditburden: 4, centralAuditburden: 8, federatedAuditburden: 3,
        weightStaffingreality: 10, centralStaffingreality: 8, federatedStaffingreality: 1,
        centralFteCount: 3, federatedFtePerDomain: 1, domainCount: 3, fullyLoadedFteUsd: 175000,
      }),
      preset("A margin too thin to matter", "Flat scores. The tool will tell you the weights are deciding.", {
        weightSpeedofchange: 5, centralSpeedofchange: 5, federatedSpeedofchange: 5,
        weightConsistencyofdefinitions: 5, centralConsistencyofdefinitions: 5, federatedConsistencyofdefinitions: 5,
        weightDomainexpertise: 5, centralDomainexpertise: 5, federatedDomainexpertise: 5,
        weightAuditburden: 5, centralAuditburden: 5, federatedAuditburden: 5,
        weightStaffingreality: 5, centralStaffingreality: 5, federatedStaffingreality: 5,
        centralFteCount: 10, federatedFtePerDomain: 2, domainCount: 8, fullyLoadedFteUsd: 190000,
      }),
    ],
    fields: [
      ...governanceFields(),
      numberField("centralFteCount", "Central platform headcount", "engineers", "Size of one central data platform team under the centralized model.", { min: 1, max: 200, step: 1 }),
      numberField("federatedFtePerDomain", "Engineers per domain", "engineers", "Embedded data engineers each business domain would hire under the federated model.", { min: 0.5, max: 20, step: 0.5 }),
      numberField("domainCount", "Business domains", "domains", "How many domains would own their own data. This is the multiplier on federated headcount.", { min: 1, max: 50, step: 1 }),
      numberField("fullyLoadedFteUsd", "Cost per engineer", "USD per year", "Salary, payroll tax, benefits, equipment, and overhead. Not salary alone.", { min: 50000, max: 500000, step: 5000, term: "blended-rate" }),
    ],
    run: (input) => weighOperatingModel(input),
  },
  {
    slug: "privacy-paths",
    week: 9,
    title: "Privacy Compliance Path Cost",
    decision: "Adopt one national internal standard or comply state by state. Cost both paths and pick one.",
    explainer:
      "US privacy law is a patchwork: each state writes its own statute, and they conflict. You can build once to whichever state is strictest and apply that everywhere, or you can build a separate programme per state. The first is cheaper past a certain state count and means every customer gets the strictest state's protections whether their state requires it or not. This week costs both paths over a horizon you set, finds the crossover state count, and separately prices the deletion requests neither path avoids, because a statutory right costs real money per exercise.",
    terms: ["personal-data", "blended-rate", "unit-economics"],
    presets: [
      preset("Atlas, 19 states", "Nineteen states in scope, California driving the standard, three-year horizon.", {
        stateCount: 19, strictestState: "California", nationalBuildUsd: 750000, nationalAnnualUsd: 200000,
        perStateBuildUsd: 60000, perStateAnnualUsd: 25000, horizonYears: 3, deletionRequestsPerYear: 4200, hoursPerDeletionRequest: 1.5,
      }),
      preset("Meridian, four states", "Only four states, two with conflicting health privacy statutes.", {
        stateCount: 4, strictestState: "Washington", nationalBuildUsd: 900000, nationalAnnualUsd: 260000,
        perStateBuildUsd: 110000, perStateAnnualUsd: 48000, horizonYears: 3, deletionRequestsPerYear: 900, hoursPerDeletionRequest: 3,
      }),
      preset("High request volume", "Twelve states and a consumer brand generating 30,000 requests a year.", {
        stateCount: 12, strictestState: "California", nationalBuildUsd: 620000, nationalAnnualUsd: 180000,
        perStateBuildUsd: 55000, perStateAnnualUsd: 22000, horizonYears: 5, deletionRequestsPerYear: 30000, hoursPerDeletionRequest: 0.75,
      }),
    ],
    fields: [
      numberField("stateCount", "States in scope", "states", "States whose statutes reach your data subjects, not states you have offices in.", { min: 1, max: 50, step: 1 }),
      { key: "strictestState", label: "Strictest state driving the standard", type: "text", help: "The state whose rule would set your national floor. You will be asked to cite the specific provision.", term: "personal-data" },
      numberField("nationalBuildUsd", "National standard build", "USD", "One-time cost to build to the strictest standard, once, for everyone.", { min: 1000, max: 20000000, step: 25000 }),
      numberField("nationalAnnualUsd", "National standard annual", "USD", "Ongoing programme cost: one jurisdiction's worth of process applied to all of them.", { min: 1000, max: 10000000, step: 10000 }),
      numberField("perStateBuildUsd", "Per-state build", "USD", "One-time cost per state. Multiplied by state count, so it compounds fast.", { min: 100, max: 5000000, step: 5000 }),
      numberField("perStateAnnualUsd", "Per-state annual", "USD", "Ongoing cost per state per year. This is the line that decides long horizons.", { min: 100, max: 5000000, step: 5000 }),
      numberField("horizonYears", "Horizon", "years", "Longer horizons favour the one-time build. State yours before you compute, not after.", { min: 1, max: 10, step: 1 }),
      numberField("deletionRequestsPerYear", "Deletion requests per year", "requests", "Statutory deletion and access requests you expect to service. Both paths pay this.", { min: 1, max: 500000, step: 100 }),
      numberField("hoursPerDeletionRequest", "Hours per request", "hours", "Manual effort per request today. Automation trades build cost against this figure.", { min: 0.05, max: 40, step: 0.25 }),
    ],
    run: (input) => costPrivacyPaths(input),
  },
  {
    slug: "ai-act",
    week: 10,
    title: "EU AI Act Exposure Timeline",
    decision: "Article 50 transparency duties apply now. High-risk duties were deferred. Does your roadmap change, and by how much?",
    explainer:
      "The EU AI Act phases in over several years, and the 2026 Digital Omnibus pushed the high-risk obligations back. Deferred is not cancelled. This week places every milestone relative to a date you supply, flags the obligations your stated posture already triggers, and then does the arithmetic nobody does: it divides your readiness effort estimate by the working weeks remaining before Annex III obligations apply. If that comes out at more hours per week than your team has slack for, the deferral did not buy you what you think it did.",
    terms: ["annex-iii", "gpai", "provider-deployer", "blended-rate"],
    presets: [
      preset("Deployer with a GPAI assistant", "Uses a general-purpose model, generates content, Annex III unresolved.", {
        role: "Deployer", annexIiiUseCase: "Unsure", usesGpai: "Yes", generatesSyntheticContent: "Yes", readinessHours: 900, blendedHourlyUsd: 140,
      }),
      preset("Provider of a high-risk system", "Clinical decision support. Annex III applies and the work is heavy.", {
        role: "Provider", annexIiiUseCase: "Yes", usesGpai: "Yes", generatesSyntheticContent: "No", readinessHours: 4200, blendedHourlyUsd: 165,
      }),
      preset("Arguably out of scope", "The tool will ask why the Act reaches you at all.", {
        role: "Neither", annexIiiUseCase: "No", usesGpai: "No", generatesSyntheticContent: "No", readinessHours: 80, blendedHourlyUsd: 140,
      }),
    ],
    fields: [
      selectField("role", "Your role under the Act", ["Provider", "Deployer", "Both", "Neither"], "Provider obligations are far heavier. Most organizations are both, for different systems.", "provider-deployer"),
      selectField("annexIiiUseCase", "Annex III use case in scope", ["No", "Yes", "Unsure"], "Whether any of your uses appear on the high-risk list. Unsure is a finding, not a gap.", "annex-iii"),
      selectField("usesGpai", "Uses a general-purpose AI model", ["No", "Yes"], "Fine-tuning a GPAI model can make you the provider of a new one.", "gpai"),
      selectField("generatesSyntheticContent", "Generates synthetic content", ["No", "Yes"], "Triggers Article 50 transparency duties, which are already in force."),
      numberField("readinessHours", "Readiness effort", "hours", "Your estimate of the work to reach compliance. You will be asked who supplied it.", { min: 1, max: 50000, step: 50 }),
      numberField("blendedHourlyUsd", "Blended hourly cost", "USD", "Fully loaded cost of an engineering or compliance hour.", { min: 1, max: 1000, step: 5, term: "blended-rate" }),
    ],
    run: (input, now) => exposureTimeline(input, now),
  },
  {
    slug: "rag-retention",
    week: 11,
    title: "Retrieval Corpus Retention and Cost",
    decision: "Write the retention, lineage, and evaluation policy for a retrieval corpus that contains customer records.",
    explainer:
      "A retrieval corpus has two separate bills with two different owners. Indexing costs embedding tokens once per chunk and again on every reindex, at $0.02 per million tokens. Answering costs input tokens for every retrieved chunk on every question, forever, and output tokens on top. The answering bill scales with adoption and usually dwarfs the indexing bill within months. On the governance side, the unit that matters is the chunk, not the document: a deletion request that removes a source document but leaves its chunks and embeddings has deleted nothing that matters, and if your deletion SLA is longer than your reindex interval, deleted records stay retrievable until the next pass.",
    terms: ["rag", "chunk", "embedding", "reindex", "personal-data", "object-storage", "unit-economics"],
    presets: [
      preset("Customer service assistant", "400,000 documents, 35 percent personal data, monthly reindex.", {
        documentCount: 400000, tokensPerDocument: 1200, chunkTokens: 500, chunksPerAnswer: 8, questionsPerDay: 2000,
        percentPersonalData: 35, retentionMonths: 24, reindexIntervalDays: 30, evalSetSize: 800, deletionSlaDays: 45,
      }),
      preset("Small corpus, high volume", "Only 20,000 manuals, but 40,000 questions a day. Answering dominates.", {
        documentCount: 20000, tokensPerDocument: 3000, chunkTokens: 600, chunksPerAnswer: 12, questionsPerDay: 40000,
        percentPersonalData: 5, retentionMonths: 60, reindexIntervalDays: 90, evalSetSize: 400, deletionSlaDays: 30,
      }),
      preset("Deletion SLA beats the reindex", "A 30-day promise against a 90-day reindex. The tool will object.", {
        documentCount: 900000, tokensPerDocument: 800, chunkTokens: 400, chunksPerAnswer: 6, questionsPerDay: 1200,
        percentPersonalData: 68, retentionMonths: 18, reindexIntervalDays: 90, evalSetSize: 500, deletionSlaDays: 30,
      }),
    ],
    fields: [
      numberField("documentCount", "Documents in corpus", "documents", "Source documents before chunking.", { min: 1, max: 50000000, step: 1000 }),
      numberField("tokensPerDocument", "Tokens per document", "tokens", "Roughly 750 words per 1,000 tokens. A 4-page memo is about 1,500.", { min: 1, max: 100000, step: 100 }),
      numberField("chunkTokens", "Tokens per chunk", "tokens", "Smaller chunks retrieve more precisely and cost more to embed and store.", { min: 50, max: 4000, step: 50, term: "chunk" }),
      numberField("chunksPerAnswer", "Chunks retrieved per answer", "chunks", "Every retrieved chunk is billed as input tokens on every single question.", { min: 1, max: 50, step: 1 }),
      numberField("questionsPerDay", "Questions per day", "questions", "Drives the generation bill, which recurs forever and scales with adoption.", { min: 1, max: 500000, step: 100 }),
      numberField("percentPersonalData", "Share containing personal data", "percent", "Sets the perimeter for retention, deletion, and access control.", { min: 0, max: 100, step: 1, term: "personal-data" }),
      numberField("retentionMonths", "Retention period", "months", "How long a document stays retrievable, independent of what its source system does.", { min: 1, max: 240, step: 1 }),
      numberField("reindexIntervalDays", "Reindex interval", "days", "Sets both maximum staleness and how often you pay the embedding bill again.", { min: 1, max: 365, step: 1, term: "reindex" }),
      numberField("evalSetSize", "Evaluation set size", "documents", "The sample you measure retrieval quality against. Below one percent of the corpus is close to blind.", { min: 1, max: 100000, step: 50 }),
      numberField("deletionSlaDays", "Deletion request SLA", "days", "What you have promised. Compare it against the reindex interval before you promise it.", { min: 1, max: 365, step: 1 }),
    ],
    run: (input) => draftRetentionPolicy(input),
  },
  {
    slug: "agent-access",
    week: 12,
    title: "Agent Access Scope and Run Cost",
    decision: "How does an autonomous agent authenticate to your platform, what is it permitted to read, and what does that reading cost?",
    explainer:
      "An agent is a data consumer with no person attached. It authenticates once and then reads without anyone waiting on the result, which means two things fail silently: an over-broad grant produces no complaint, and a growing query volume produces no budget conversation. This week builds the scope matrix, measures the credential exposure window (unbounded for a static key, since it never expires), and prices the reads at the same per-TB rate a human pays. An agent that reads $180,000 of data a year is a headcount-sized line item attached to an identity with no manager.",
    terms: ["static-key", "workload-identity", "credential-vending", "blast-radius", "human-in-the-loop", "per-tb-scanned", "personal-data"],
    presets: [
      preset("Static key, everything granted", "The configuration the tool will complain about most loudly.", {
        authMethod: "Static API key", credentialLifetimeMinutes: 60, humanInLoop: "Not required", agentQueriesPerDay: 5000, gibScannedPerQuery: 0.8,
        grantReadpublictables: "Granted", grantReadinternaltables: "Granted", grantReadtablescontainingpersonaldata: "Granted",
        grantWritetostaging: "Granted", grantWritetoproduction: "Granted",
      }),
      preset("Least privilege, read only", "Federated identity, 15-minute credentials, no writes, no personal data.", {
        authMethod: "Workload identity federation", credentialLifetimeMinutes: 15, humanInLoop: "Required", agentQueriesPerDay: 1200, gibScannedPerQuery: 0.3,
        grantReadpublictables: "Granted", grantReadinternaltables: "Granted", grantReadtablescontainingpersonaldata: "Denied",
        grantWritetostaging: "Denied", grantWritetoproduction: "Denied",
      }),
      preset("High-volume reader", "Modest scope, but 50,000 queries a day. Watch the annual figure.", {
        authMethod: "Short-lived vended credential", credentialLifetimeMinutes: 60, humanInLoop: "Required", agentQueriesPerDay: 50000, gibScannedPerQuery: 1.5,
        grantReadpublictables: "Granted", grantReadinternaltables: "Granted", grantReadtablescontainingpersonaldata: "Denied",
        grantWritetostaging: "Granted", grantWritetoproduction: "Denied",
      }),
    ],
    fields: [
      selectField("authMethod", "Agent authentication method", ["Static API key", "Short-lived vended credential", "Workload identity federation"], "How the agent proves what it is before anything else happens.", "workload-identity"),
      numberField("credentialLifetimeMinutes", "Credential lifetime", "minutes", "Ignored entirely when the method is a static key, because a static key has no expiry.", { min: 1, max: 10080, step: 5, term: "static-key" }),
      selectField("humanInLoop", "Human approval before write", ["Required", "Not required"], "A gate everyone rubber-stamps costs latency and buys nothing. Approval rate near 100 percent is the tell.", "human-in-the-loop"),
      numberField("agentQueriesPerDay", "Agent queries per day", "queries", "Automated volume, typically an order of magnitude above human volume.", { min: 1, max: 1000000, step: 100 }),
      numberField("gibScannedPerQuery", "Bytes scanned per query", "GiB", "What one agent question actually reads off disk. Agents pay the same per-TB rate humans do.", { min: 0.001, max: 1000, step: 0.1, term: "per-tb-scanned" }),
      ...scopeFields(),
    ],
    run: (input) => buildScopeMatrix(input),
  },
]);

/**
 * Look up a tool by slug.
 *
 * @param {string} slug
 * @returns {ToolDef | undefined}
 */
export function findTool(slug) {
  return TOOLS.find((tool) => tool.slug === slug);
}

/**
 * Catalog metadata for the client, with every glossary key resolved to its
 * full definition. Excludes the run function.
 *
 * `resolveTerms` throws on an unknown key, so a typo in a `terms` array fails
 * the test suite rather than shipping a blank definition to a student.
 *
 * @returns {Record<string, unknown>[]}
 */
export function catalogSummary() {
  return TOOLS.map(({ slug, week, title, decision, explainer, terms, presets, fields }) => ({
    slug,
    week,
    title,
    decision,
    explainer,
    presets,
    fields,
    terms: resolveTerms(terms),
  }));
}
