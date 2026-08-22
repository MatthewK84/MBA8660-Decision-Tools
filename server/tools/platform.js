/**
 * Week 1 to Week 4 tools: platform architecture, priced.
 *
 * Every export is a pure function. No I/O, no clock, no database. Default
 * rates come from server/reference/rates.js, a dated snapshot of published
 * list prices, and every rate used is echoed into the assumption log with its
 * retrieval date attached.
 */

import {
  barChart,
  gaugeChart,
  gibToGb,
  gibToTb,
  line,
  money,
  num,
  point,
  requireChoice,
  requirePositive,
  requireRange,
  requireRetrievalDate,
  stackChart,
  usd,
} from "./kit.js";
import { BYTES_PER_GIB, HOURS_PER_MONTH, citation, rate } from "../reference/rates.js";

/** RAM in the largest single node this application assumes you can rent. */
const SINGLE_NODE_MAX_GIB = 512;

/** RAM in one worker of the distributed cluster the tool prices against. */
const WORKER_NODE_GIB = 128;

/** Average days in a month, used to turn a per-day figure into a monthly bill. */
const DAYS_PER_MONTH = 30.42;

/**
 * Size the working set. Pure arithmetic, separated from pricing so the two can
 * be read and checked independently.
 *
 * @param {{ rows: number, bytesPerRow: number, ratio: number, scanFraction: number, growth: number, concurrency: number }} args
 * @returns {{ rawGib: number, compressedGib: number, savedGib: number, workingGib: number, concurrentGib: number, threeYearGib: number, headroom: number }}
 */
function sizeWorkingSet(args) {
  const rawGib = (args.rows * args.bytesPerRow) / BYTES_PER_GIB;
  const compressedGib = rawGib / args.ratio;
  const workingGib = compressedGib * args.scanFraction;
  const concurrentGib = workingGib * args.concurrency;
  const threeYearGib = concurrentGib * (1 + args.growth / 100) ** 3;
  return {
    rawGib,
    compressedGib,
    savedGib: rawGib - compressedGib,
    workingGib,
    concurrentGib,
    threeYearGib,
    headroom: SINGLE_NODE_MAX_GIB / threeYearGib,
  };
}

/**
 * Price the three bills a query workload generates: storage per month, bytes
 * scanned per day, and the compute that does the scanning.
 *
 * @param {{ compressedGib: number, rawGib: number, workingGib: number, threeYearGib: number, queriesPerDay: number, computeHoursPerDay: number }} s
 * @returns {Record<string, number>}
 */
function priceWorkload(s) {
  const storageRate = rate("objectStorageStandard").unitPriceUsd;
  const scanRate = rate("scanPerTb").unitPriceUsd;
  const shuffleRate = rate("egressCrossAz").unitPriceUsd * 2;
  const monthlyHours = s.computeHoursPerDay * DAYS_PER_MONTH;

  const scanTbPerQuery = gibToTb(s.workingGib);
  const workers = Math.max(2, Math.ceil(s.threeYearGib / WORKER_NODE_GIB));
  const shuffleGb = gibToGb(s.workingGib) * ((workers - 1) / workers);

  return {
    storageCompressedMonthly: gibToGb(s.compressedGib) * storageRate,
    storageRawMonthly: gibToGb(s.rawGib) * storageRate,
    scanCostPerQuery: scanTbPerQuery * scanRate,
    scanCostAnnual: scanTbPerQuery * scanRate * s.queriesPerDay * 365,
    scanCostAnnualRaw: gibToTb(s.workingGib * (s.rawGib / s.compressedGib)) * scanRate * s.queriesPerDay * 365,
    singleNodeMonthly: rate("computeSingleNode").unitPriceUsd * monthlyHours,
    workers,
    clusterMonthly: rate("computeWorkerNode").unitPriceUsd * workers * monthlyHours,
    shuffleAnnual: shuffleGb * shuffleRate * s.queriesPerDay * 365,
  };
}

/**
 * Assemble the Week 1 computed lines. Split out so the entry point stays
 * readable and each figure carries the note that explains it.
 *
 * @param {Record<string, number>} s
 * @param {Record<string, number>} p
 * @param {number} ratio
 * @returns {import("./kit.js").Line[]}
 */
