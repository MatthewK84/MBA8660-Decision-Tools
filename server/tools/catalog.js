/**
 * The tool catalog. One entry per course week.
 *
 * The catalog drives the API and the entire user interface. Adding a tool
 * means adding an entry here and a pure function in one of the sibling
 * modules. No new React page is required.
 *
 * @typedef {"number" | "text" | "select" | "date"} FieldType
 * @typedef {{
 *   key: string,
 *   label: string,
 *   type: FieldType,
 *   options?: readonly string[],
 *   unit?: string,
 *   help?: string
 * }} FieldDef
 * @typedef {{
 *   slug: string,
 *   week: number,
 *   title: string,
 *   decision: string,
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

/**
 * Build a numeric field definition.
 *
 * @param {string} key
 * @param {string} label
 * @param {string} unit
 * @param {string} help
 * @returns {FieldDef}
 */
function numberField(key, label, unit, help) {
  return { key, label, type: "number", unit, help };
}

/**
 * Build a select field definition.
 *
 * @param {string} key
 * @param {string} label
 * @param {readonly string[]} options
 * @returns {FieldDef}
 */
function selectField(key, label, options) {
  return { key, label, type: "select", options };
}

/** @returns {FieldDef[]} */
function cutFields() {
  const spend = CUT_CATEGORIES.map((c) => numberField(`spend${c}`, `${c} annual spend`, "USD", ""));
  const cuts = CUT_CATEGORIES.map((c) => numberField(`cut${c}`, `${c} cut`, "percent", ""));
  return [...spend, ...cuts];
}

/** @returns {FieldDef[]} */
function governanceFields() {
  return CRITERIA.flatMap((criterion) => {
    const slug = criterion.replace(/\s+/g, "");
    return [
      numberField(`weight${slug}`, `${criterion}: weight`, "0 to 10", ""),
      numberField(`central${slug}`, `${criterion}: centralized scores`, "0 to 10", ""),
      numberField(`federated${slug}`, `${criterion}: federated scores`, "0 to 10", ""),
    ];
  });
}

/** @returns {FieldDef[]} */
function scopeFields() {
  return AGENT_SCOPES.map((scope) =>
    selectField(`grant${scope.replace(/\s+/g, "")}`, scope, ["Denied", "Granted"])
  );
}

