import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InputError, requireFinite, requirePositive, requireRetrievalDate } from "../server/tools/kit.js";
import { TOOLS, catalogSummary, findTool } from "../server/tools/catalog.js";
import { computeSizing, fitEngineToBudget, scoreLockIn, surfaceFailureModes } from "../server/tools/platform.js";
import { annualControlCost, breakEven, simulateCut } from "../server/tools/economics.js";
import {
  buildScopeMatrix,
  costPrivacyPaths,
  draftRetentionPolicy,
  exposureTimeline,
  weighOperatingModel,
} from "../server/tools/governance.js";
import { buildAssumptionLog } from "../server/assumption-log.js";

const NOW = new Date("2026-08-14T00:00:00Z");

/** Valid input for every tool, keyed by slug. Drives the invariant sweep. */
const VALID = {
  sizing: { rows: 2000000000, bytesPerRow: 240, scanFraction: 0.1, annualGrowthPct: 30, peakConcurrentQueries: 8 },
  "lock-in": { format: "Iceberg", primaryEngine: "Trino", engineCount: 3, catalogVendor: "Independent", dataVolumePb: 1.5 },
  "catalog-failure": {
    hosting: "Managed by vendor",
    credentialMode: "Vended by catalog",
    agentAccess: "Permitted",
    rtoMinutes: 60,
    tableCount: 900,
  },
  "engine-budget": {
    annualBudgetUsd: 600000,
    unitPriceUsd: 3,
    unitLabel: "per credit",
    priceRetrievedAt: "2026-08-01",
    unitsPerMonth: 12000,
    commitDiscountPct: 20,
  },
  "finops-cut": {
    targetReductionPct: 20,
    spendStorage: 300000,
    spendCompute: 900000,
    spendIngestion: 200000,
    spendObservability: 150000,
    spendLicences: 250000,
    cutStorage: 10,
    cutCompute: 25,
    cutIngestion: 15,
    cutObservability: 5,
    cutLicences: 30,
  },
  "build-vs-buy": {
    vendorMonthlyUsd: 9000,
    priceRetrievedAt: "2026-08-01",
    buildHours: 900,
    blendedHourlyUsd: 140,
    maintenanceHoursMonthly: 30,
    horizonMonths: 36,
  },
  "control-cost": {
    controlName: "Freshness SLA monitor on the orders table",
    toolingAnnualUsd: 48000,
    setupHours: 120,
    opsHoursMonthly: 8,
    blendedHourlyUsd: 140,
    incidentCostUsd: 400000,
    incidentsPerYear: 1.5,
    catchRatePct: 60,
  },
  "governance-model": {
    weightSpeedofchange: 8,
    centralSpeedofchange: 4,
    federatedSpeedofchange: 8,
    weightConsistencyofdefinitions: 9,
    centralConsistencyofdefinitions: 9,
    federatedConsistencyofdefinitions: 4,
    weightDomainexpertise: 7,
    centralDomainexpertise: 3,
    federatedDomainexpertise: 9,
    weightAuditburden: 6,
    centralAuditburden: 8,
    federatedAuditburden: 4,
    weightStaffingreality: 9,
    centralStaffingreality: 7,
    federatedStaffingreality: 3,
  },
  "privacy-paths": {
    stateCount: 19,
    strictestState: "California",
    nationalBuildUsd: 750000,
    nationalAnnualUsd: 200000,
    perStateBuildUsd: 60000,
    perStateAnnualUsd: 25000,
    horizonYears: 3,
  },
  "ai-act": { role: "Deployer", annexIiiUseCase: "Yes", usesGpai: "Yes", generatesSyntheticContent: "Yes" },
  "rag-retention": {
    documentCount: 400000,
    percentPersonalData: 35,
    retentionMonths: 24,
    reindexIntervalDays: 30,
    evalSetSize: 800,
    deletionSlaDays: 45,
  },
  "agent-access": {
    authMethod: "Static API key",
    credentialLifetimeMinutes: 60,
    humanInLoop: "Not required",
    grantReadpublictables: "Granted",
    grantReadinternaltables: "Granted",
    grantReadtablescontainingpersonaldata: "Granted",
    grantWritetostaging: "Granted",
    grantWritetoproduction: "Granted",
  },
};

