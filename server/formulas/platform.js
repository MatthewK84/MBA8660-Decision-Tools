/**
 * Formula specifications for Weeks 1 to 4, mirroring server/tools/platform.js.
 *
 * Each expression here is the same arithmetic the tool performs, written in
 * Excel syntax against named cells. Where the tool uses a helper such as
 * gibToTb, the expression spells the conversion out, because a student
 * reproducing this in a spreadsheet has no helper functions and a unit
 * conversion hidden inside one is exactly where the seven percent error lives.
 */

import { constant, input, output, publishedRate, spec, unmodelled } from "./kit.js";

/** Bytes in a gibibyte, and gigabytes in a gibibyte. Both appear on the sheets. */
const BYTES_PER_GIB = 1024 ** 3;
const GB_PER_GIB = 1024 ** 3 / 1000 ** 3;

/** @type {import("./kit.js").FormulaSpec} */
export const SIZING_SPEC = spec({
  slug: "sizing",
  week: 1,
  title: "Working Set Sizing and Cost",
  inputs: [
    input("rows", "Row count", "rows", "The largest single table you must query."),
    input("bytesPerRow", "Bytes per row", "bytes", "Uncompressed average across every column."),
    input("compressionRatio", "Compression ratio", "x", "How many times smaller the data gets on disk. Yours is a measurement, not a constant."),
    input("scanFraction", "Fraction scanned per query", "0.01 to 1", "What a typical query touches after partition pruning."),
    input("annualGrowthPct", "Annual growth", "percent", "Compounded over three years."),
    input("peakConcurrentQueries", "Peak concurrent queries", "queries", "Simultaneous queries at the busiest moment."),
    input("queriesPerDay", "Queries per day", "queries", "Total daily query volume."),
    input("computeHoursPerDay", "Compute hours per day", "hours", "Hours the engine is actually running."),
  ],
  constants: [
    constant("bytesPerGib", "Bytes per GiB", BYTES_PER_GIB, "bytes", "1,024 cubed. Not one billion, which is where a seven percent error comes from."),
    constant("gbPerGib", "GB per GiB", GB_PER_GIB, "GB", "Memory is sized in GiB and storage is billed in GB. Convert before pricing anything."),
    constant("singleNodeCeilingGib", "Single-node memory ceiling", 512, "GiB", "RAM in the largest single machine this model assumes you can rent."),
    constant("workerNodeGib", "Memory per cluster worker", 128, "GiB", "RAM in one worker of the distributed cluster."),
    constant("daysPerMonth", "Days per month", 30.42, "days", "Average month, used to turn a daily figure into a monthly bill."),
    constant("daysPerYear", "Days per year", 365, "days", ""),
    constant("monthsPerYear", "Months per year", 12, "months", ""),
    constant("gbPerTb", "GB per TB", 1000, "GB", "Scan pricing is per decimal TB."),
    constant("minimumWorkers", "Minimum workers in a cluster", 2, "nodes", "One worker is not a distributed system."),
    constant("shuffleDirections", "Cross-zone transfer directions billed", 2, "directions", "A byte sent between zones is billed leaving and arriving."),
    publishedRate("storageRate", "Object storage price", "objectStorageStandard"),
    publishedRate("scanRate", "Scan price", "scanPerTb"),
    publishedRate("singleNodeRate", "Single-node compute price", "computeSingleNode"),
    publishedRate("workerRate", "Worker node compute price", "computeWorkerNode"),
    publishedRate("crossAzRate", "Cross-zone transfer price", "egressCrossAz"),
  ],
  outputs: [
    output("rawGib", "Raw uncompressed size", "GiB", (r) => `${r("rows")}*${r("bytesPerRow")}/${r("bytesPerGib")}`, {
      match: "Raw uncompressed size",
      note: "Rows times bytes per row. The number nobody ever actually stores.",
    }),
    output("compressedGib", "Columnar estimate", "GiB", (r) => `${r("rawGib")}/${r("compressionRatio")}`, {
      match: "Columnar estimate",
      note: "What the bytes occupy once written as compressed columnar files.",
    }),
    output("savedGib", "Bytes removed by compression", "GiB", (r) => `${r("rawGib")}-${r("compressedGib")}`, {
      match: "Bytes removed by compression",
      note: "Storage you do not rent and bytes you do not scan. Billed twice over.",
    }),
    output("workingGib", "Working set per query", "GiB", (r) => `${r("compressedGib")}*${r("scanFraction")}`, {
      match: "Working set per query",
      note: "This, not table size, is what has to fit in memory.",
    }),
    output("concurrentGib", "Working set at peak concurrency", "GiB", (r) => `${r("workingGib")}*${r("peakConcurrentQueries")}`, {
      match: "Working set at peak concurrency",
      note: "Every simultaneous query holds its own working set.",
    }),
    output("threeYearGib", "Working set in year three", "GiB", (r) => `${r("concurrentGib")}*(1+${r("annualGrowthPct")}/100)^3`, {
      match: "Working set in year three",
      note: "Architecture is chosen for this figure, not today's.",
    }),
    output("headroom", "Headroom against the single node", "x", (r) => `${r("singleNodeCeilingGib")}/${r("threeYearGib")}`, {
      match: "Headroom against",
      note: "Above 1.0 the workload still fits on one machine in year three.",
    }),
    output("storageCompressedMonthly", "Storage, compressed, per month", "USD per month", (r) => `${r("compressedGib")}*${r("gbPerGib")}*${r("storageRate")}`, {
      match: "Storage, compressed, per month",
      format: "usd",
    }),
    output("storageRawMonthly", "Storage, uncompressed, per month", "USD per month", (r) => `${r("rawGib")}*${r("gbPerGib")}*${r("storageRate")}`, {
      match: "Storage, uncompressed, per month",
      format: "usd",
      note: "What the same data would cost stored raw.",
    }),
    output("scanTbPerQuery", "TB scanned per query", "TB", (r) => `${r("workingGib")}*${r("gbPerGib")}/${r("gbPerTb")}`, {
      note: "Working set converted from GiB to the decimal TB scan pricing uses.",
    }),
    output("scanCostPerQuery", "Cost of one query", "USD", (r) => `${r("scanTbPerQuery")}*${r("scanRate")}`, {
      match: "Cost of one query",
      format: "money",
      note: "You pay for bytes read, not rows returned.",
    }),
    output("scanCostAnnual", "Query spend per year", "USD per year", (r) => `${r("scanCostPerQuery")}*${r("queriesPerDay")}*${r("daysPerYear")}`, {
      match: "Query spend per year",
      format: "usd",
    }),
    output("scanCostAnnualRaw", "Query spend per year if uncompressed", "USD per year", (r) => `${r("workingGib")}*(${r("rawGib")}/${r("compressedGib")})*${r("gbPerGib")}/${r("gbPerTb")}*${r("scanRate")}*${r("queriesPerDay")}*${r("daysPerYear")}`, {
      match: "Query spend per year if uncompressed",
      format: "usd",
      note: "The same queries against uncompressed data.",
    }),
    output("singleNodeMonthly", "Single-node compute per month", "USD per month", (r) => `${r("singleNodeRate")}*${r("computeHoursPerDay")}*${r("daysPerMonth")}`, {
      match: "Single-node compute per month",
      format: "usd",
    }),
    output("workers", "Workers a distributed cluster needs", "nodes", (r) => `MAX(${r("minimumWorkers")},CEILING(${r("threeYearGib")}/${r("workerNodeGib")},1))`, {
      match: "Workers a distributed cluster needs",
      note: "Year-three working set divided by memory per worker, with a floor of two.",
    }),
    output("clusterMonthly", "Distributed compute per month", "USD per month", (r) => `${r("workerRate")}*${r("workers")}*${r("computeHoursPerDay")}*${r("daysPerMonth")}`, {
      match: "Distributed compute per month",
      format: "usd",
    }),
    output("shuffleGb", "Bytes shuffled per query", "GB", (r) => `${r("workingGib")}*${r("gbPerGib")}*((${r("workers")}-1)/${r("workers")})`, {
      note: "The share of a working set that has to cross the network between workers.",
    }),
    output("shuffleAnnual", "Shuffle network per year", "USD per year", (r) => `${r("shuffleGb")}*${r("crossAzRate")}*${r("shuffleDirections")}*${r("queriesPerDay")}*${r("daysPerYear")}`, {
      match: "Shuffle network per year",
      format: "usd",
      note: "This charge exists only on the distributed path.",
    }),
    output("singleAnnual", "Annual total, single-node path", "USD per year", (r) => `${r("singleNodeMonthly")}*${r("monthsPerYear")}+${r("scanCostAnnual")}+${r("storageCompressedMonthly")}*${r("monthsPerYear")}`, {
      match: "Annual total, single-node path",
      format: "usd",
    }),
    output("clusterAnnual", "Annual total, distributed path", "USD per year", (r) => `${r("clusterMonthly")}*${r("monthsPerYear")}+${r("scanCostAnnual")}+${r("shuffleAnnual")}+${r("storageCompressedMonthly")}*${r("monthsPerYear")}`, {
      match: "Annual total, distributed path",
      format: "usd",
    }),
  ],
});