function sizingLines(s, p, ratio) {
  const singleAnnual = p.singleNodeMonthly * 12 + p.scanCostAnnual + p.storageCompressedMonthly * 12;
  const clusterAnnual = p.clusterMonthly * 12 + p.scanCostAnnual + p.shuffleAnnual + p.storageCompressedMonthly * 12;
  return [
    line("Raw uncompressed size", num(s.rawGib, 1, "GiB"), "Rows times bytes per row. This is the number nobody ever actually stores."),
    line(`Columnar estimate at ${num(ratio, 1, "x")}`, num(s.compressedGib, 1, "GiB"), "What the bytes occupy on disk once written as compressed columnar files."),
    line("Bytes removed by compression", num(s.savedGib, 1, "GiB"), "Storage you do not rent and bytes you do not scan. Both are billed, so this is money twice."),
    line("Working set per query", num(s.workingGib, 1, "GiB"), "Compressed size times the fraction one query reads. This, not table size, is what has to fit in memory."),
    line("Working set at peak concurrency", num(s.concurrentGib, 1, "GiB"), "Every simultaneous query holds its own working set, so memory is provisioned for the peak."),
    line("Working set in year three", num(s.threeYearGib, 1, "GiB"), "Peak working set compounded by your growth rate for three years. Architecture is chosen for this figure, not today's."),
    line(`Headroom against a ${SINGLE_NODE_MAX_GIB} GiB single node`, num(s.headroom, 2, "x"), "Ceiling divided by year-three demand. Above 1.0 the workload still fits on one machine in year three."),
    line("Storage, compressed, per month", money(p.storageCompressedMonthly), `Object storage at ${citation("objectStorageStandard")}.`),
    line("Storage, uncompressed, per month", money(p.storageRawMonthly), "What the same data would cost stored raw. The gap is the storage half of what compression buys."),
    line("Cost of one query", money(p.scanCostPerQuery), `Bytes scanned priced at ${citation("scanPerTb")}. You pay for bytes read, not rows returned.`),
    line("Query spend per year", usd(p.scanCostAnnual), "Cost of one query times your stated query volume, over 365 days."),
    line("Query spend per year if uncompressed", usd(p.scanCostAnnualRaw), "The same queries against uncompressed data. The gap is the compute half of what compression buys."),
    line("Single-node compute per month", usd(p.singleNodeMonthly), `One ${rate("computeSingleNode").product} at ${citation("computeSingleNode")}, for the hours per day you stated.`),
    line("Workers a distributed cluster needs", num(p.workers, 0, "nodes"), `Year-three working set divided by ${WORKER_NODE_GIB} GiB per worker, with a floor of 2. One worker is not a distributed system.`),
    line("Distributed compute per month", usd(p.clusterMonthly), `${num(p.workers, 0, "")} workers at ${citation("computeWorkerNode")}. Per GiB of RAM this is the same price as the single node.`),
    line("Shuffle network per year", usd(p.shuffleAnnual), `Cross-zone transfer at ${citation("egressCrossAz")}, billed in both directions. This charge exists only on the distributed path.`),
    line("Annual total, single-node path", usd(singleAnnual), "Compute plus queries plus storage, one machine, no shuffle."),
    line("Annual total, distributed path", usd(clusterAnnual), "The same workload on a cluster, with the coordination cost the single node does not pay."),
  ];
}

/**
 * Build the Week 1 charts.
 *
 * @param {Record<string, number>} s
 * @param {Record<string, number>} p
 * @returns {import("./kit.js").Visual[]}
 */