describe("input guards", () => {
  it("rejects null rather than silently coercing it to zero", () => {
    assert.throws(() => requireFinite(null, "Rows"), InputError);
    assert.throws(() => requireFinite("", "Rows"), InputError);
  });

  it("rejects non-numeric and non-positive values", () => {
    assert.throws(() => requireFinite("abc", "Rows"), InputError);
    assert.throws(() => requirePositive(0, "Rows"), InputError);
    assert.throws(() => requirePositive(-5, "Rows"), InputError);
  });

  it("accepts a valid finite number including zero where allowed", () => {
    assert.equal(requireFinite(0, "Growth"), 0);
    assert.equal(requireFinite("42.5", "Growth"), 42.5);
  });

  it("rejects malformed and future retrieval dates", () => {
    assert.throws(() => requireRetrievalDate("08/01/2026", "Price date", NOW), InputError);
    assert.throws(() => requireRetrievalDate("2026-13-01", "Price date", NOW), InputError);
    assert.throws(() => requireRetrievalDate("2027-01-01", "Price date", NOW), InputError);
    assert.equal(requireRetrievalDate("2026-08-01", "Price date", NOW), "2026-08-01");
  });
});

describe("catalog", () => {
  it("covers weeks 1 through 12 exactly once", () => {
    const weeks = TOOLS.map((tool) => tool.week).sort((a, b) => a - b);
    assert.deepEqual(weeks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("has a valid input fixture for every registered tool", () => {
    const missing = TOOLS.filter((tool) => VALID[tool.slug] === undefined).map((tool) => tool.slug);
    assert.deepEqual(missing, []);
  });

  it("omits the run function from the client summary", () => {
    const first = catalogSummary()[0];
    assert.ok(first !== undefined);
    assert.equal("run" in first, false);
  });

  it("resolves known slugs and rejects unknown ones", () => {
    assert.ok(findTool("sizing") !== undefined);
    assert.equal(findTool("not-a-tool"), undefined);
  });

  it("declares a field for every key its fixture supplies", () => {
    for (const tool of TOOLS) {
      const declared = new Set(tool.fields.map((field) => field.key));
      const undeclared = Object.keys(VALID[tool.slug]).filter((key) => !declared.has(key));
      assert.deepEqual(undeclared, [], `${tool.slug} has undeclared fields`);
    }
  });
});

describe("the no-recommendation invariant", () => {
  it("returns unresolved judgments for every tool", () => {
    for (const tool of TOOLS) {
      const result = tool.run(VALID[tool.slug], NOW);
      assert.ok(result.unresolved.length >= 2, `${tool.slug} surfaced too few unresolved judgments`);
      assert.ok(result.computed.length > 0, `${tool.slug} computed nothing`);
      assert.ok(Array.isArray(result.warnings), `${tool.slug} omitted warnings`);
    }
  });

  it("never emits recommendation language in computed output", () => {
    const banned = /\b(you should|we recommend|recommended|best choice|the right answer|optimal choice)\b/i;
    for (const tool of TOOLS) {
      const result = tool.run(VALID[tool.slug], NOW);
      const text = result.computed.map((entry) => `${entry.label} ${entry.value}`).join(" ");
      assert.equal(banned.test(text), false, `${tool.slug} leaked recommendation language`);
    }
  });

  it("is pure, returning equal output for equal input", () => {
    for (const tool of TOOLS) {
      const first = tool.run({ ...VALID[tool.slug] }, NOW);
      const second = tool.run({ ...VALID[tool.slug] }, NOW);
      assert.deepEqual(first, second, `${tool.slug} is not deterministic`);
    }
  });

  it("does not mutate the input object", () => {
    for (const tool of TOOLS) {
      const input = { ...VALID[tool.slug] };
      const snapshot = JSON.stringify(input);
      tool.run(input, NOW);
      assert.equal(JSON.stringify(input), snapshot, `${tool.slug} mutated its input`);
    }
  });
});

describe("week 1 sizing", () => {
  it("computes raw size the long way round", () => {
    const result = computeSizing(VALID.sizing);
    const raw = result.computed.find((entry) => entry.label === "Raw uncompressed size");
    assert.ok(raw !== undefined);
    assert.equal(raw.value, "447.0 GiB");
  });

  it("warns when the scan fraction indicates an access pattern problem", () => {
    const result = computeSizing({ ...VALID.sizing, scanFraction: 0.9 });
    assert.ok(result.warnings.some((w) => w.includes("access pattern")));
  });

  it("rejects a zero row count instead of dividing by it", () => {
    assert.throws(() => computeSizing({ ...VALID.sizing, rows: 0 }), InputError);
  });
});

describe("week 4 budget fit", () => {
  it("flags a configuration that breaches the ceiling", () => {
    const result = fitEngineToBudget({ ...VALID["engine-budget"], unitsPerMonth: 40000 }, NOW);
    assert.ok(result.warnings.some((w) => w.includes("exceeds the ceiling")));
  });

  it("requires a price retrieval date", () => {
    const input = { ...VALID["engine-budget"] };
    delete input.priceRetrievedAt;
    assert.throws(() => fitEngineToBudget(input, NOW), InputError);
  });

  it("applies the commit discount to the list figure", () => {
    const result = fitEngineToBudget(VALID["engine-budget"], NOW);
    const list = result.computed.find((entry) => entry.label === "List cost per year");
    assert.ok(list !== undefined);
    assert.equal(list.value, "$432,000");
  });
});

describe("weeks 2, 3, 5, 6, 7", () => {
  it("warns that a single engine makes portability a hedge", () => {
    const result = scoreLockIn({ ...VALID["lock-in"], engineCount: 1 });
    assert.ok(result.warnings.length > 0);
  });

  it("surfaces an agent failure mode only when agent access is permitted", () => {
    const countModes = (r) => r.computed.filter((entry) => entry.label.startsWith("Mode ")).length;
    const on = surfaceFailureModes(VALID["catalog-failure"]);
    const off = surfaceFailureModes({ ...VALID["catalog-failure"], agentAccess: "Not permitted" });
    assert.equal(countModes(on) - countModes(off), 1);
  });

  it("reports the shortfall when a cut plan misses target", () => {
    const result = simulateCut({ ...VALID["finops-cut"], cutCompute: 1 });
    assert.ok(result.warnings.some((w) => w.includes("short of the")));
  });

  it("reports never when maintenance costs as much as the vendor", () => {
    const result = breakEven({ ...VALID["build-vs-buy"], maintenanceHoursMonthly: 100 }, NOW);
    const entry = result.computed.find((item) => item.label === "Break-even");
    assert.ok(entry !== undefined);
    assert.equal(entry.value, "Never");
  });

  it("challenges an implausibly high catch rate", () => {
    const result = annualControlCost({ ...VALID["control-cost"], catchRatePct: 95 });
    assert.ok(result.warnings.some((w) => w.includes("strong claim")));
  });
});

describe("weeks 8 through 12", () => {
  it("flags a governance margin too thin to be evidence", () => {
    const flat = Object.fromEntries(Object.keys(VALID["governance-model"]).map((key) => [key, 5]));
    const result = weighOperatingModel(flat);
    assert.ok(result.warnings.some((w) => w.includes("half a point")));
  });

  it("handles all-zero weights without dividing by zero", () => {
    const zeroed = Object.fromEntries(Object.keys(VALID["governance-model"]).map((key) => [key, 0]));
    const result = weighOperatingModel(zeroed);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.computed.length > 0);
  });

  it("names the cheaper privacy path without calling it correct", () => {
    const result = costPrivacyPaths(VALID["privacy-paths"]);
    assert.ok(result.computed.some((entry) => entry.label === "Cheaper on this model"));
    assert.ok(result.unresolved.some((q) => q.includes("Cheaper is not the same as correct")));
  });

  it("dates AI Act milestones relative to the supplied date, not the clock", () => {
    const pick = (r) => r.computed.find((entry) => entry.label === "2026-08-02");
    const early = exposureTimeline(VALID["ai-act"], new Date("2026-01-01T00:00:00Z"));
    const late = exposureTimeline(VALID["ai-act"], new Date("2027-01-01T00:00:00Z"));
    assert.ok(pick(early)?.value.includes("days away"));
    assert.ok(pick(late)?.value.includes("in force"));
  });

  it("catches a deletion SLA longer than the reindex interval", () => {
    const result = draftRetentionPolicy(VALID["rag-retention"]);
    assert.ok(result.warnings.some((w) => w.includes("stay retrievable")));
  });

  it("reports an unbounded exposure window for a static key", () => {
    const result = buildScopeMatrix(VALID["agent-access"]);
    const entry = result.computed.find((item) => item.label === "Credential exposure window");
    assert.ok(entry !== undefined);
    assert.equal(entry.value, "Unbounded");
    assert.ok(result.warnings.length >= 3);
  });
});

describe("export gate", () => {
  const meta = { courseCode: "MBA 8660", week: 1, toolTitle: "Working Set Sizing", decision: "Test decision." };
  const result = computeSizing(VALID.sizing);
  const good = result.unresolved.map(() => "This answer is long enough to count as an actual written judgment.");

  it("blocks export when an answer is missing", () => {
    assert.throws(() => buildAssumptionLog(meta, result, [], NOW), InputError);
  });

  it("blocks export when an answer is too short to be a judgment", () => {
    const short = [...good];
    short[0] = "Yes.";
    assert.throws(() => buildAssumptionLog(meta, result, short, NOW), InputError);
  });

  it("pairs every question with its answer when all are written", () => {
    const log = buildAssumptionLog(meta, result, good, NOW);
    assert.equal(log.unresolved.length, result.unresolved.length);
    assert.equal(log.unresolved[0]?.question, result.unresolved[0]);
    assert.equal(log.generatedAt, NOW.toISOString());
  });
});
