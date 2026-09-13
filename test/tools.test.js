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
import {
  assembleFinalArtifact,
  consolidateArchitecture,
  consolidateCostModel,
  consolidateGovernance,
} from "../server/tools/modules.js";
import { buildAssumptionLog } from "../server/assumption-log.js";
import { TERMS, allTerms, resolveTerms } from "../server/glossary.js";
import { RATES, allRates, citation, rate } from "../server/reference/rates.js";

const NOW = new Date("2026-08-14T00:00:00Z");

/** Valid input for every tool, keyed by slug. Drives the invariant sweep. */
const VALID = {
  sizing: {
    rows: 2000000000, bytesPerRow: 240, compressionRatio: 4, scanFraction: 0.1,
    annualGrowthPct: 30, peakConcurrentQueries: 8, queriesPerDay: 500, computeHoursPerDay: 10,
  },
  "lock-in": { format: "Iceberg", primaryEngine: "Trino", engineCount: 3, catalogVendor: "Independent", dataVolumePb: 1.5, crossesCloudBoundary: "No" },
  "catalog-failure": {
    hosting: "Managed by vendor",
    credentialMode: "Vended by catalog",
    agentAccess: "Permitted",
    rtoMinutes: 60,
    tableCount: 900,
    partitionsPerTable: 1095,
    queriesPerDay: 20000,
  },
  "engine-budget": {
    annualBudgetUsd: 600000,
    unitPriceUsd: 3,
    unitLabel: "per credit",
    priceRetrievedAt: "2026-08-01",
    unitsPerMonth: 12000,
    commitDiscountPct: 20,
    storageTb: 400,
  },
  "finops-cut": {
    targetReductionPct: 20,
    queriesPerYear: 4000000,
    activeUsers: 850,
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
    buildInfraMonthlyUsd: 1200,
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
    detectionHoursBefore: 18,
    detectionHoursAfter: 1,
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
    centralFteCount: 8,
    federatedFtePerDomain: 2,
    domainCount: 6,
    fullyLoadedFteUsd: 190000,
  },
  "privacy-paths": {
    stateCount: 19,
    strictestState: "California",
    nationalBuildUsd: 750000,
    nationalAnnualUsd: 200000,
    perStateBuildUsd: 60000,
    perStateAnnualUsd: 25000,
    horizonYears: 3,
    deletionRequestsPerYear: 4200,
    hoursPerDeletionRequest: 1.5,
  },
  "ai-act": {
    role: "Deployer", annexIiiUseCase: "Yes", usesGpai: "Yes", generatesSyntheticContent: "Yes",
    readinessHours: 900, blendedHourlyUsd: 140,
  },
  "rag-retention": {
    documentCount: 400000,
    tokensPerDocument: 1200,
    chunkTokens: 500,
    chunksPerAnswer: 8,
    questionsPerDay: 2000,
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
    agentQueriesPerDay: 5000,
    gibScannedPerQuery: 0.8,
    grantReadpublictables: "Granted",
    grantReadinternaltables: "Granted",
    grantReadtablescontainingpersonaldata: "Granted",
    grantWritetostaging: "Granted",
    grantWritetoproduction: "Granted",
  },
  "module-1-architecture": {
    caseOrganization: "Meridian Health Partners",
    architecturePath: "Distributed", tableFormat: "Iceberg",
    catalogChoice: "Managed Iceberg REST catalog", engineChoice: "Snowflake Standard",
    workingSetYearThreeGib: 616.5, singleNodeCeilingGib: 512, exitCostUsd: 1411,
    catalogAnnualUsd: 17000, engineAnnualUsd: 172800, storageAnnualUsd: 96600,
    annualBudgetUsd: 850000, annualGrowthPct: 22, queriesPerYear: 328500, horizonYears: 3,
  },
  "module-2-cost-model": {
    controlName: "Freshness SLA monitor on the claims table",
    ingestionPath: "Buy",
    platformAnnualUsd: 662600, annualSavingUsd: 128160, targetReductionPct: 20,
    ingestionChosenAnnualUsd: 108000, ingestionCountedAnnualUsd: 120000, breakEvenMonths: 35,
    controlAnnualUsd: 61440, exposureAvoidedUsd: 360000,
    annualBudgetUsd: 850000, queriesPerYear: 328500, annualGrowthPct: 22, horizonYears: 3,
  },
  "module-3-governance": {
    operatingModel: "Centralized", privacyPath: "State by state", aiActRole: "Deployer",
    agentAuthMethod: "Short-lived vended credential", agentPersonalDataGrant: "Denied",
    staffingAnnualUsd: 1140000, privacyBuildUsd: 440000, privacyAnnualUsd: 192000,
    aiActReadinessUsd: 360000, daysToAnnexIii: 445,
    ragAnnualUsd: 2746, deletionSlaDays: 45, reindexIntervalDays: 30,
    agentAnnualUsd: 1470, operationsAnnualUsd: 583880, horizonYears: 3,
  },
  "final-project": {
    caseOrganization: "Meridian Health Partners",
    platformAnnualUsd: 534440, ingestionAnnualUsd: 108000, controlAnnualUsd: 61440,
    governanceAnnualUsd: 1336216, oneTimeInvestmentUsd: 800000,
    annualBudgetUsd: 2900000, annualGrowthPct: 22, queriesPerYear: 328500, horizonYears: 3,
    rejectedArchitecture: "Single-node DuckDB on one 512 GiB machine with Parquet on object storage",
    rejectionReason: "the year-three working set of 616 GiB exceeds the largest single node we are willing to rent",
    mostLikelyWrong: "The 60 percent catch rate on the freshness monitor, which is my estimate rather than a measurement.",
    disconfirmingEvidence: "Two consecutive quarters in which the monitor catches under 40 percent of logged freshness incidents.",
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
    const weeks = TOOLS.filter((tool) => tool.kind === "week").map((tool) => tool.week).sort((a, b) => a - b);
    assert.deepEqual(weeks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("carries the three module deliverables and the final artifact, in order, after the weeks", () => {
    const deliverables = TOOLS.filter((tool) => tool.kind !== "week");
    assert.deepEqual(
      deliverables.map((tool) => tool.label),
      ["Module 1", "Module 2", "Module 3", "Final Project"]
    );
    assert.deepEqual(deliverables.map((tool) => tool.kind), ["module", "module", "module", "final"]);
    assert.deepEqual(
      deliverables.map((tool) => tool.covers),
      [[1, 2, 3, 4], [5, 6, 7], [8, 9, 10, 11, 12], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]
    );
  });

  it("gives every tool a distinct slug, ordinal, and picker label", () => {
    for (const key of ["slug", "week", "label"]) {
      const values = TOOLS.map((tool) => tool[key]);
      assert.equal(new Set(values).size, values.length, `Two tools share a ${key}.`);
    }
  });

  it("consolidates every week into exactly one module deliverable", () => {
    const covered = TOOLS.filter((tool) => tool.kind === "module").flatMap((tool) => tool.covers);
    assert.deepEqual(covered.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
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
    const list = result.computed.find((entry) => entry.label === "Compute at list price");
    assert.ok(list !== undefined);
    assert.equal(list.value, "$432,000");
  });

  it("counts storage alongside compute, so the ceiling is tested against the platform total", () => {
    const result = fitEngineToBudget(VALID["engine-budget"], NOW);
    const storage = result.computed.find((entry) => entry.label === "Storage per year");
    const total = result.computed.find((entry) => entry.label === "Platform total per year");
    // 400 TB is 400,000 GB at $0.023 per GB-month across 12 months.
    assert.equal(storage?.value, "$110,400");
    assert.equal(total?.value, "$456,000");
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

  it("reports never when maintenance and infrastructure cost as much as the vendor", () => {
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
    const flat = { ...VALID["governance-model"] };
    for (const key of Object.keys(flat)) {
      if (key.startsWith("weight") || key.startsWith("central") || key.startsWith("federated")) {
        flat[key] = 5;
      }
    }
    flat.centralFteCount = 8;
    const result = weighOperatingModel(flat);
    assert.ok(result.warnings.some((w) => w.includes("half a point")));
  });

  it("handles all-zero weights without dividing by zero", () => {
    const zeroed = { ...VALID["governance-model"] };
    for (const key of Object.keys(zeroed)) {
      if (key.startsWith("weight")) {
        zeroed[key] = 0;
      }
    }
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

describe("the teaching invariants", () => {
  it("gives every tool a plain-language explainer", () => {
    for (const tool of TOOLS) {
      assert.ok(tool.explainer.length > 200, `${tool.slug} has no substantive explainer`);
    }
  });

  it("resolves every glossary key a tool references", () => {
    for (const tool of TOOLS) {
      assert.doesNotThrow(() => resolveTerms(tool.terms), `${tool.slug} references an undefined term`);
      assert.ok(tool.terms.length >= 3, `${tool.slug} defines too few terms`);
    }
  });

  it("gives every field a help string, so no input is unexplained", () => {
    for (const tool of TOOLS) {
      const bare = tool.fields.filter((field) => (field.help ?? "").trim() === "").map((field) => field.key);
      assert.deepEqual(bare, [], `${tool.slug} has fields with no help text`);
    }
  });

  it("gives every numeric field the bounds a slider needs", () => {
    for (const tool of TOOLS) {
      const unbounded = tool.fields
        .filter((f) => f.type === "number" && (typeof f.min !== "number" || typeof f.max !== "number"))
        .map((f) => f.key);
      assert.deepEqual(unbounded, [], `${tool.slug} has numeric fields the client cannot render as a slider`);
      for (const field of tool.fields) {
        if (field.type === "number") {
          assert.ok(field.max > field.min, `${tool.slug}.${field.key} has an inverted range`);
        }
      }
    }
  });

  it("keeps every preset value inside the bounds its field declares", () => {
    /** Flatten every (tool, preset, numeric field, value) tuple in the catalog. */
    const numericPresetValues = TOOLS.flatMap((tool) => {
      const byKey = new Map(tool.fields.map((f) => [f.key, f]));
      return tool.presets.flatMap((p) =>
        Object.entries(p.values)
          .map(([key, value]) => ({ label: `${tool.slug}/${p.name}/${key}`, field: byKey.get(key), value }))
          .filter((row) => row.field !== undefined && row.field.type === "number")
      );
    });

    assert.ok(numericPresetValues.length > 0, "no preset values were checked");
    for (const row of numericPresetValues) {
      assert.ok(Number(row.value) >= row.field.min, `${row.label} is below its declared minimum`);
      assert.ok(Number(row.value) <= row.field.max, `${row.label} is above its declared maximum`);
    }
  });

  it("offers presets that fill every field the tool declares", () => {
    for (const tool of TOOLS) {
      // A weekly tool offers several presets so a student can watch a figure
      // move between contrasting cases. A deliverable offers exactly one, the
      // case organization assigned in Week 1, because the whole point of a
      // consolidation is that it carries one organization's figures forward.
      const floor = tool.kind === "week" ? 2 : 1;
      assert.ok(tool.presets.length >= floor, `${tool.slug} offers too few presets`);
      const declared = tool.fields.map((field) => field.key);
      for (const preset of tool.presets) {
        const missing = declared.filter((key) => preset.values[key] === undefined);
        assert.deepEqual(missing, [], `${tool.slug} preset "${preset.name}" leaves fields empty`);
      }
    }
  });

  it("runs every preset to a valid result, so no preset ships broken", () => {
    // Presets carry the published-rate snapshot date, so they are evaluated
    // from a date after that snapshot, the way a student would meet them.
    const afterSnapshot = new Date("2026-09-01T00:00:00Z");
    for (const tool of TOOLS) {
      for (const preset of tool.presets) {
        const result = tool.run({ ...preset.values }, afterSnapshot);
        assert.ok(result.computed.length > 0, `${tool.slug}/${preset.name} computed nothing`);
        assert.ok(result.unresolved.length >= 2, `${tool.slug}/${preset.name} surfaced too few judgments`);
      }
    }
  });

  it("explains every computed figure with a note", () => {
    for (const tool of TOOLS) {
      const result = tool.run(VALID[tool.slug], NOW);
      const bare = result.computed.filter((entry) => (entry.note ?? "").trim() === "").map((entry) => entry.label);
      assert.deepEqual(bare, [], `${tool.slug} emitted unexplained figures`);
    }
  });

  it("emits at least one figure per tool, each with points and a caption", () => {
    for (const tool of TOOLS) {
      const result = tool.run(VALID[tool.slug], NOW);
      assert.ok(Array.isArray(result.visuals), `${tool.slug} omitted visuals`);
      assert.ok(result.visuals.length >= 1, `${tool.slug} produced no figure`);
      for (const visual of result.visuals) {
        assert.ok(visual.points.length > 0, `${tool.slug} figure "${visual.title}" has no points`);
        assert.ok(visual.caption.length > 20, `${tool.slug} figure "${visual.title}" has no caption`);
        for (const p of visual.points) {
          assert.ok(Number.isFinite(p.value), `${tool.slug} figure "${visual.title}" has a non-finite value`);
          assert.ok(p.display !== "", `${tool.slug} figure "${visual.title}" has an unlabelled mark`);
        }
      }
    }
  });

  it("keeps figures out of the recommendation business too", () => {
    const banned = /\b(you should|we recommend|recommended|best choice|the right answer|optimal choice)\b/i;
    for (const tool of TOOLS) {
      const result = tool.run(VALID[tool.slug], NOW);
      const text = result.visuals.map((v) => `${v.title} ${v.caption}`).join(" ");
      assert.equal(banned.test(text), false, `${tool.slug} leaked recommendation language into a figure`);
    }
  });
});

describe("the price snapshot", () => {
  it("dates every published rate and points at a source", () => {
    for (const r of allRates()) {
      assert.match(r.retrievedAt, /^\d{4}-\d{2}-\d{2}$/, `${r.key} has no usable retrieval date`);
      assert.match(r.sourceUrl, /^https:\/\//, `${r.key} has no source URL`);
      assert.ok(r.unitPriceUsd > 0, `${r.key} has no price`);
      assert.ok(r.unitLabel.startsWith("per "), `${r.key} has no unit`);
      assert.ok(r.note.length > 20, `${r.key} does not say why the price matters`);
    }
  });

  it("stays in sync with the seed file the database is loaded from", async () => {
    const { readFile } = await import("node:fs/promises");
    const seeded = JSON.parse(await readFile(new URL("../data/price-reference.json", import.meta.url), "utf8"));
    const byProduct = new Map(seeded.map((row) => [row.product, row]));
    for (const r of allRates()) {
      const row = byProduct.get(r.product);
      assert.ok(row !== undefined, `${r.key} is missing from data/price-reference.json`);
      assert.equal(row.unitPriceUsd, r.unitPriceUsd, `${r.key} price drifted from the seed file`);
      assert.equal(row.retrievedAt, r.retrievedAt, `${r.key} retrieval date drifted from the seed file`);
    }
    assert.equal(seeded.length, allRates().length);
  });

  it("no longer carries the REPLACE_ME placeholder", async () => {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(new URL("../data/price-reference.json", import.meta.url), "utf8");
    assert.equal(raw.includes("REPLACE_ME"), false);
  });

  it("cites a rate with its price, unit, vendor, and date", () => {
    const text = citation("objectStorageStandard");
    assert.match(text, /\$0\.023 per GB-month/);
    assert.match(text, /retrieved \d{4}-\d{2}-\d{2}/);
    assert.throws(() => rate("not-a-rate"), /No published rate/);
  });

  it("puts a dated published rate into the assumptions of every tool that uses a vendor price", () => {
    // These four weeks price entirely from figures the student supplies:
    // incident and licence costs, headcount, compliance effort, per-state
    // programme cost. No vendor rate enters the arithmetic, so there is
    // nothing to cite. Every other week touches a published price and must
    // show where it came from and when it was retrieved.
    const noVendorPrice = new Set([
      "control-cost", "governance-model", "privacy-paths", "ai-act",
      // The deliverables consolidate figures the student already computed and
      // cited in the weeks they came from. No vendor rate enters again here,
      // and re-citing one would imply a price this arithmetic never touched.
      "module-1-architecture", "module-2-cost-model", "module-3-governance", "final-project",
    ]);
    for (const tool of TOOLS) {
      if (noVendorPrice.has(tool.slug)) {
        continue;
      }
      const result = tool.run(VALID[tool.slug], NOW);
      const text = result.assumptions.map((entry) => `${entry.label} ${entry.value} ${entry.note}`).join(" ");
      assert.match(text, /list price retrieved \d{4}-\d{2}-\d{2}/, `${tool.slug} used a price with no citation`);
    }
  });
});

describe("the glossary", () => {
  it("defines every term four ways", () => {
    for (const term of allTerms()) {
      assert.ok(term.term.length > 1, "a term has no name");
      assert.ok(term.plain.length > 30, `${term.term} has no plain-language definition`);
      assert.ok(term.precise.length > 40, `${term.term} has no precise definition`);
      assert.ok(term.cost.length > 30, `${term.term} does not say what it costs`);
      assert.ok(term.trap.length > 30, `${term.term} does not say how it is got wrong`);
    }
  });

  it("defines the concepts the course turns on", () => {
    for (const key of ["distributed-system", "why-distribute", "shuffle", "compression", "compression-ratio", "working-set", "gib"]) {
      assert.ok(TERMS[key] !== undefined, `the glossary is missing "${key}"`);
    }
  });

  it("rejects an unknown key rather than serving a blank definition", () => {
    assert.throws(() => resolveTerms(["not-a-term"]), /Glossary has no entry/);
  });

  it("registers a rate for every key the rate table exposes", () => {
    for (const key of Object.keys(RATES)) {
      assert.equal(rate(key).key, key);
    }
  });
});

describe("the module deliverables", () => {
  /**
   * Pull the number out of a formatted figure such as "$1,234" or "5.9 percent".
   *
   * @param {import("../server/tools/kit.js").Line[]} lines
   * @param {string} label
   * @returns {number}
   */
  const figure = (lines, label) => {
    const found = lines.find((entry) => entry.label.startsWith(label));
    assert.ok(found !== undefined, `No line labelled ${label}.`);
    return Number(found.value.replace(/[^0-9.-]/g, ""));
  };

  it("adds the three architecture layers and holds the ceiling against them", () => {
    const result = consolidateArchitecture(VALID["module-1-architecture"]);
    // 172,800 engine + 96,600 storage + 17,000 catalog.
    assert.equal(figure(result.computed, "Engine and storage and catalog"), 286400);
    assert.equal(figure(result.computed, "Budget remaining in year one"), 850000 - 286400);
    // 286,400 grown two years at 22 percent.
    assert.equal(Math.round(286400 * 1.22 ** 2), figure(result.computed, "Final-year platform cost"));
  });

  it("says so when a single node no longer fits the year-three working set", () => {
    const single = { ...VALID["module-1-architecture"], architecturePath: "Single node" };
    const warnings = consolidateArchitecture(single).warnings.join(" ");
    assert.match(warnings, /exceeds the single-node ceiling/);
  });

  it("subtracts the ingestion already counted in platform spend rather than adding it twice", () => {
    const result = consolidateCostModel(VALID["module-2-cost-model"]);
    // The chosen path costs 108,000 against 120,000 already inside Week 5's total.
    assert.equal(figure(result.computed, "Ingestion delta"), -12000);
    // 662,600 - 128,160 saving - 12,000 released + 61,440 control.
    assert.equal(figure(result.computed, "Operating run rate"), 583880);
  });

  it("flags a cut that falls short of its own mandate", () => {
    const warnings = consolidateCostModel(VALID["module-2-cost-model"]).warnings.join(" ");
    assert.match(warnings, /against a 20 percent mandate/);
  });

  it("flags a control that costs more than the cut it is funded from", () => {
    const expensive = { ...VALID["module-2-cost-model"], controlAnnualUsd: 200000 };
    const warnings = consolidateCostModel(expensive).warnings.join(" ");
    assert.match(warnings, /costs more than the cut saved/);
  });

  it("totals governance and sets it against the operations it governs", () => {
    const result = consolidateGovernance(VALID["module-3-governance"]);
    // 1,140,000 staffing + 192,000 privacy + 2,746 corpus + 1,470 agent reads.
    assert.equal(figure(result.computed, "Governance run rate"), 1336216);
    assert.equal(figure(result.computed, "One-time readiness investment"), 800000);
    const warnings = result.warnings.join(" ");
    assert.match(warnings, /costs more per year than the platform it governs/);
  });

  it("catches a deletion promise the reindex interval cannot keep", () => {
    const result = consolidateGovernance(VALID["module-3-governance"]);
    assert.equal(figure(result.computed, "Deletion promise against reindex interval"), 15);
    assert.match(result.warnings.join(" "), /stay retrievable in the index/);
  });

  it("objects to a static key that may read personal data", () => {
    const loose = {
      ...VALID["module-3-governance"],
      agentAuthMethod: "Static API key",
      agentPersonalDataGrant: "Granted",
    };
    assert.match(consolidateGovernance(loose).warnings.join(" "), /credential exposure window is unbounded/);
  });

  it("tests the artifact against the ceiling and reports a breach as a failure", () => {
    const result = assembleFinalArtifact(VALID["final-project"]);
    // 534,440 + 108,000 + 61,440 + 1,336,216.
    assert.equal(figure(result.computed, "Annual run rate"), 2040096);
    assert.equal(figure(result.computed, "Year one total"), 2840096);
    const verdict = result.computed.find((entry) => entry.label === "Ceiling verdict");
    assert.equal(verdict?.value, "Inside the ceiling");

    const overspent = { ...VALID["final-project"], annualBudgetUsd: 2000000 };
    const failed = assembleFinalArtifact(overspent);
    assert.equal(failed.computed.find((entry) => entry.label === "Ceiling verdict")?.value, "Breaches the ceiling");
    assert.match(failed.warnings.join(" "), /fails the artifact/);
  });

  it("names the year a plan that clears year one stops clearing the ceiling", () => {
    const warnings = assembleFinalArtifact(VALID["final-project"]).warnings.join(" ");
    assert.match(warnings, /Year one is inside the ceiling and year 3 exceeds it/);
  });

  it("requires the rejected alternative and the recommendation most likely to be wrong", () => {
    for (const key of ["rejectedArchitecture", "rejectionReason", "mostLikelyWrong", "disconfirmingEvidence"]) {
      const missing = { ...VALID["final-project"], [key]: "" };
      assert.throws(() => assembleFinalArtifact(missing), InputError, `${key} was not required.`);
    }
  });

  it("holds the rejection reason to a single clause", () => {
    const twoSentences = {
      ...VALID["final-project"],
      rejectionReason: "It did not fit the working set. We also disliked the vendor relationship.",
    };
    assert.throws(() => assembleFinalArtifact(twoSentences), InputError);

    const rambling = { ...VALID["final-project"], rejectionReason: "x".repeat(181) };
    assert.throws(() => assembleFinalArtifact(rambling), InputError);
  });
});

describe("export gate", () => {
  const meta = { courseCode: "MBA 8660", label: "Week 1", toolTitle: "Working Set Sizing", decision: "Test decision." };
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