function sizingVisuals(s, p) {
  const singleAnnual = p.singleNodeMonthly * 12 + p.scanCostAnnual + p.storageCompressedMonthly * 12;
  const clusterAnnual = p.clusterMonthly * 12 + p.scanCostAnnual + p.shuffleAnnual + p.storageCompressedMonthly * 12;
  return [
    gaugeChart(
      "Year-three working set against the single-node ceiling",
      "GiB",
      "Left of the marker, one machine still holds the workload in year three. Right of it, distribution stops being a choice.",
      point("Year-three working set", s.threeYearGib, num(s.threeYearGib, 1, "GiB")),
      { label: `${SINGLE_NODE_MAX_GIB} GiB single-node ceiling`, value: SINGLE_NODE_MAX_GIB }
    ),
    barChart(
      "Where the annual money actually goes",
      "USD per year",
      "Storage is almost always the smallest bar. Teams optimise it anyway because it is the easiest line to find on an invoice.",
      [
        point("Storage", p.storageCompressedMonthly * 12, usd(p.storageCompressedMonthly * 12)),
        point("Queries scanned", p.scanCostAnnual, usd(p.scanCostAnnual)),
        point("Single-node compute", p.singleNodeMonthly * 12, usd(p.singleNodeMonthly * 12)),
        point("Shuffle, distributed only", p.shuffleAnnual, usd(p.shuffleAnnual)),
      ]
    ),
    barChart(
      "One machine or a cluster, priced",
      "USD per year",
      "Renting RAM in a cluster costs the same per GiB as renting it in one box. What differs is the shuffle, which only the cluster pays.",
      [
        point("Single-node path", singleAnnual, usd(singleAnnual)),
        point("Distributed path", clusterAnnual, usd(clusterAnnual)),
      ]
    ),
    barChart(
      "What compression is worth per year",
      "USD per year",
      "Compression is billed twice over: fewer bytes stored every month, and fewer bytes scanned by every query.",
      [
        point("Storage saved", (p.storageRawMonthly - p.storageCompressedMonthly) * 12, usd((p.storageRawMonthly - p.storageCompressedMonthly) * 12)),
        point("Query spend saved", p.scanCostAnnualRaw - p.scanCostAnnual, usd(p.scanCostAnnualRaw - p.scanCostAnnual)),
      ]
    ),
  ];
}

/**
 * Week 1. Sizes a working set against single-node memory and prices both
 * architectures. Computes the arithmetic. Refuses to choose an architecture.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function computeSizing(input) {
  const rows = requirePositive(input.rows, "Row count");
  const bytesPerRow = requirePositive(input.bytesPerRow, "Bytes per row");
  const ratio = requireRange(input.compressionRatio, "Compression ratio", 1, 20);
  const scanFraction = requireRange(input.scanFraction, "Fraction of table scanned", 0.01, 1);
  const growth = requireRange(input.annualGrowthPct, "Annual growth percent", 0, 500);
  const concurrency = requirePositive(input.peakConcurrentQueries, "Peak concurrent queries");
  const queriesPerDay = requirePositive(input.queriesPerDay, "Queries per day");
  const computeHoursPerDay = requireRange(input.computeHoursPerDay, "Compute hours per day", 0.5, 24);

  const s = sizeWorkingSet({ rows, bytesPerRow, ratio, scanFraction, growth, concurrency });
  const p = priceWorkload({ ...s, queriesPerDay, computeHoursPerDay });

  return {
    computed: sizingLines(s, p, ratio),
    assumptions: [
      line("Rows", rows.toLocaleString("en-US"), "Largest table you must query, not the size of the whole estate."),
      line("Bytes per row", num(bytesPerRow, 0, "bytes"), "Uncompressed average across all columns."),
      line("Compression ratio", num(ratio, 1, "x"), "Your figure. Parquet with ZSTD typically lands between 3x and 10x depending on cardinality."),
      line("Fraction scanned per query", num(scanFraction, 2, ""), "0.1 means a typical query touches a tenth of the table after partition pruning."),
      line("Annual growth", num(growth, 0, "percent"), "Compounded over three years to reach the sizing figure."),
      line("Peak concurrent queries", num(concurrency, 0, ""), "Simultaneous queries at the busiest moment, not users and not daily volume."),
      line("Queries per day", queriesPerDay.toLocaleString("en-US"), "Drives the scan bill, which is usually the largest line."),
      line("Compute hours per day", num(computeHoursPerDay, 1, "hours"), "Hours the engine is actually running. Idle clusters bill at the same rate as busy ones."),
      line("Single-node ceiling assumed", num(SINGLE_NODE_MAX_GIB, 0, "GiB"), `Matches ${rate("computeSingleNode").product}.`),
      line("Storage price", citation("objectStorageStandard"), "List price, no negotiated discount applied."),
      line("Scan price", citation("scanPerTb"), "List price, no negotiated discount applied."),
      line("Compute price", citation("computeSingleNode"), "On-demand. Reserved and spot pricing would both be lower."),
    ],
    unresolved: [
      "Headroom is a ratio, not a decision. State whether you accept single-node compute and say what headroom figure you consider adequate.",
      `You entered a ${num(ratio, 1, "x")} compression ratio. That is an assumption, not a measurement. Justify it or replace it with a measured figure and say where you got it.`,
      "The distributed path here costs what it costs because of shuffle. State what your workload actually shuffles, and whether that estimate holds for your query shapes.",
      "Name the failure that would force you to distributed compute, and say how you would detect it before it happens.",
    ],
    warnings: sizingWarnings({ scanFraction, growth, headroom: s.headroom, ratio, p }),
    visuals: sizingVisuals(s, p),
  };
}

/**
 * Warnings for Week 1, kept separate so each condition is readable.
 *
 * @param {{ scanFraction: number, growth: number, headroom: number, ratio: number, p: Record<string, number> }} args
 * @returns {string[]}
 */