/** @type {readonly ToolDef[]} */
export const TOOLS = Object.freeze([
  {
    slug: "sizing",
    week: 1,
    title: "Working Set Sizing",
    decision: "Does this workload need a distributed system? Recommend yes or no, and show the sizing arithmetic that supports your answer.",
    fields: [
      numberField("rows", "Row count", "rows", "Largest table you must query."),
      numberField("bytesPerRow", "Bytes per row", "bytes", "Uncompressed average."),
      numberField("scanFraction", "Fraction scanned per query", "0.01 to 1", "0.1 means a typical query touches a tenth of the table."),
      numberField("annualGrowthPct", "Annual growth", "percent", ""),
      numberField("peakConcurrentQueries", "Peak concurrent queries", "queries", ""),
    ],
    run: (input) => computeSizing(input),
  },
  {
    slug: "lock-in",
    week: 2,
    title: "Table Format Lock-In Exposure",
    decision: "Recommend a table format. Name the vendor lock-in you are accepting and say why you accept it.",
    fields: [
      selectField("format", "Table format", ["Iceberg", "Delta Lake", "Hudi"]),
      selectField("primaryEngine", "Primary engine", ["Spark", "Trino", "Flink", "DuckDB", "Snowflake", "Databricks", "BigQuery"]),
      numberField("engineCount", "Engines requiring read access", "1 to 10", ""),
      selectField("catalogVendor", "Catalog vendor relationship", ["Same as engine", "Independent"]),
      numberField("dataVolumePb", "Data volume", "PB", "Use decimals for sub-petabyte estates."),
    ],
    run: (input) => scoreLockIn(input),
  },
  {
    slug: "catalog-failure",
    week: 3,
    title: "Catalog Failure Mode Surfacing",
    decision: "Choose a catalog. Name the failure mode you inherit with that choice and how you would detect it.",
    fields: [
      selectField("hosting", "Catalog hosting", ["Managed by vendor", "Self-hosted"]),
      selectField("credentialMode", "Credential handling", ["Vended by catalog", "Direct storage credentials"]),
      selectField("agentAccess", "Autonomous agent access", ["Not permitted", "Permitted"]),
      numberField("rtoMinutes", "Recovery time objective", "minutes", ""),
      numberField("tableCount", "Tables under management", "tables", ""),
    ],
    run: (input) => surfaceFailureModes(input),
  },
  {
    slug: "engine-budget",
    week: 4,
    title: "Engine Cost Against Budget Ceiling",
    decision: "Recommend an engine under a fixed annual budget. State explicitly what capability you gave up to stay inside it.",
    fields: [
      numberField("annualBudgetUsd", "Annual budget ceiling", "USD", ""),
      numberField("unitPriceUsd", "Published unit price", "USD", "From the vendor pricing page, not from memory."),
      selectField("unitLabel", "Price unit", ["per credit", "per TB scanned", "per DBU", "per node hour"]),
      { key: "priceRetrievedAt", label: "Price retrieved on", type: "date", help: "Required. The artifact rubric checks this." },
      numberField("unitsPerMonth", "Expected units per month", "units", ""),
      numberField("commitDiscountPct", "Committed-use discount", "percent", ""),
    ],
    run: (input, now) => fitEngineToBudget(input, now),
  },
  {
    slug: "finops-cut",
    week: 5,
    title: "Spend Reduction Simulator",
    decision: "Cut 20 percent of platform spend. Name what breaks, who complains, and what you tell them.",
    fields: [numberField("targetReductionPct", "Target reduction", "percent", ""), ...cutFields()],
    run: (input) => simulateCut(input),
  },
  {
    slug: "build-vs-buy",
    week: 6,
    title: "Build Versus Buy Break-Even",
    decision: "Build or buy. Show the break-even in months and name the single assumption the answer hinges on.",
    fields: [
      numberField("vendorMonthlyUsd", "Vendor monthly price", "USD", ""),
      { key: "priceRetrievedAt", label: "Price retrieved on", type: "date", help: "Required." },
      numberField("buildHours", "One-time build effort", "hours", ""),
      numberField("blendedHourlyUsd", "Blended hourly cost", "USD", "Fully loaded, not salary divided by 2080."),
      numberField("maintenanceHoursMonthly", "Maintenance effort", "hours per month", ""),
      numberField("horizonMonths", "Evaluation horizon", "months", ""),
    ],
    run: (input, now) => breakEven(input, now),
  },
  {
    slug: "control-cost",
    week: 7,
    title: "Reliability Control Pricing",
    decision: "Which single control would have caught this incident, and what does that control cost per year?",
    fields: [
      { key: "controlName", label: "Control name", type: "text", help: "One control, not a programme." },
      numberField("toolingAnnualUsd", "Annual tooling cost", "USD", ""),
      numberField("setupHours", "Setup effort", "hours", ""),
      numberField("opsHoursMonthly", "Operating effort", "hours per month", ""),
      numberField("blendedHourlyUsd", "Blended hourly cost", "USD", ""),
      numberField("incidentCostUsd", "Cost of one incident", "USD", ""),
      numberField("incidentsPerYear", "Expected incidents per year", "incidents", ""),
      numberField("catchRatePct", "Share of incidents this control catches", "percent", ""),
    ],
    run: (input) => annualControlCost(input),
  },
  {
    slug: "governance-model",
    week: 8,
    title: "Operating Model Weighting",
    decision: "Centralize or federate data ownership. Defend the choice against its strongest counterargument, not its weakest.",
    fields: governanceFields(),
    run: (input) => weighOperatingModel(input),
  },
  {
    slug: "privacy-paths",
    week: 9,
    title: "Privacy Compliance Path Cost",
    decision: "Adopt one national internal standard or comply state by state. Cost both paths and pick one.",
    fields: [
      numberField("stateCount", "States in scope", "states", ""),
      { key: "strictestState", label: "Strictest state driving the standard", type: "text", help: "" },
      numberField("nationalBuildUsd", "National standard build", "USD", ""),
      numberField("nationalAnnualUsd", "National standard annual", "USD", ""),
      numberField("perStateBuildUsd", "Per-state build", "USD", ""),
      numberField("perStateAnnualUsd", "Per-state annual", "USD", ""),
      numberField("horizonYears", "Horizon", "years", ""),
    ],
    run: (input) => costPrivacyPaths(input),
  },
  {
    slug: "ai-act",
    week: 10,
    title: "EU AI Act Exposure Timeline",
    decision: "Article 50 transparency duties apply now. High-risk duties were deferred. Does your roadmap change, and by how much?",
    fields: [
      selectField("role", "Your role under the Act", ["Provider", "Deployer", "Both", "Neither"]),
      selectField("annexIiiUseCase", "Annex III use case in scope", ["No", "Yes", "Unsure"]),
      selectField("usesGpai", "Uses a general-purpose AI model", ["No", "Yes"]),
      selectField("generatesSyntheticContent", "Generates synthetic content", ["No", "Yes"]),
    ],
    run: (input, now) => exposureTimeline(input, now),
  },
  {
    slug: "rag-retention",
    week: 11,
    title: "Retrieval Corpus Retention Framing",
    decision: "Write the retention, lineage, and evaluation policy for a retrieval corpus that contains customer records.",
    fields: [
      numberField("documentCount", "Documents in corpus", "documents", ""),
      numberField("percentPersonalData", "Share containing personal data", "percent", ""),
      numberField("retentionMonths", "Retention period", "months", ""),
      numberField("reindexIntervalDays", "Reindex interval", "days", ""),
      numberField("evalSetSize", "Evaluation set size", "documents", ""),
      numberField("deletionSlaDays", "Deletion request SLA", "days", ""),
    ],
    run: (input) => draftRetentionPolicy(input),
  },
  {
    slug: "agent-access",
    week: 12,
    title: "Agent Access Scope Matrix",
    decision: "How does an autonomous agent authenticate to your platform, and what is it permitted to read?",
    fields: [
      selectField("authMethod", "Agent authentication method", ["Static API key", "Short-lived vended credential", "Workload identity federation"]),
      numberField("credentialLifetimeMinutes", "Credential lifetime", "minutes", ""),
      selectField("humanInLoop", "Human approval before write", ["Required", "Not required"]),
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
 * Catalog metadata for the client. Excludes the run function.
 *
 * @returns {{ slug: string, week: number, title: string, decision: string, fields: readonly FieldDef[] }[]}
 */
export function catalogSummary() {
  return TOOLS.map(({ slug, week, title, decision, fields }) => ({ slug, week, title, decision, fields }));
}