/** @type {import("./kit.js").FormulaSpec} */
export const LOCK_IN_SPEC = spec({
  slug: "lock-in",
  week: 2,
  title: "Table Format Lock-In and Exit Cost",
  inputs: [
    input("format", "Table format", "", "Iceberg, Delta Lake, or Hudi.", "text"),
    input("primaryEngine", "Primary engine", "", "The engine doing most of the reading.", "text"),
    input("engineCount", "Engines requiring read access", "engines", "Portability only matters when more than one engine reads the same table."),
    input("catalogVendor", "Catalog vendor relationship", "", "Same as engine, or Independent.", "text"),
    input("dataVolumePb", "Data volume", "PB", "Total bytes that would have to be rewritten to leave."),
    input("crossesCloudBoundary", "Migration leaves the cloud", "", "Yes or No. Egress is charged only when the bytes leave.", "text"),
  ],
  constants: [
    constant("rewriteTbPerHour", "Rewrite throughput assumed", 5, "TB per hour", "A sustained rate for a well-provisioned rewrite job. Your measured rate may differ by an order of magnitude."),
    constant("rewriteWorkers", "Workers held for the rewrite", 20, "nodes", ""),
    constant("tbPerPb", "TB per PB", 1000, "TB", ""),
    constant("gbPerTb", "GB per TB", 1000, "GB", ""),
    constant("hoursPerDay", "Hours per day", 24, "hours", ""),
    publishedRate("workerRate", "Rewrite compute price", "computeWorkerNode"),
    publishedRate("egressRate", "Egress price", "egressInternet"),
  ],
  outputs: [
    output("rewriteHours", "Full-rewrite time", "hours", (r) => `${r("dataVolumePb")}*${r("tbPerPb")}/${r("rewriteTbPerHour")}`, {
      match: "Full-rewrite time at",
      note: "Mechanical time to rewrite every byte, assuming nothing goes wrong.",
    }),
    output("rewriteDays", "Full-rewrite time in days", "days", (r) => `${r("rewriteHours")}/${r("hoursPerDay")}`, {
      match: "Full-rewrite time in days",
      note: "The same figure in a unit an executive will actually hear.",
    }),
    output("computeUsd", "Rewrite compute cost", "USD", (r) => `${r("rewriteHours")}*${r("workerRate")}*${r("rewriteWorkers")}`, {
      match: "Rewrite compute cost",
      format: "usd",
    }),
    output("egressUsd", "Egress cost to leave the cloud", "USD", (r) => `IF(${r("crossesCloudBoundary")}="Yes",${r("dataVolumePb")}*${r("tbPerPb")}*${r("gbPerTb")}*${r("egressRate")},0)`, {
      match: "Egress cost to leave the cloud",
      format: "usd",
      note: "Zero when the migration stays inside one cloud.",
    }),
    output("totalUsd", "Mechanical cost of leaving", "USD", (r) => `${r("computeUsd")}+${r("egressUsd")}`, {
      match: "Mechanical cost of leaving",
      format: "usd",
      note: "Excludes every hour of human time, which is the larger number.",
    }),
  ],
  unmodelled: [
    unmodelled("Format under evaluation", "Echoes the format you chose."),
    unmodelled("Engine exposure", "A sentence about your engine count, not a calculation."),
    unmodelled("Catalog exposure", "A sentence about your catalog relationship, not a calculation."),
  ],
});