function sizingWarnings(args) {
  const warnings = [];
  if (args.scanFraction > 0.6) {
    warnings.push("A scan fraction above 0.6 usually means the access pattern, not the data size, is the problem. Partitioning is cheaper than a cluster.");
  }
  if (args.growth > 100) {
    warnings.push("Growth above 100 percent per year compounds hard. Check that this figure is defensible.");
  }
  if (args.ratio > 10) {
    warnings.push("A compression ratio above 10x is achievable but unusual. It implies very low cardinality data. Say what you measured.");
  }
  if (args.headroom < 1) {
    warnings.push("Year-three demand exceeds the single-node ceiling. On these assumptions the choice is made for you, so check the assumptions before you accept it.");
  }
  if (args.p.shuffleAnnual > args.p.scanCostAnnual) {
    warnings.push("Shuffle network costs more per year than the queries themselves on this workload. That is the signature of distributing something that did not need it.");
  }
  return warnings;
}

const FORMATS = ["Iceberg", "Delta Lake", "Hudi"];
const ENGINES_KNOWN = ["Spark", "Trino", "Flink", "DuckDB", "Snowflake", "Databricks", "BigQuery"];

/**
 * Week 2. Prices the exit from a table format choice.
 * Scores exposure and costs the migration. Does not rank the formats.
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
  const crossesCloud = requireChoice(input.crossesCloudBoundary, "Migration leaves the cloud", ["No", "Yes"]);

  const m = priceMigration(migrationPb, crossesCloud === "Yes");

  return {
    computed: lockInLines(format, engines, catalogVendor, migrationPb, m),
    assumptions: [
      line("Table format", format, "The specification governing commits, snapshots, and schema evolution over your Parquet files."),
      line("Primary engine", primary, "The engine that does most of the reading. Its vendor relationship to the catalog is where lock-in usually lives."),
      line("Engines requiring read access", num(engines, 0, ""), "Portability is only load-bearing when more than one engine must read the same table."),
      line("Catalog vendor relationship", catalogVendor, "Whether the catalog can be replaced without replacing the engine."),
      line("Data volume", num(migrationPb, 2, "PB"), "Total bytes that would have to be rewritten to leave."),
      line("Rewrite throughput assumed", "5 TB per hour", "A sustained rate for a well-provisioned rewrite job. Your measured rate may differ by an order of magnitude."),
      line("Rewrite compute price", citation("computeWorkerNode"), "Assumes 20 workers held for the duration of the rewrite."),
      line("Egress price", citation("egressInternet"), "Applied only when the migration leaves the cloud."),
    ],
    unresolved: [
      "The dollar figure above is the mechanical cost of leaving. State the organizational cost, which is larger and which I cannot compute.",
      "Name the lock-in you are accepting. Every choice here accepts one. Saying you avoided lock-in is not an answer.",
      "State what would have to change for this choice to become wrong, and roughly when you would expect to find out.",
    ],
    warnings: lockInWarnings(engines, crossesCloud === "Yes", m),
    visuals: [
      barChart(
        "What leaving costs, by component",
        "USD",
        "Engineering hours are the part teams estimate. Egress is the part that decides whether the migration happens at all.",
        [
          point("Rewrite compute", m.computeUsd, usd(m.computeUsd)),
          point("Egress out of the cloud", m.egressUsd, usd(m.egressUsd)),
        ]
      ),
    ],
  };
}

/**
 * Price a full-rewrite migration.
 *
 * @param {number} migrationPb
 * @param {boolean} leavesCloud
 * @returns {{ hours: number, computeUsd: number, egressUsd: number, totalUsd: number }}
 */
function priceMigration(migrationPb, leavesCloud) {
  const hours = (migrationPb * 1000) / 5;
  const computeUsd = hours * rate("computeWorkerNode").unitPriceUsd * 20;
  const egressUsd = leavesCloud ? migrationPb * 1000 * 1000 * rate("egressInternet").unitPriceUsd : 0;
  return { hours, computeUsd, egressUsd, totalUsd: computeUsd + egressUsd };
}

/**
 * Computed lines for Week 2.
 *
 * @param {string} format
 * @param {number} engines
 * @param {string} catalogVendor
 * @param {number} migrationPb
 * @param {{ hours: number, computeUsd: number, egressUsd: number, totalUsd: number }} m
 * @returns {import("./kit.js").Line[]}
 */
function lockInLines(format, engines, catalogVendor, migrationPb, m) {
  const engineExposure = engines === 1
    ? "Single engine. Format portability buys you nothing today."
    : `${engines} engines. Portability is load-bearing.`;
  const catalogExposure = catalogVendor === "Same as engine"
    ? "Catalog and engine share a vendor. The lock-in moved up a layer, out of the format."
    : "Catalog is independent of the engine. The exit cost sits in the catalog migration, not the data.";
  return [
    line("Format under evaluation", format, "The specification you are committing your file layout to."),
    line("Engine exposure", engineExposure, "Portability is a hedge. A hedge against nothing has a price and no payoff."),
    line("Catalog exposure", catalogExposure, "Open file formats move lock-in to the metadata layer rather than removing it."),
    line("Full-rewrite time at 5 TB/hr", num(m.hours, 0, "hours"), "Mechanical time to rewrite every byte. Assumes nothing goes wrong, which is not the historical record."),
    line("Full-rewrite time in days", num(m.hours / 24, 1, "days"), "The same figure in a unit an executive will actually hear."),
    line("Rewrite compute cost", usd(m.computeUsd), `20 workers at ${citation("computeWorkerNode")} held for the full rewrite.`),
    line("Egress cost to leave the cloud", usd(m.egressUsd), `${migrationPb} PB at ${citation("egressInternet")}. Zero when the migration stays inside one cloud.`),
    line("Mechanical cost of leaving", usd(m.totalUsd), "Compute plus egress. Excludes every hour of human time, which is the larger number."),
  ];
}

/**
 * Warnings for Week 2.
 *
 * @param {number} engines
 * @param {boolean} leavesCloud
 * @param {{ egressUsd: number }} m
 * @returns {string[]}
 */
function lockInWarnings(engines, leavesCloud, m) {
  const warnings = [];
  if (engines === 1) {
    warnings.push("With one engine, format portability is a hedge against a future you have not described. Describe it or drop the argument.");
  }
  if (leavesCloud && m.egressUsd > 0) {
    warnings.push(`Egress alone is ${usd(m.egressUsd)}. Any migration plan that omits this line is not a plan.`);
  }
  return warnings;
}