/** @type {import("./kit.js").FormulaSpec} */
export const CATALOG_SPEC = spec({
  slug: "catalog-failure",
  week: 3,
  title: "Catalog Failure Modes and Cost",
  inputs: [
    input("hosting", "Catalog hosting", "", "Managed by vendor, or Self-hosted.", "text"),
    input("credentialMode", "Credential handling", "", "Vended by catalog, or Direct storage credentials.", "text"),
    input("agentAccess", "Autonomous agent access", "", "Permitted, or Not permitted.", "text"),
    input("rtoMinutes", "Recovery time objective", "minutes", "How long you have agreed the catalog may stay down."),
    input("tableCount", "Tables under management", "tables", "Every table is one catalog object."),
    input("partitionsPerTable", "Partitions per table", "partitions", "Three years of daily partitions is about 1,095."),
    input("queriesPerDay", "Queries per day", "queries", "Catalog requests scale with query count, not data volume."),
  ],
  constants: [
    constant("lookupsPerQuery", "Catalog lookups per query", 4, "lookups", "Planning hits the catalog several times before reading a byte."),
    constant("daysPerMonth", "Days per month", 30.42, "days", ""),
    constant("freeObjects", "Catalog objects included free", 1000000, "objects", ""),
    constant("objectBlock", "Objects per priced block", 100000, "objects", ""),
    constant("freeRequests", "Catalog requests included free", 1000000, "requests", ""),
    constant("requestBlock", "Requests per priced block", 1000000, "requests", ""),
    constant("quorumNodes", "Nodes for a self-hosted quorum", 3, "nodes", ""),
    constant("hoursPerMonth", "Hours per month", 730, "hours", "The figure cloud vendors bill against."),
    constant("hoursPerYear", "Hours per year", 8760, "hours", "Used for the hourly audit log."),
    constant("baseFailureModes", "Failure modes before agent access", 2, "modes", "One for hosting, one for credential handling."),
    publishedRate("catalogObjectRate", "Catalog object price", "catalogObjects"),
    publishedRate("catalogRequestRate", "Catalog request price", "catalogRequests"),
    publishedRate("workerRate", "Self-hosting compute price", "computeWorkerNode"),
  ],
  outputs: [
    output("failureModes", "Failure modes surfaced", "modes", (r) => `${r("baseFailureModes")}+IF(${r("agentAccess")}="Permitted",1,0)`, {
      match: "Failure modes surfaced",
      note: "Hosting and credential handling each contribute one. Agent access adds a third.",
    }),
    output("objects", "Catalog objects", "objects", (r) => `${r("tableCount")}*(1+${r("partitionsPerTable")})`, {
      match: "Catalog objects",
      note: "Tables plus partitions. Partition count is what crosses the free tier.",
    }),
    output("objectUsd", "Catalog storage per month", "USD per month", (r) => `MAX(0,${r("objects")}-${r("freeObjects")})/${r("objectBlock")}*${r("catalogObjectRate")}`, {
      match: "Catalog storage per month",
      format: "money",
    }),
    output("requests", "Catalog requests per month", "requests", (r) => `${r("queriesPerDay")}*${r("lookupsPerQuery")}*${r("daysPerMonth")}`, {
      match: "Catalog requests per month",
      note: "The line after this one prices them; this one counts them.",
    }),
    output("requestUsd", "Catalog request cost per month", "USD per month", (r) => `MAX(0,${r("requests")}-${r("freeRequests")})/${r("requestBlock")}*${r("catalogRequestRate")}`, {
      match: "Catalog requests per month, cost",
      format: "money",
    }),
    output("selfHostUsd", "Self-hosting compute per month", "USD per month", (r) => `IF(${r("hosting")}="Self-hosted",${r("workerRate")}*${r("quorumNodes")}*${r("hoursPerMonth")},0)`, {
      match: "Self-hosting compute per month",
      format: "money",
      note: "Zero when the vendor hosts it.",
    }),
    output("totalUsd", "Catalog cost per month", "USD per month", (r) => `${r("objectUsd")}+${r("requestUsd")}+${r("selfHostUsd")}`, {
      match: "Catalog cost per month",
      format: "money",
      note: "Small in absolute terms. That is the point.",
    }),
    output("auditRows", "Audit rows per year at hourly granularity", "rows", (r) => `${r("tableCount")}*${r("hoursPerYear")}`, {
      match: "Audit rows per year",
      note: "One access-log row per table per hour. Retaining this log is itself a storage decision.",
    }),
  ],
  unmodelled: [
    unmodelled("Mode ", "Each failure mode is a sentence describing what breaks, not a figure."),
    unmodelled("Stated recovery time objective", "Echoes the objective you entered, which the Inputs block already holds."),
  ],
});