/**
 * Week 3. Surfaces catalog failure modes and prices the catalog itself.
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
  const partitionsPerTable = requirePositive(input.partitionsPerTable, "Partitions per table");
  const queriesPerDay = requirePositive(input.queriesPerDay, "Queries per day");

  const modes = failureModes(hosting, credentialMode, agentAccess);
  const c = priceCatalog(tables, partitionsPerTable, queriesPerDay, hosting === "Self-hosted");

  return {
    computed: catalogLines(modes, c, rto, tables),
    assumptions: catalogAssumptions({ hosting, credentialMode, agentAccess, rto, tables, partitionsPerTable, queriesPerDay }),
    unresolved: [
      "For each failure mode above, say how you would detect it and how long detection would take.",
      "Your stated RTO is a target. Say who is accountable when it is missed and what they are empowered to do.",
      "The catalog costs almost nothing and can take down every engine you run. State what you spend to protect something that cheap, and justify the figure.",
      "Name the failure mode you are choosing to accept without a control, and say why accepting it is defensible.",
    ],
    warnings: catalogWarnings(rto, c),
    visuals: [
      barChart(
        "What the catalog costs per month",
        "USD per month",
        "Compare these bars against your compute bill. The control plane is a rounding error that every query depends on.",
        [
          point("Object storage", c.objectUsd, money(c.objectUsd)),
          point("Requests", c.requestUsd, money(c.requestUsd)),
          point("Self-hosted nodes", c.selfHostUsd, money(c.selfHostUsd)),
        ]
      ),
    ],
  };
}

/**
 * Computed lines for Week 3.
 *
 * @param {string[]} modes
 * @param {Record<string, number>} c
 * @param {number} rto
 * @param {number} tables
 * @returns {import("./kit.js").Line[]}
 */
function catalogLines(modes, c, rto, tables) {
  return [
    line("Failure modes surfaced", num(modes.length, 0, ""), "Each one is a thing that can break. None of them is a thing you have decided about yet."),
    ...modes.map((m, i) => line(`Mode ${i + 1}`, m, "A failure you inherit with this posture, whether or not you have a control for it.")),
    line("Catalog objects", c.objects.toLocaleString("en-US"), "Tables plus partitions. Partition count, not table count, is what crosses the free tier."),
    line("Catalog storage per month", money(c.objectUsd), `Beyond 1,000,000 free objects at ${citation("catalogObjects")}.`),
    line("Catalog requests per month", Math.round(c.requests).toLocaleString("en-US"), "Assumes 4 metadata lookups per query. Planning hits the catalog several times before reading a byte."),
    line("Catalog requests per month, cost", money(c.requestUsd), `Beyond 1,000,000 free requests at ${citation("catalogRequests")}.`),
    line("Self-hosting compute per month", money(c.selfHostUsd), `Three ${rate("computeWorkerNode").product} nodes for quorum, at ${citation("computeWorkerNode")}. Zero when the vendor hosts it.`),
    line("Catalog cost per month", money(c.totalUsd), "Small in absolute terms. That is the point: the catalog is cheap and load-bearing at the same time."),
    line("Stated recovery time objective", num(rto, 0, "minutes"), "A target you are asserting, not a capability you have demonstrated."),
    line("Audit rows per year at hourly granularity", (tables * 365 * 24).toLocaleString("en-US"), "One access-log row per table per hour. Retention of this log is itself a storage decision."),
  ];
}

/**
 * Echoed assumptions for Week 3.
 *
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Line[]}
 */
function catalogAssumptions(a) {
  return [
    line("Hosting", String(a.hosting), "Who runs the process, and therefore who owns the outage."),
    line("Credential handling", String(a.credentialMode), "Whether authorization is enforced in one place or two."),
    line("Agent access", String(a.agentAccess), "Whether non-human identities query without a person present."),
    line("Recovery time objective", num(Number(a.rto), 0, "minutes"), "How long you have agreed the catalog may stay down."),
    line("Tables under management", num(Number(a.tables), 0, ""), ""),
    line("Partitions per table", num(Number(a.partitionsPerTable), 0, ""), "Three years of daily partitions is about 1,095 per table."),
    line("Queries per day", Number(a.queriesPerDay).toLocaleString("en-US"), "Drives catalog request volume, which scales with query count and not with data size."),
    line("Catalog object price", citation("catalogObjects"), ""),
    line("Catalog request price", citation("catalogRequests"), ""),
  ];
}

/**
 * Enumerate the failure modes a catalog posture inherits.
 *
 * @param {string} hosting
 * @param {string} credentialMode
 * @param {string} agentAccess
 * @returns {string[]}
 */
function failureModes(hosting, credentialMode, agentAccess) {
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
  return modes;
}

/**
 * Price a catalog at the stated scale.
 *
 * @param {number} tables
 * @param {number} partitionsPerTable
 * @param {number} queriesPerDay
 * @param {boolean} selfHosted
 * @returns {Record<string, number>}
 */
function priceCatalog(tables, partitionsPerTable, queriesPerDay, selfHosted) {
  const objects = tables * (1 + partitionsPerTable);
  const requests = queriesPerDay * 4 * DAYS_PER_MONTH;
  const objectUsd = (Math.max(0, objects - 1000000) / 100000) * rate("catalogObjects").unitPriceUsd;
  const requestUsd = (Math.max(0, requests - 1000000) / 1000000) * rate("catalogRequests").unitPriceUsd;
  const selfHostUsd = selfHosted ? rate("computeWorkerNode").unitPriceUsd * 3 * HOURS_PER_MONTH : 0;
  return { objects, requests, objectUsd, requestUsd, selfHostUsd, totalUsd: objectUsd + requestUsd + selfHostUsd };
}

/**
 * Warnings for Week 3.
 *
 * @param {number} rto
 * @param {Record<string, number>} c
 * @returns {string[]}
 */
function catalogWarnings(rto, c) {
  const warnings = [];
  if (rto < 15) {
    warnings.push("An RTO under 15 minutes usually implies staffing or automation you have not costed. Check Week 7.");
  }
  if (c.objects > 1000000) {
    warnings.push(`${c.objects.toLocaleString("en-US")} catalog objects is past the free tier. Partition count is doing that, not table count.`);
  }
  return warnings;
}

const UNIT_LABELS = ["per credit", "per TB scanned", "per DBU", "per node hour"];

/**
 * Week 4. Fits an engine cost estimate against a fixed budget ceiling, with
 * storage counted, because a compute-only budget is not a platform budget.
 *
 * @param {Record<string, unknown>} input
 * @param {Date} now
 * @returns {import("./kit.js").ToolResult}
 */
export function fitEngineToBudget(input, now) {
  const budget = requirePositive(input.annualBudgetUsd, "Annual budget ceiling");
  const unitPrice = requirePositive(input.unitPriceUsd, "Published unit price");
  const unitLabel = requireChoice(input.unitLabel, "Price unit", UNIT_LABELS);
  const unitsPerMonth = requirePositive(input.unitsPerMonth, "Expected units per month");
  const retrievedAt = requireRetrievalDate(input.priceRetrievedAt, "Price retrieval date", now);
  const commitDiscount = requireRange(input.commitDiscountPct, "Committed-use discount percent", 0, 60);
  const storageTb = requirePositive(input.storageTb, "Storage under management in TB");

  const b = priceBudgetFit({ budget, unitPrice, unitsPerMonth, commitDiscount, storageTb });

  return {
    computed: budgetLines(b, unitLabel, commitDiscount),
    assumptions: [
      line("Annual budget ceiling", usd(budget), "The Final Artifact constraint. Breaching it fails the rubric, not just the spreadsheet."),
      line("Published unit price", `${money(unitPrice)} ${unitLabel}`, "From the vendor pricing page, not from memory."),
      line("Price retrieved on", retrievedAt, "The syllabus requires a dated price. An undated price is not evidence."),
      line("Expected units per month", unitsPerMonth.toLocaleString("en-US"), "A forecast you supplied, and the single largest source of error in this model."),
      line("Committed-use discount", num(commitDiscount, 0, "percent"), "A multi-year obligation traded for a lower rate."),
      line("Storage under management", num(storageTb, 1, "TB"), "Compute budgets that omit storage understate the platform bill."),
      line("Storage price", citation("objectStorageStandard"), "List price, no negotiated discount applied."),
    ],
    unresolved: [
      "Units per month is a forecast you supplied. State how you derived it and what happens to the model if it is 50 percent high.",
      "Name the capability you gave up to stay inside the ceiling. Every budget-constrained choice sacrifices something.",
      "A committed-use discount is a multi-year obligation. State what you owe if the workload moves off this engine in year two.",
      "Storage is the smaller line here and grows every month regardless of query volume. State when it stops being small.",
    ],
    warnings: budgetWarnings(b),
    visuals: [
      gaugeChart(
        "Annual spend against the ceiling",
        "USD per year",
        "Everything left of the marker fits inside the budget. Everything right of it is a rubric failure, not a rounding issue.",
        point("Committed spend", b.totalAnnual, usd(b.totalAnnual)),
        { label: "Annual budget ceiling", value: budget }
      ),
      stackChart(
        "How the ceiling is consumed",
        "USD per year",
        "Compute after discount, storage, and whatever is left. The remainder is your entire margin for being wrong.",
        [
          point("Compute after discount", b.discountedAnnual, usd(b.discountedAnnual), "Committed"),
          point("Storage", b.storageAnnual, usd(b.storageAnnual), "Committed"),
          point("Unallocated", Math.max(0, b.remaining), usd(Math.max(0, b.remaining)), "Free"),
        ]
      ),
    ],
  };
}