/** @type {import("./kit.js").FormulaSpec} */
export const BUDGET_SPEC = spec({
  slug: "engine-budget",
  week: 4,
  title: "Engine Cost Against Budget Ceiling",
  inputs: [
    input("annualBudgetUsd", "Annual budget ceiling", "USD", "The Final Artifact constraint."),
    input("unitPriceUsd", "Published unit price", "USD", "From the vendor pricing page, not from memory."),
    input("unitLabel", "Price unit", "", "Per credit, per TB scanned, per DBU, or per node hour.", "text"),
    input("priceRetrievedAt", "Price retrieved on", "date", "An undated price is not evidence.", "date"),
    input("unitsPerMonth", "Expected units per month", "units", "A forecast you supplied, and the largest source of error here."),
    input("commitDiscountPct", "Committed-use discount", "percent", "A multi-year obligation traded for a lower rate."),
    input("storageTb", "Storage under management", "TB", "A compute-only budget is not a platform budget."),
  ],
  constants: [
    constant("monthsPerYear", "Months per year", 12, "months", ""),
    constant("gbPerTb", "GB per TB", 1000, "GB", "Storage is priced per GB-month."),
    publishedRate("storageRate", "Object storage price", "objectStorageStandard"),
  ],
  outputs: [
    output("listAnnual", "Compute at list price", "USD per year", (r) => `${r("unitPriceUsd")}*${r("unitsPerMonth")}*${r("monthsPerYear")}`, {
      match: "Compute at list price",
      format: "usd",
      note: "Nobody is quoted a discount before they ask.",
    }),
    output("discountedAnnual", "Compute after commit discount", "USD per year", (r) => `${r("listAnnual")}*(1-${r("commitDiscountPct")}/100)`, {
      match: "Compute after",
      format: "usd",
      note: "What you pay if the forecast holds. If it does not, you still owe the commitment.",
    }),
    output("storageAnnual", "Storage per year", "USD per year", (r) => `${r("storageTb")}*${r("gbPerTb")}*${r("storageRate")}*${r("monthsPerYear")}`, {
      match: "Storage per year",
      format: "usd",
    }),
    output("totalAnnual", "Platform total per year", "USD per year", (r) => `${r("discountedAnnual")}+${r("storageAnnual")}`, {
      match: "Platform total per year",
      format: "usd",
      note: "This, not the compute line, is what the ceiling has to cover.",
    }),
    output("remaining", "Budget remaining", "USD per year", (r) => `${r("annualBudgetUsd")}-${r("totalAnnual")}`, {
      match: "Budget remaining",
      format: "usd",
      note: "Your entire margin for a forecast error or a price rise.",
    }),
    output("utilisation", "Ceiling utilisation", "percent", (r) => `${r("totalAnnual")}/${r("annualBudgetUsd")}*100`, {
      match: "Ceiling utilisation",
      note: "Above 85 percent there is no room inside the budget year.",
    }),
    output("breakEvenUnits", "Units per month that exhaust the ceiling", "units per month", (r) => `(${r("annualBudgetUsd")}-${r("storageAnnual")})/(1-${r("commitDiscountPct")}/100)/${r("unitPriceUsd")}/${r("monthsPerYear")}`, {
      match: "Units per month that exhaust the ceiling",
      note: "The volume at which compute plus storage exactly equals the ceiling.",
    }),
  ],
});