/**
 * Price a Week 4 budget fit.
 *
 * @param {{ budget: number, unitPrice: number, unitsPerMonth: number, commitDiscount: number, storageTb: number }} a
 * @returns {Record<string, number>}
 */
function priceBudgetFit(a) {
  const listAnnual = a.unitPrice * a.unitsPerMonth * 12;
  const discountedAnnual = listAnnual * (1 - a.commitDiscount / 100);
  const storageAnnual = a.storageTb * 1000 * rate("objectStorageStandard").unitPriceUsd * 12;
  const totalAnnual = discountedAnnual + storageAnnual;
  return {
    listAnnual,
    discountedAnnual,
    storageAnnual,
    totalAnnual,
    remaining: a.budget - totalAnnual,
    utilisation: (totalAnnual / a.budget) * 100,
    breakEvenUnits: ((a.budget - storageAnnual) / (1 - a.commitDiscount / 100) / a.unitPrice) / 12,
  };
}

/**
 * Computed lines for Week 4.
 *
 * @param {Record<string, number>} b
 * @param {string} unitLabel
 * @param {number} commitDiscount
 * @returns {import("./kit.js").Line[]}
 */
function budgetLines(b, unitLabel, commitDiscount) {
  return [
    line("Compute at list price", usd(b.listAnnual), "Unit price times units times twelve. Nobody is quoted a discount before they ask."),
    line(`Compute after ${num(commitDiscount, 0, "percent")} commit discount`, usd(b.discountedAnnual), "What you pay if the forecast holds. If it does not, you still owe the commitment."),
    line("Storage per year", usd(b.storageAnnual), `Object storage at ${citation("objectStorageStandard")}, which grows whether or not anyone runs a query.`),
    line("Platform total per year", usd(b.totalAnnual), "Compute plus storage. This, not the compute line, is what the ceiling has to cover."),
    line("Budget remaining", usd(b.remaining), "Your entire margin for a forecast error, a price rise, or a new workload."),
    line("Ceiling utilisation", num(b.utilisation, 1, "percent"), "Above 85 percent there is no room inside the budget year to absorb anything."),
    line("Units per month that exhaust the ceiling", num(b.breakEvenUnits, 0, unitLabel.replace("per ", "")), "The volume at which compute plus storage exactly equals the ceiling."),
  ];
}

/**
 * Warnings for Week 4.
 *
 * @param {Record<string, number>} b
 * @returns {string[]}
 */
function budgetWarnings(b) {
  const warnings = [];
  if (b.remaining < 0) {
    warnings.push("This configuration exceeds the ceiling. The artifact fails on constraint 1 unless you change the configuration or the assumptions.");
  }
  if (b.utilisation > 85 && b.remaining >= 0) {
    warnings.push("Above 85 percent of the ceiling leaves no room for growth or error inside the budget year.");
  }
  return warnings;
}

export { SINGLE_NODE_MAX_GIB, WORKER_NODE_GIB };
