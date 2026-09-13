/**
 * The module deliverables and the Final Project Artifact.
 *
 * These four tools differ from the twelve weekly tools in exactly one way:
 * their inputs are the weekly tools' outputs. Nothing here re-derives a
 * working set from a row count or a saving from a spend category. A student
 * arrives carrying the figures they already computed and defended, and the
 * module reconciles them into one cost model.
 *
 * That reconciliation is the teaching surface. Weekly figures overlap, and the
 * overlap is invisible until the weeks are added together: Week 5 counts
 * ingestion inside total platform spend, and Week 6 prices an ingestion path
 * on its own, so a module that adds both has charged the same dollar twice.
 * Module 2 takes the delta rather than the total for that reason, and says so.
 *
 * Every export is a pure function. No I/O, no clock beyond an injected date.
 */

import {
  InputError,
  barChart,
  gaugeChart,
  line,
  money,
  num,
  point,
  requirePositive,
  requireRange,
  requireChoice,
  requireText,
  stackChart,
  usd,
} from "./kit.js";

/** Architectures Week 1 chooses between. */
const ARCHITECTURE_PATHS = ["Single node", "Distributed"];

/** Table formats Week 2 chooses between. */
const TABLE_FORMATS = ["Iceberg", "Delta Lake", "Hudi"];

/** Ingestion paths Week 6 chooses between. */
const INGESTION_PATHS = ["Build", "Buy"];

/** Operating models Week 8 chooses between. */
const OPERATING_MODELS = ["Centralized", "Federated"];

/** Privacy paths Week 9 chooses between. */
const PRIVACY_PATHS = ["National standard", "State by state"];

/** Roles Week 10 assigns under the EU AI Act. */
const AI_ACT_ROLES = ["Provider", "Deployer", "Both", "Neither"];

/** Authentication methods Week 12 chooses between. */
const AUTH_METHODS = ["Static API key", "Short-lived vended credential", "Workload identity federation"];

/** Longest a rejection reason may run and still be one clause. */
const CLAUSE_LIMIT = 180;

/**
 * Grow one annual figure across a horizon and total it.
 *
 * The closed form of the geometric series is used rather than a loop, so the
 * workbook can hold the same arithmetic in one cell. The zero-growth branch
 * exists because the series divides by the growth rate.
 *
 * @param {number} annual
 * @param {number} growthPct
 * @param {number} years
 * @returns {{ finalYear: number, total: number, factor: number }}
 */
function growAcross(annual, growthPct, years) {
  const rate = growthPct / 100;
  const factor = (1 + rate) ** (years - 1);
  const total = rate === 0 ? annual * years : (annual * ((1 + rate) ** years - 1)) / rate;
  return { finalYear: annual * factor, total, factor };
}

/**
 * Reject a reason that has stopped being a single clause.
 *
 * The syllabus asks for the rejection reason in one clause. A reason that runs
 * to several sentences is usually a reason that has not been decided.
 *
 * @param {string} text
 * @param {string} label
 * @returns {string}
 */
function requireClause(text, label) {
  if (text.length > CLAUSE_LIMIT) {
    throw new InputError(`${label} must be a single clause of ${CLAUSE_LIMIT} characters or fewer. Yours runs to ${text.length}.`);
  }
  if (/[.!?]\s+\S/.test(text)) {
    throw new InputError(`${label} must be a single clause. Yours contains more than one sentence.`);
  }
  return text;
}

/* ------------------------------------------------------------------ *
 * Module 1: Platform Architecture Recommendation, Weeks 1 to 4
 * ------------------------------------------------------------------ */

/** The four judgments Module 1 refuses to make. */
const ARCHITECTURE_QUESTIONS = Object.freeze([
      "This module consolidates four weeks of arithmetic into one number. State which of the four figures you are least confident in, and what you did to check it.",
      "You accepted a lock-in position in Week 2 and priced the exit above. Say in one sentence what you are buying with that lock-in, and what would make the price too high.",
      "Your growth rate compounds every figure on this page. State where it came from and what the year-three total becomes if it is wrong by half.",
      "Name the architecture you considered and rejected on this page, and give the reason in a single clause. The Final Project Artifact requires it and the Live Defense will ask about it.",
      "The catalog is the cheapest line here and the one every query passes through. Say what your recovery plan is and who executes it.",
]);

/**
 * Module 1. Consolidates the Week 1 sizing, the Week 2 lock-in position, the
 * Week 3 catalog, and the Week 4 engine into one three-year platform cost, and
 * measures it against the ceiling the artifact has to live inside.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function consolidateArchitecture(input) {
  const caseOrganization = requireText(input.caseOrganization, "Case organization");
  const architecturePath = requireChoice(input.architecturePath, "Architecture path", ARCHITECTURE_PATHS);
  const tableFormat = requireChoice(input.tableFormat, "Table format", TABLE_FORMATS);
  const catalogChoice = requireText(input.catalogChoice, "Catalog");
  const engineChoice = requireText(input.engineChoice, "Engine");
  const workingSetYearThreeGib = requirePositive(input.workingSetYearThreeGib, "Year-three working set");
  const singleNodeCeilingGib = requirePositive(input.singleNodeCeilingGib, "Single-node memory ceiling");
  const exitCostUsd = requireRange(input.exitCostUsd, "Priced exit cost", 0, 100000000);
  const catalogAnnualUsd = requireRange(input.catalogAnnualUsd, "Catalog annual cost", 0, 10000000);
  const engineAnnualUsd = requirePositive(input.engineAnnualUsd, "Engine annual cost");
  const storageAnnualUsd = requirePositive(input.storageAnnualUsd, "Storage annual cost");
  const annualBudgetUsd = requirePositive(input.annualBudgetUsd, "Annual budget ceiling");
  const annualGrowthPct = requireRange(input.annualGrowthPct, "Annual growth", 0, 500);
  const queriesPerYear = requirePositive(input.queriesPerYear, "Queries per year");
  const horizonYears = requireRange(input.horizonYears, "Horizon in years", 1, 10);

  const a = priceArchitecture({
    catalogAnnualUsd, engineAnnualUsd, storageAnnualUsd, annualBudgetUsd,
    annualGrowthPct, queriesPerYear, horizonYears, exitCostUsd,
    workingSetYearThreeGib, singleNodeCeilingGib,
  });

  return {
    computed: architectureLines({ caseOrganization, architecturePath, tableFormat, catalogChoice, engineChoice, horizonYears, a }),
    assumptions: architectureAssumptions({
      workingSetYearThreeGib, singleNodeCeilingGib, exitCostUsd, catalogAnnualUsd,
      engineAnnualUsd, storageAnnualUsd, annualBudgetUsd, annualGrowthPct, queriesPerYear, horizonYears,
    }),
    unresolved: ARCHITECTURE_QUESTIONS,
    warnings: architectureWarnings({ architecturePath, horizonYears, a }),
    visuals: architectureVisuals({ engineAnnualUsd, storageAnnualUsd, catalogAnnualUsd, annualBudgetUsd, annualGrowthPct, horizonYears, a }),
  };
}

/**
 * Price the consolidated architecture.
 *
 * @param {Record<string, number>} a
 * @returns {Record<string, number>}
 */
function priceArchitecture(a) {
  const platformAnnual = a.engineAnnualUsd + a.storageAnnualUsd + a.catalogAnnualUsd;
  const grown = growAcross(platformAnnual, a.annualGrowthPct, a.horizonYears);
  return {
    platformAnnual,
    finalYear: grown.finalYear,
    horizonTotal: grown.total,
    budgetRemaining: a.annualBudgetUsd - platformAnnual,
    ceilingUtilisationPct: (platformAnnual / a.annualBudgetUsd) * 100,
    costPerQuery: platformAnnual / a.queriesPerYear,
    catalogSharePct: (a.catalogAnnualUsd / platformAnnual) * 100,
    exitMonths: a.exitCostUsd / (platformAnnual / 12),
    exitSharePct: (a.exitCostUsd / grown.total) * 100,
    headroomRatio: a.singleNodeCeilingGib / a.workingSetYearThreeGib,
  };
}

/**
 * Computed lines for Module 1.
 *
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Line[]}
 */
function architectureLines(a) {
  const m = /** @type {Record<string, number>} */ (a.a);
  return [
    line("Case organization", String(a.caseOrganization), "The organization every figure in this module belongs to. One case, carried from Week 1 to the Live Defense."),
    line("Architecture and format chosen", `${String(a.architecturePath)} on ${String(a.tableFormat)}`, "The Week 1 and Week 2 decisions, stated together, because the format only matters once the architecture is settled."),
    line("Catalog and engine", `${String(a.catalogChoice)} with ${String(a.engineChoice)}`, "The Week 3 and Week 4 decisions. Every query passes through the first and is billed by the second."),
    line("Single-node headroom in year three", num(m.headroomRatio, 2, "x"), "Single-node ceiling divided by the year-three working set. Below 1.0 the single-node path has run out, which decides the architecture for you."),
    line("Engine and storage and catalog, per year", usd(m.platformAnnual), "The three layers added up. This is the platform run rate, before anything Module 2 does to it."),
    line("Catalog share of the platform bill", num(m.catalogSharePct, 2, "percent"), "The smallest line and the one with the largest blast radius. Price is not a measure of importance."),
    line("Platform cost per query", money(m.costPerQuery), "The run rate denominated in the unit a business owner recognizes. Module 2 moves this figure."),
    line("Final-year platform cost", usd(m.finalYear), "The run rate after growth compounds. The ceiling it is measured against did not move."),
    line("Platform total across the horizon", usd(m.horizonTotal), "Every year added up, grown. This is the figure the Final Project Artifact carries forward."),
    line("Budget remaining in year one", usd(m.budgetRemaining), "Ceiling minus year-one run rate. Negative means the artifact fails before Module 2 adds anything."),
    line("Ceiling utilisation in year one", num(m.ceilingUtilisationPct, 1, "percent"), "How much of the ceiling the architecture alone consumes. Ingestion, controls, and governance are still to come."),
    line("Priced exit, in months of run rate", num(m.exitMonths, 2, "months"), "The Week 2 exit cost expressed as run-rate time. It is the honest unit for a lock-in argument."),
    line("Priced exit as a share of the horizon total", num(m.exitSharePct, 2, "percent"), "What leaving costs against what staying costs. A small number here is a claim that needs checking, not a reassurance."),
  ];
}

/**
 * Echoed assumptions for Module 1.
 *
 * @param {Record<string, number>} a
 * @returns {import("./kit.js").Line[]}
 */
function architectureAssumptions(a) {
  return [
    line("Year-three working set (Week 1)", num(a.workingSetYearThreeGib, 1, "GiB"), "Carried from Week 1. Grown from today's working set at your stated rate."),
    line("Single-node memory ceiling (Week 1)", num(a.singleNodeCeilingGib, 0, "GiB"), "The largest single machine you are willing to rent. Raising it is a decision, not a fact."),
    line("Priced exit cost (Week 2)", usd(a.exitCostUsd), "Rewrite compute plus egress, from Week 2. It prices the mechanical exit only."),
    line("Catalog annual cost (Week 3)", usd(a.catalogAnnualUsd), "Week 3 prices catalog objects and requests, which come out near zero. Add the licence or the self-hosting salary, because that is the part that is not near zero."),
    line("Engine annual cost (Week 4)", usd(a.engineAnnualUsd), "Compute after any committed-use discount, from Week 4."),
    line("Storage annual cost (Week 4)", usd(a.storageAnnualUsd), "The line a compute-only budget omits. It grows whether or not anyone queries."),
    line("Annual budget ceiling", usd(a.annualBudgetUsd), "The constraint the Final Project Artifact fails against. Stated before the design, not after it."),
    line("Annual growth", num(a.annualGrowthPct, 0, "percent"), "Compounded across the horizon. It decides the final-year figure more than any single price does."),
    line("Queries per year", Number(a.queriesPerYear).toLocaleString("en-US"), "The denominator for cost per query."),
    line("Horizon", num(a.horizonYears, 0, "years"), "The window the recommendation is made over. Three years, to match the Final Project Artifact."),
  ];
}

/**
 * Warnings for Module 1.
 *
 * @param {Record<string, unknown>} a
 * @returns {string[]}
 */
function architectureWarnings(a) {
  const m = /** @type {Record<string, number>} */ (a.a);
  const warnings = [];
  if (m.finalYear > m.platformAnnual + m.budgetRemaining) {
    warnings.push(`The architecture alone breaches the ceiling by year ${num(Number(a.horizonYears), 0, "")}, before ingestion, controls, or governance are added. Module 2 and Module 3 both add to this figure.`);
  }
  if (m.headroomRatio < 1 && a.architecturePath === "Single node") {
    warnings.push("Your year-three working set exceeds the single-node ceiling, and you recommended a single node. Either the growth rate is wrong or the architecture is.");
  }
  if (m.headroomRatio >= 1 && a.architecturePath === "Distributed") {
    warnings.push("A single node still fits your year-three working set. Distributing is defensible for throughput or fault tolerance, but say which, because it is not capacity.");
  }
  if (m.catalogSharePct < 1) {
    warnings.push("The catalog is under one percent of the bill and every query depends on it. That is the cost profile of a single point of failure, and it is not an argument for spending nothing on it.");
  }
  if (m.exitMonths < 1) {
    warnings.push("Your priced exit is less than one month of run rate. That is not evidence you are unlocked. It means the cost of leaving sits where this arithmetic does not reach: the catalog, the engine's SQL dialect, and every pipeline written against it.");
  }
  return warnings;
}

/**
 * Charts for Module 1.
 *
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Visual[]}
 */
function architectureVisuals(a) {
  const m = /** @type {Record<string, number>} */ (a.a);
  const growth = Number(a.annualGrowthPct);
  const horizonYears = Number(a.horizonYears);
  return [
    stackChart(
      "Where the annual platform bill sits",
      "USD per year",
      "Three layers, one bill. The layer that dominates is the one your FinOps work in Module 2 has to reach.",
      [
        point("Year one", Number(a.engineAnnualUsd), usd(Number(a.engineAnnualUsd)), "Engine"),
        point("Year one", Number(a.storageAnnualUsd), usd(Number(a.storageAnnualUsd)), "Storage"),
        point("Year one", Number(a.catalogAnnualUsd), usd(Number(a.catalogAnnualUsd)), "Catalog"),
      ]
    ),
    gaugeChart(
      "Final-year platform cost against the ceiling",
      "USD per year",
      "The ceiling does not grow. Your working set does. This is the year the two meet.",
      point("Final-year platform cost", m.finalYear, usd(m.finalYear)),
      { label: "Annual budget ceiling", value: Number(a.annualBudgetUsd) }
    ),
    barChart(
      "Platform cost by year",
      "USD per year",
      `Each year grown at ${num(growth, 0, "percent")}. Read the slope, not the first bar.`,
      Array.from({ length: horizonYears }, (_unused, index) => {
        const value = m.platformAnnual * (1 + growth / 100) ** index;
        return point(`Year ${String(index + 1)}`, value, usd(value));
      })
    ),
  ];
}

/* ------------------------------------------------------------------ *
 * Module 2: Cost Model and Reliability Review, Weeks 5 to 7
 * ------------------------------------------------------------------ */

/** The judgments Module 2 refuses to make. */
const COST_MODEL_QUESTIONS = Object.freeze([
      "Week 5 counts ingestion inside total platform spend and Week 6 prices it on its own. State which figure you treated as authoritative and why the other one is not double counted here.",
      "Your cut removes spend and your control adds it. Say whether the net is a saving or a reallocation, and name who signs off on the difference.",
      "Exposure avoided rests on a catch rate you estimated in Week 7. State that estimate's source and what the net position becomes if the true rate is half of it.",
      "The spreadsheet the module deliverable requires must be built from published list prices. Name the prices in this model that are quoted rather than published, and say how a reader could verify them.",
      "State which single line in this cost model you would defend first under challenge, and which you would concede.",
]);

/**
 * Module 2. Takes the Week 5 cut, the Week 6 ingestion decision, and the
 * Week 7 control, and reconciles them into one operating run rate.
 *
 * The reconciliation that matters is ingestion. Week 5 already counts
 * ingestion inside total platform spend, so the Week 6 path enters here as a
 * delta against what is already counted, not as a fresh line. Adding the
 * Week 6 total would charge the same dollar twice.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function consolidateCostModel(input) {
  const ingestionPath = requireChoice(input.ingestionPath, "Ingestion path", INGESTION_PATHS);
  const controlName = requireText(input.controlName, "Control name");
  const platformAnnualUsd = requirePositive(input.platformAnnualUsd, "Total annual platform spend");
  const annualSavingUsd = requireRange(input.annualSavingUsd, "Annual saving", 0, 100000000);
  const targetReductionPct = requireRange(input.targetReductionPct, "Target reduction", 1, 90);
  const ingestionChosenAnnualUsd = requireRange(input.ingestionChosenAnnualUsd, "Chosen ingestion path, annual cost", 0, 50000000);
  const ingestionCountedAnnualUsd = requireRange(input.ingestionCountedAnnualUsd, "Ingestion already counted in platform spend", 0, 50000000);
  const breakEvenMonths = requireRange(input.breakEvenMonths, "Break-even", 0, 600);
  const controlAnnualUsd = requireRange(input.controlAnnualUsd, "Control steady-state annual cost", 0, 50000000);
  const exposureAvoidedUsd = requireRange(input.exposureAvoidedUsd, "Exposure avoided", 0, 500000000);
  const annualBudgetUsd = requirePositive(input.annualBudgetUsd, "Annual budget ceiling");
  const queriesPerYear = requirePositive(input.queriesPerYear, "Queries per year");
  const annualGrowthPct = requireRange(input.annualGrowthPct, "Annual growth", 0, 500);
  const horizonYears = requireRange(input.horizonYears, "Horizon in years", 1, 10);

  const c = priceCostModel({
    platformAnnualUsd, annualSavingUsd, ingestionChosenAnnualUsd, ingestionCountedAnnualUsd,
    controlAnnualUsd, exposureAvoidedUsd, annualBudgetUsd, queriesPerYear, annualGrowthPct, horizonYears,
  });

  return {
    computed: costModelLines({ ingestionPath, controlName, targetReductionPct, horizonYears, c }),
    assumptions: costModelAssumptions({
      platformAnnualUsd, annualSavingUsd, targetReductionPct, ingestionChosenAnnualUsd,
      ingestionCountedAnnualUsd, breakEvenMonths, controlAnnualUsd, exposureAvoidedUsd,
      annualBudgetUsd, queriesPerYear, annualGrowthPct, horizonYears,
    }),
    unresolved: COST_MODEL_QUESTIONS,
    warnings: costModelWarnings({ targetReductionPct, breakEvenMonths, horizonYears, c }),
    visuals: costModelVisuals({ annualBudgetUsd, horizonYears, c }),
  };
}

/**
 * Price the consolidated cost model.
 *
 * @param {Record<string, number>} a
 * @returns {Record<string, number>}
 */
function priceCostModel(a) {
  const postCutAnnual = a.platformAnnualUsd - a.annualSavingUsd;
  const ingestionDelta = a.ingestionChosenAnnualUsd - a.ingestionCountedAnnualUsd;
  const operationsAnnual = postCutAnnual + ingestionDelta + a.controlAnnualUsd;
  const grown = growAcross(operationsAnnual, a.annualGrowthPct, a.horizonYears);
  return {
    postCutAnnual,
    ingestionDelta,
    operationsAnnual,
    controlAnnual: a.controlAnnualUsd,
    annualSaving: a.annualSavingUsd,
    exposureAvoided: a.exposureAvoidedUsd,
    achievedReductionPct: (a.annualSavingUsd / a.platformAnnualUsd) * 100,
    controlFundedBySavingPct: a.annualSavingUsd === 0 ? 0 : (a.controlAnnualUsd / a.annualSavingUsd) * 100,
    netReliabilityPosition: a.exposureAvoidedUsd - a.controlAnnualUsd,
    netAgainstBaseline: a.platformAnnualUsd - operationsAnnual,
    costPerQuery: operationsAnnual / a.queriesPerYear,
    finalYear: grown.finalYear,
    horizonTotal: grown.total,
    budgetRemaining: a.annualBudgetUsd - operationsAnnual,
    ceilingUtilisationPct: (operationsAnnual / a.annualBudgetUsd) * 100,
  };
}

/**
 * Computed lines for Module 2.
 *
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Line[]}
 */
function costModelLines(a) {
  const c = /** @type {Record<string, number>} */ (a.c);
  return [
    line("Reliability control funded", String(a.controlName), "One control, named, with a price. The module deliverable asks for the one you would fund, not the programme you would like."),
    line("Ingestion path chosen", String(a.ingestionPath), "The Week 6 decision. It enters this model as a change against what Week 5 already counted, not as a new line."),
    line("Platform spend after the cut", usd(c.postCutAnnual), "Week 5 total spend minus the Week 5 saving. The starting point for everything below."),
    line("Reduction achieved", num(c.achievedReductionPct, 1, "percent"), "The saving as a share of total spend, against the mandate you were handed."),
    line("Ingestion delta against what was already counted", usd(c.ingestionDelta), "Chosen path minus the ingestion already inside Week 5's total. Negative releases spend, positive adds it. This is the line that prevents double counting."),
    line("Reliability control, per year", usd(c.controlAnnual), "Steady-state cost from Week 7. New spend, so it is added rather than reconciled."),
    line("Operating run rate", usd(c.operationsAnnual), "Platform after the cut, adjusted for the ingestion decision, plus the control. This is what Module 3 and the Final Artifact carry forward."),
    line("Net change against the Week 5 baseline", usd(c.netAgainstBaseline), "What the whole module actually moved. Positive means you are spending less than you started with, control included."),
    line("Share of the cut consumed by the control", num(c.controlFundedBySavingPct, 1, "percent"), "How much of the saving the control spends. Above 100 percent the cut funded the control and nothing else."),
    line("Net reliability position", usd(c.netReliabilityPosition), "Exposure avoided minus control cost. Positive is not the same as fundable, and it never was."),
    line("Operating cost per query", money(c.costPerQuery), "The run rate in the unit a business owner acts on. Compare it against the Module 1 figure to see what this module bought."),
    line("Final-year operating run rate", usd(c.finalYear), "After growth compounds. The cut was a one-time step down on a curve that keeps rising."),
    line("Operating total across the horizon", usd(c.horizonTotal), "Every year added up, grown. Carried into the Final Project Artifact."),
    line("Budget remaining in year one", usd(c.budgetRemaining), "Ceiling minus the operating run rate. Governance is still to come in Module 3."),
    line("Ceiling utilisation in year one", num(c.ceilingUtilisationPct, 1, "percent"), "How much of the ceiling operations consume before any governance cost is counted."),
  ];
}

/**
 * Echoed assumptions for Module 2.
 *
 * @param {Record<string, number>} a
 * @returns {import("./kit.js").Line[]}
 */
function costModelAssumptions(a) {
  return [
    line("Total annual platform spend (Week 5)", usd(a.platformAnnualUsd), "The whole platform bill Week 5 cut against, wider than Module 1's three architecture layers."),
    line("Annual saving (Week 5)", usd(a.annualSavingUsd), "What the cut plan actually removes, summed across categories."),
    line("Target reduction (Week 5)", num(a.targetReductionPct, 0, "percent"), "The mandate. The syllabus sets it at 20 percent."),
    line("Chosen ingestion path, annual cost (Week 6)", usd(a.ingestionChosenAnnualUsd), "Vendor price times twelve, or maintenance plus infrastructure times twelve, whichever path you chose."),
    line("Ingestion already counted in platform spend (Week 5)", usd(a.ingestionCountedAnnualUsd), "The ingestion category inside Week 5's total. Subtracted so the same dollar is not charged twice."),
    line("Break-even (Week 6)", num(a.breakEvenMonths, 1, "months"), "The month cumulative build cost equals cumulative vendor cost. Compare it against your horizon before you read it as a verdict."),
    line("Control steady-state annual cost (Week 7)", usd(a.controlAnnualUsd), "Tooling plus operating effort, after the first year's setup."),
    line("Exposure avoided (Week 7)", usd(a.exposureAvoidedUsd), "Annual incident exposure times your estimated catch rate. Your estimate, not a measurement."),
    line("Annual budget ceiling", usd(a.annualBudgetUsd), "Unchanged from Module 1. It does not grow."),
    line("Queries per year", Number(a.queriesPerYear).toLocaleString("en-US"), "The denominator for cost per query."),
    line("Annual growth", num(a.annualGrowthPct, 0, "percent"), "Applied to the operating run rate across the horizon."),
    line("Horizon", num(a.horizonYears, 0, "years"), "Three years, to match the Final Project Artifact."),
  ];
}

/**
 * Warnings for Module 2.
 *
 * @param {Record<string, unknown>} a
 * @returns {string[]}
 */
function costModelWarnings(a) {
  const c = /** @type {Record<string, number>} */ (a.c);
  const targetReductionPct = Number(a.targetReductionPct);
  const breakEvenMonths = Number(a.breakEvenMonths);
  const horizonMonths = Number(a.horizonYears) * 12;
  const warnings = [];
  if (c.achievedReductionPct < targetReductionPct) {
    warnings.push(`The cut achieves ${num(c.achievedReductionPct, 1, "percent")} against a ${num(targetReductionPct, 0, "percent")} mandate. A plan that is short is a direction, not a plan.`);
  }
  if (c.controlFundedBySavingPct > 100) {
    warnings.push("The control costs more than the cut saved. That can still be right for a regulated failure, but you are now defending a net spend increase, not a reduction.");
  }
  if (c.netReliabilityPosition < 0) {
    warnings.push("The control costs more per year than the exposure it avoids. Say explicitly why you would fund it anyway, or fund a different one.");
  }
  if (breakEvenMonths > horizonMonths) {
    warnings.push(`Break-even at ${num(breakEvenMonths, 1, "months")} falls outside your ${num(horizonMonths, 0, "month")} horizon, so the horizon is deciding the ingestion question rather than the arithmetic.`);
  }
  if (breakEvenMonths <= horizonMonths && horizonMonths - breakEvenMonths < 6) {
    warnings.push(`Break-even lands within six months of the end of your horizon. A margin that thin is inside the error bar on your own maintenance estimate.`);
  }
  if (c.budgetRemaining < 0) {
    warnings.push("Operations alone breach the ceiling in year one, before Module 3 adds any governance cost.");
  }
  if (c.finalYear > c.operationsAnnual + c.budgetRemaining) {
    warnings.push(`Operations stay inside the ceiling in year one and breach it by year ${num(Number(a.horizonYears), 0, "")}. Growth, not the cut, is the deciding line in this model.`);
  }
  return warnings;
}

/**
 * Charts for Module 2.
 *
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Visual[]}
 */
function costModelVisuals(a) {
  const c = /** @type {Record<string, number>} */ (a.c);
  return [
    stackChart(
      "What the operating run rate is made of",
      "USD per year",
      "The cut removes from the first bar. The control adds to the last. The middle one is a decision, not a total.",
      [
        point("Year one", c.postCutAnnual, usd(c.postCutAnnual), "Platform after the cut"),
        point("Year one", Math.abs(c.ingestionDelta), usd(c.ingestionDelta), c.ingestionDelta >= 0 ? "Ingestion added" : "Ingestion released"),
        point("Year one", c.controlAnnual, usd(c.controlAnnual), "Reliability control"),
      ]
    ),
    barChart(
      "The control against what it prevents",
      "USD per year",
      "Both bars are estimates, and the right one rests on a catch rate you supplied. Treat the gap as a range.",
      [
        point("Control cost", c.controlAnnual, usd(c.controlAnnual)),
        point("Exposure avoided", c.exposureAvoided, usd(c.exposureAvoided)),
        point("Annual saving from the cut", c.annualSaving, usd(c.annualSaving)),
      ]
    ),
    gaugeChart(
      "Final-year operating run rate against the ceiling",
      "USD per year",
      "The cut bought room once. Growth spends it every year after.",
      point("Final-year run rate", c.finalYear, usd(c.finalYear)),
      { label: "Annual budget ceiling", value: Number(a.annualBudgetUsd) }
    ),
  ];
}

/* ------------------------------------------------------------------ *
 * Module 3: Governance and Regulatory Exposure, Weeks 8 to 12
 * ------------------------------------------------------------------ */

/** The judgments Module 3 refuses to make. */
const GOVERNANCE_QUESTIONS = Object.freeze([
      "Governance here is mostly payroll. State whether the headcount this model assumes exists today, is budgeted, or is aspirational, and what changes if it is the third.",
      "You chose a privacy path on cost. Name the provision of the strictest state's statute that sets your floor, and say what it requires that the cheaper path would not deliver.",
      "Annex III duties were deferred, not cancelled. State what your organization will have finished by the date above, and who owns it.",
      "The agent in Week 12 has no person attached. Say who reviews its grants, on what schedule, and what evidence that review produces.",
      "Name the single governance figure on this page most likely to be challenged by your own legal or compliance function, and say what you would show them.",
]);

/**
 * Module 3. Consolidates the Week 8 operating model, the Week 9 privacy path,
 * the Week 10 EU AI Act exposure, the Week 11 retrieval corpus, and the
 * Week 12 agent access decision into one governance run rate, and sets it
 * against the operations run rate Module 2 produced.
 *
 * The comparison is the point. Governance is staffed, and staffing is the
 * largest number in most of these models by an order of magnitude, which is
 * invisible while the five weeks are read separately.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function consolidateGovernance(input) {
  const operatingModel = requireChoice(input.operatingModel, "Operating model", OPERATING_MODELS);
  const privacyPath = requireChoice(input.privacyPath, "Privacy path", PRIVACY_PATHS);
  const aiActRole = requireChoice(input.aiActRole, "Role under the AI Act", AI_ACT_ROLES);
  const agentAuthMethod = requireChoice(input.agentAuthMethod, "Agent authentication method", AUTH_METHODS);
  const agentPersonalDataGrant = requireChoice(input.agentPersonalDataGrant, "Agent grant over personal data", ["Denied", "Granted"]);
  const staffingAnnualUsd = requirePositive(input.staffingAnnualUsd, "Governance staffing, annual");
  const privacyBuildUsd = requireRange(input.privacyBuildUsd, "Privacy programme build", 0, 100000000);
  const privacyAnnualUsd = requireRange(input.privacyAnnualUsd, "Privacy programme, annual", 0, 50000000);
  const aiActReadinessUsd = requireRange(input.aiActReadinessUsd, "AI Act readiness cost", 0, 100000000);
  const daysToAnnexIii = requireRange(input.daysToAnnexIii, "Days until Annex III applies", 0, 3650);
  const ragAnnualUsd = requireRange(input.ragAnnualUsd, "Retrieval corpus, annual", 0, 50000000);
  const deletionSlaDays = requirePositive(input.deletionSlaDays, "Deletion request SLA");
  const reindexIntervalDays = requirePositive(input.reindexIntervalDays, "Reindex interval");
  const agentAnnualUsd = requireRange(input.agentAnnualUsd, "Agent read spend, annual", 0, 50000000);
  const operationsAnnualUsd = requirePositive(input.operationsAnnualUsd, "Operating run rate from Module 2");
  const horizonYears = requireRange(input.horizonYears, "Horizon in years", 1, 10);

  const g = priceGovernance({
    staffingAnnualUsd, privacyBuildUsd, privacyAnnualUsd, aiActReadinessUsd, daysToAnnexIii,
    ragAnnualUsd, deletionSlaDays, reindexIntervalDays, agentAnnualUsd, operationsAnnualUsd, horizonYears,
  });

  return {
    computed: governanceLines({ operatingModel, privacyPath, aiActRole, agentAuthMethod, agentPersonalDataGrant, horizonYears, g }),
    assumptions: governanceAssumptions({
      staffingAnnualUsd, privacyBuildUsd, privacyAnnualUsd, aiActReadinessUsd, daysToAnnexIii,
      ragAnnualUsd, deletionSlaDays, reindexIntervalDays, agentAnnualUsd, operationsAnnualUsd, horizonYears,
    }),
    unresolved: GOVERNANCE_QUESTIONS,
    warnings: governanceWarnings({ aiActRole, agentAuthMethod, agentPersonalDataGrant, g }),
    visuals: governanceVisuals(g),
  };
}

/**
 * Price the consolidated governance position.
 *
 * @param {Record<string, number>} a
 * @returns {Record<string, number>}
 */
function priceGovernance(a) {
  const governanceAnnual = a.staffingAnnualUsd + a.privacyAnnualUsd + a.ragAnnualUsd + a.agentAnnualUsd;
  const oneTime = a.privacyBuildUsd + a.aiActReadinessUsd;
  const weeksToAnnexIii = a.daysToAnnexIii / 7;
  return {
    governanceAnnual,
    oneTime,
    staffingAnnual: a.staffingAnnualUsd,
    privacyAnnual: a.privacyAnnualUsd,
    ragAnnual: a.ragAnnualUsd,
    agentAnnual: a.agentAnnualUsd,
    operationsAnnual: a.operationsAnnualUsd,
    horizonTotal: governanceAnnual * a.horizonYears + oneTime,
    staffingSharePct: (a.staffingAnnualUsd / governanceAnnual) * 100,
    governanceSharePct: (governanceAnnual / (governanceAnnual + a.operationsAnnualUsd)) * 100,
    governanceMultiple: governanceAnnual / a.operationsAnnualUsd,
    weeksToAnnexIii,
    readinessPerWeek: weeksToAnnexIii === 0 ? 0 : a.aiActReadinessUsd / weeksToAnnexIii,
    deletionGapDays: a.deletionSlaDays - a.reindexIntervalDays,
    deletionSlaDays: a.deletionSlaDays,
    reindexIntervalDays: a.reindexIntervalDays,
  };
}

/**
 * Computed lines for Module 3.
 *
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Line[]}
 */
function governanceLines(a) {
  const g = /** @type {Record<string, number>} */ (a.g);
  return [
    line("Operating model", String(a.operatingModel), "The Week 8 decision. It sets the staffing line, which sets almost everything else on this page."),
    line("Privacy path", String(a.privacyPath), "The Week 9 decision. One internal standard applied everywhere, or a programme per state."),
    line("Role under the AI Act", String(a.aiActRole), "The Week 10 classification. Provider obligations are far heavier than deployer obligations."),
    line("Agent authentication and scope", `${String(a.agentAuthMethod)}, personal data ${String(a.agentPersonalDataGrant).toLowerCase()}`, "The Week 12 decision, stated as the pair that matters: how it proves what it is, and what it may read."),
    line("Governance run rate", usd(g.governanceAnnual), "Staffing, privacy programme, retrieval corpus, and agent reads, per year. The recurring cost of being allowed to operate."),
    line("Staffing share of governance", num(g.staffingSharePct, 1, "percent"), "How much of governance is payroll. Governance is an organizational decision priced as an architectural one."),
    line("One-time readiness investment", usd(g.oneTime), "Privacy programme build plus AI Act readiness. Paid once, in year one, on top of the run rate."),
    line("Governance total across the horizon", usd(g.horizonTotal), "Run rate times the horizon plus the one-time investment. Carried into the Final Project Artifact."),
    line("Governance as a share of total run rate", num(g.governanceSharePct, 1, "percent"), "Governance against governance plus operations. Above 50 percent the platform is the cheaper half of the platform."),
    line("Governance per dollar of operations", num(g.governanceMultiple, 2, "x"), "Governance run rate divided by the Module 2 operating run rate. State whether your organization knows this ratio."),
    line("Weeks until Annex III applies", num(g.weeksToAnnexIii, 1, "weeks"), "Working time remaining before the deferred high-risk obligations take effect."),
    line("Readiness spend per remaining week", usd(g.readinessPerWeek), "Total readiness cost divided by the weeks left. If nobody has budgeted this, the deferral bought less than it appeared to."),
    line("Deletion promise against reindex interval", num(g.deletionGapDays, 0, "days"), "Deletion SLA minus reindex interval. Positive means deleted records stay retrievable past the date you promised they would be gone."),
  ];
}

/**
 * Echoed assumptions for Module 3.
 *
 * @param {Record<string, number>} a
 * @returns {import("./kit.js").Line[]}
 */
function governanceAssumptions(a) {
  return [
    line("Governance staffing, annual (Week 8)", usd(a.staffingAnnualUsd), "Fully loaded headcount cost for the operating model you chose."),
    line("Privacy programme build (Week 9)", usd(a.privacyBuildUsd), "One-time cost of the path you chose, national or per state."),
    line("Privacy programme, annual (Week 9)", usd(a.privacyAnnualUsd), "Ongoing programme cost on that same path."),
    line("AI Act readiness cost (Week 10)", usd(a.aiActReadinessUsd), "Readiness hours times a blended rate. You will be asked who supplied the hours."),
    line("Days until Annex III applies (Week 10)", num(a.daysToAnnexIii, 0, "days"), "From Week 10's timeline, measured from the date you ran it."),
    line("Retrieval corpus, annual (Week 11)", usd(a.ragAnnualUsd), "Embedding plus vector storage plus answer generation. The answering line usually dominates."),
    line("Deletion request SLA (Week 11)", num(a.deletionSlaDays, 0, "days"), "What you have promised, statutorily or contractually."),
    line("Reindex interval (Week 11)", num(a.reindexIntervalDays, 0, "days"), "How often the index is rebuilt, which bounds how long a deleted record stays retrievable."),
    line("Agent read spend, annual (Week 12)", usd(a.agentAnnualUsd), "What the agent's reads cost at the same per-TB rate a human pays."),
    line("Operating run rate from Module 2", usd(a.operationsAnnualUsd), "The denominator for every share on this page. Carried forward, not recomputed."),
    line("Horizon", num(a.horizonYears, 0, "years"), "Three years, to match the Final Project Artifact."),
  ];
}

/**
 * Warnings for Module 3.
 *
 * @param {Record<string, unknown>} a
 * @returns {string[]}
 */
function governanceWarnings(a) {
  const g = /** @type {Record<string, number>} */ (a.g);
  const warnings = [];
  if (g.deletionGapDays > 0) {
    warnings.push(`Your deletion SLA is ${num(g.deletionGapDays, 0, "days")} longer than your reindex interval. Deleted records stay retrievable in the index until the next reindex, which means the promise is not kept by the system that made it.`);
  }
  if (a.agentAuthMethod === "Static API key" && a.agentPersonalDataGrant === "Granted") {
    warnings.push("A static key never expires and the agent may read personal data. The credential exposure window is unbounded over the most regulated data you hold.");
  }
  if (a.aiActRole !== "Neither" && g.weeksToAnnexIii < 52) {
    warnings.push(`Under a year of working time remains before Annex III applies, at ${usd(g.readinessPerWeek)} of readiness spend per remaining week. Confirm that figure is in a budget somebody owns.`);
  }
  if (g.governanceSharePct > 50) {
    warnings.push("Governance costs more per year than the platform it governs. That is defensible in a regulated industry and it is not defensible by accident, so state which this is.");
  }
  if (g.staffingSharePct > 90) {
    warnings.push("Over 90 percent of governance is payroll. Every lever in this model is a hiring decision, so tooling choices will not move the total.");
  }
  return warnings;
}

/**
 * Charts for Module 3.
 *
 * @param {Record<string, number>} g
 * @returns {import("./kit.js").Visual[]}
 */
function governanceVisuals(g) {
  return [
    stackChart(
      "What governance costs every year",
      "USD per year",
      "Four streams. One of them is salaries and the other three are rounding against it, which is the finding.",
      [
        point("Year one", g.staffingAnnual, usd(g.staffingAnnual), "Staffing"),
        point("Year one", g.privacyAnnual, usd(g.privacyAnnual), "Privacy programme"),
        point("Year one", g.ragAnnual, usd(g.ragAnnual), "Retrieval corpus"),
        point("Year one", g.agentAnnual, usd(g.agentAnnual), "Agent reads"),
      ]
    ),
    barChart(
      "Governance against the platform it governs",
      "USD per year",
      "If the left bar exceeds the right one, the cost of running the platform is no longer the platform.",
      [
        point("Governance run rate", g.governanceAnnual, usd(g.governanceAnnual)),
        point("Operations run rate", g.operationsAnnual, usd(g.operationsAnnual)),
      ]
    ),
    barChart(
      "Deletion promise against index refresh",
      "days",
      "A deletion SLA longer than the reindex interval means deleted records stay retrievable until the next pass.",
      [
        point("Deletion SLA", g.deletionSlaDays, num(g.deletionSlaDays, 0, "d")),
        point("Reindex interval", g.reindexIntervalDays, num(g.reindexIntervalDays, 0, "d")),
      ]
    ),
  ];
}

/* ------------------------------------------------------------------ *
 * Final Project Artifact
 * ------------------------------------------------------------------ */

/** The judgments the Final Project Artifact refuses to make. */
const ARTIFACT_QUESTIONS = Object.freeze([
      "State your recommendation in one sentence, BLUF, as it will appear first in the artifact. If it takes more than one sentence, the recommendation is not yet made.",
      "You named an architecture you rejected. Say what would have had to be true for you to have chosen it instead, and how close that was.",
      "You named the recommendation most likely to be wrong. State the threshold and the date at which you would act on the evidence you described, and who watches for it.",
      "This model grows every stream at one rate. Name the stream that will not grow at that rate, say which way it deviates, and what the final-year total becomes if you are right.",
      "The Live Defense will ask you to justify three choices and then change a circumstance. Name the circumstance you would least like to be asked about, and answer it here first.",
]);

/**
 * The Final Project Artifact. Assembles the three modules into one three-year
 * total cost of ownership, tests it against the budget ceiling the artifact
 * fails on, and requires in writing the two judgments no model produces: the
 * architecture you rejected, and the recommendation most likely to be wrong.
 *
 * The four annual streams are taken as separate inputs rather than as one
 * total so the share of each is visible, and so a student who has double
 * counted somewhere upstream can see where.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function assembleFinalArtifact(input) {
  const caseOrganization = requireText(input.caseOrganization, "Case organization");
  const rejectedArchitecture = requireText(input.rejectedArchitecture, "Architecture considered and rejected");
  const rejectionReason = requireClause(requireText(input.rejectionReason, "Reason for rejection"), "Reason for rejection");
  const mostLikelyWrong = requireText(input.mostLikelyWrong, "Recommendation most likely to be wrong");
  const disconfirmingEvidence = requireText(input.disconfirmingEvidence, "Evidence that would change your mind");
  const annualBudgetUsd = requirePositive(input.annualBudgetUsd, "Annual budget ceiling");
  const platformAnnualUsd = requirePositive(input.platformAnnualUsd, "Platform run rate after the cut");
  const ingestionAnnualUsd = requireRange(input.ingestionAnnualUsd, "Ingestion, annual", 0, 50000000);
  const controlAnnualUsd = requireRange(input.controlAnnualUsd, "Reliability control, annual", 0, 50000000);
  const governanceAnnualUsd = requireRange(input.governanceAnnualUsd, "Governance, annual", 0, 500000000);
  const oneTimeInvestmentUsd = requireRange(input.oneTimeInvestmentUsd, "One-time investment", 0, 500000000);
  const annualGrowthPct = requireRange(input.annualGrowthPct, "Annual growth", 0, 500);
  const queriesPerYear = requirePositive(input.queriesPerYear, "Queries per year");
  const horizonYears = requireRange(input.horizonYears, "Horizon in years", 1, 10);

  const f = priceArtifact({
    platformAnnualUsd, ingestionAnnualUsd, controlAnnualUsd, governanceAnnualUsd,
    oneTimeInvestmentUsd, annualBudgetUsd, annualGrowthPct, queriesPerYear, horizonYears,
  });

  return {
    computed: artifactLines({ caseOrganization, rejectedArchitecture, rejectionReason, mostLikelyWrong, disconfirmingEvidence, horizonYears, f }),
    assumptions: artifactAssumptions({
      platformAnnualUsd, ingestionAnnualUsd, controlAnnualUsd, governanceAnnualUsd,
      oneTimeInvestmentUsd, annualBudgetUsd, annualGrowthPct, queriesPerYear, horizonYears,
    }),
    unresolved: ARTIFACT_QUESTIONS,
    warnings: artifactWarnings({ horizonYears, f }),
    visuals: artifactVisuals({ platformAnnualUsd, ingestionAnnualUsd, controlAnnualUsd, governanceAnnualUsd, oneTimeInvestmentUsd, annualBudgetUsd, annualGrowthPct, horizonYears, f }),
  };
}

/**
 * Price the whole artifact.
 *
 * @param {Record<string, number>} a
 * @returns {Record<string, number>}
 */
function priceArtifact(a) {
  const annualRunRate = a.platformAnnualUsd + a.ingestionAnnualUsd + a.controlAnnualUsd + a.governanceAnnualUsd;
  const grown = growAcross(annualRunRate, a.annualGrowthPct, a.horizonYears);
  const yearOne = annualRunRate + a.oneTimeInvestmentUsd;
  return {
    annualRunRate,
    yearOne,
    finalYear: grown.finalYear,
    horizonTotal: grown.total + a.oneTimeInvestmentUsd,
    headroom: a.annualBudgetUsd - yearOne,
    finalYearHeadroom: a.annualBudgetUsd - grown.finalYear,
    ceilingUtilisationPct: (yearOne / a.annualBudgetUsd) * 100,
    costPerQueryYearOne: yearOne / a.queriesPerYear,
    costPerQueryFinalYear: grown.finalYear / a.queriesPerYear,
    oneTimeSharePct: (a.oneTimeInvestmentUsd / yearOne) * 100,
    governanceSharePct: (a.governanceAnnualUsd / annualRunRate) * 100,
  };
}

/**
 * Computed lines for the Final Project Artifact.
 *
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Line[]}
 */
function artifactLines(a) {
  const f = /** @type {Record<string, number>} */ (a.f);
  return [
    line("Case organization", String(a.caseOrganization), "The organization assigned in Week 1, carried through every module to the Live Defense."),
    line("Annual run rate", usd(f.annualRunRate), "Platform, ingestion, control, and governance. What the recommendation costs every year, forever, excluding the one-time investment."),
    line("Year one total", usd(f.yearOne), "Run rate plus the one-time investment. This is the figure the ceiling is tested against."),
    line("Ceiling verdict", f.headroom >= 0 ? "Inside the ceiling" : "Breaches the ceiling", "The syllabus is explicit: exceed the stated annual budget ceiling and the artifact fails."),
    line("Headroom in year one", usd(f.headroom), "Ceiling minus the year-one total. Negative is the amount by which the artifact fails."),
    line("Ceiling utilisation in year one", num(f.ceilingUtilisationPct, 1, "percent"), "How much of the ceiling year one consumes. Above about 95 percent there is no room for a price change you do not control."),
    line("One-time share of year one", num(f.oneTimeSharePct, 1, "percent"), "How much of the worst year is spend that does not recur. A high share means year one misrepresents the commitment."),
    line("Governance share of the run rate", num(f.governanceSharePct, 1, "percent"), "Governance against everything recurring. Carried from Module 3 and usually the largest single stream."),
    line("Final-year run rate", usd(f.finalYear), "The run rate after growth compounds across the horizon."),
    line("Headroom in the final year", usd(f.finalYearHeadroom), "The same ceiling against the final-year run rate. This is the figure a reviewer checks second."),
    line("Total cost of ownership across the horizon", usd(f.horizonTotal), "Every year grown and added, plus the one-time investment. The headline number of the artifact."),
    line("Cost per query in year one", money(f.costPerQueryYearOne), "The artifact denominated in the unit a business owner recognizes."),
    line("Cost per query in the final year", money(f.costPerQueryFinalYear), "If this falls while total spend rises, the platform is getting more efficient. Say so explicitly, because the total will not."),
    line("Architecture considered and rejected", String(a.rejectedArchitecture), "Required by the syllabus. It must be an option you actually costed, not a straw man."),
    line("Reason for rejection", String(a.rejectionReason), "One clause, as the syllabus requires. Enforced above at 180 characters and one sentence."),
    line("Recommendation most likely to be wrong", String(a.mostLikelyWrong), "Required by the syllabus. Naming it costs nothing and is the strongest evidence that the reasoning is yours."),
    line("Evidence that would change your mind", String(a.disconfirmingEvidence), "The observation that reverses the decision above. A recommendation with no reversal condition is a bet, not a plan."),
  ];
}

/**
 * Echoed assumptions for the Final Project Artifact.
 *
 * @param {Record<string, number>} a
 * @returns {import("./kit.js").Line[]}
 */
function artifactAssumptions(a) {
  return [
    line("Platform run rate after the cut (Module 2)", usd(a.platformAnnualUsd), "Week 5 total spend minus the Week 5 saving, carried forward rather than recomputed."),
    line("Ingestion, annual (Module 2)", usd(a.ingestionAnnualUsd), "The Week 6 path you chose, at its full annual cost."),
    line("Reliability control, annual (Module 2)", usd(a.controlAnnualUsd), "The Week 7 control you would fund, at steady state."),
    line("Governance, annual (Module 3)", usd(a.governanceAnnualUsd), "Staffing, privacy programme, retrieval corpus, and agent reads."),
    line("One-time investment (Modules 1 and 3)", usd(a.oneTimeInvestmentUsd), "Privacy build, AI Act readiness, and any ingestion build. Lands entirely in year one."),
    line("Annual budget ceiling", usd(a.annualBudgetUsd), "The constraint the artifact fails against. Stated before the design, and it does not grow."),
    line("Annual growth", num(a.annualGrowthPct, 0, "percent"), "Applied to every recurring stream. One rate across four streams is a simplification you should name."),
    line("Queries per year", Number(a.queriesPerYear).toLocaleString("en-US"), "The denominator for both cost-per-query figures."),
    line("Horizon", num(a.horizonYears, 0, "years"), "Three years, as the Final Project Artifact requires."),
  ];
}

/**
 * Warnings for the Final Project Artifact.
 *
 * @param {Record<string, unknown>} a
 * @returns {string[]}
 */
function artifactWarnings(a) {
  const f = /** @type {Record<string, number>} */ (a.f);
  const horizonYears = Number(a.horizonYears);
  const warnings = [];
  if (f.headroom < 0) {
    warnings.push(`Year one exceeds the stated annual budget ceiling by ${usd(Math.abs(f.headroom))}. The syllabus is explicit that this fails the artifact. Change the recommendation or change the ceiling with the budget holder, but do not submit both.`);
  }
  if (f.headroom >= 0 && f.finalYearHeadroom < 0) {
    warnings.push(`Year one is inside the ceiling and year ${num(horizonYears, 0, "")} exceeds it by ${usd(Math.abs(f.finalYearHeadroom))}. A plan that fails inside its own horizon needs the year it fails named in the artifact, not discovered in the defense.`);
  }
  if (f.headroom >= 0 && f.ceilingUtilisationPct > 95) {
    warnings.push("Year one uses over 95 percent of the ceiling. There is no room for a vendor price increase, and you do not control vendor prices.");
  }
  if (f.oneTimeSharePct > 40) {
    warnings.push("Over 40 percent of year one is one-time spend. Compare against the run rate rather than year one, or the recommendation will look more expensive than the commitment it actually makes.");
  }
  if (f.governanceSharePct > 50) {
    warnings.push("Governance is more than half the recurring cost. State plainly in the artifact that this is a compliance-led platform, because a reader who expects an infrastructure budget will read the total as an error.");
  }
  return warnings;
}

/**
 * Charts for the Final Project Artifact.
 *
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Visual[]}
 */
function artifactVisuals(a) {
  const f = /** @type {Record<string, number>} */ (a.f);
  const oneTime = Number(a.oneTimeInvestmentUsd);
  const growth = Number(a.annualGrowthPct);
  const horizonYears = Number(a.horizonYears);
  return [
    stackChart(
      "The three-year cost of ownership, by stream",
      "USD per year",
      "Four recurring streams and one one-time investment. The stream that dominates is where your defense will be attacked.",
      [
        point("Year one", Number(a.platformAnnualUsd), usd(Number(a.platformAnnualUsd)), "Platform"),
        point("Year one", Number(a.ingestionAnnualUsd), usd(Number(a.ingestionAnnualUsd)), "Ingestion"),
        point("Year one", Number(a.controlAnnualUsd), usd(Number(a.controlAnnualUsd)), "Reliability control"),
        point("Year one", Number(a.governanceAnnualUsd), usd(Number(a.governanceAnnualUsd)), "Governance"),
        point("Year one", oneTime, usd(oneTime), "One-time investment"),
      ]
    ),
    gaugeChart(
      "Year-one total against the budget ceiling",
      "USD",
      "Exceeding the ceiling fails the artifact. The one-time investment lands entirely in this bar.",
      point("Year one total", f.yearOne, usd(f.yearOne)),
      { label: "Annual budget ceiling", value: Number(a.annualBudgetUsd) }
    ),
    barChart(
      "Total by year against the ceiling",
      "USD per year",
      "The ceiling is flat and the run rate is not. Find the year they cross before a reviewer does.",
      Array.from({ length: horizonYears }, (_unused, index) => {
        const runRate = f.annualRunRate * (1 + growth / 100) ** index;
        const value = index === 0 ? runRate + oneTime : runRate;
        return point(`Year ${String(index + 1)}`, value, usd(value));
      })
    ),
  ];
}

export { ARCHITECTURE_PATHS, AI_ACT_ROLES, AUTH_METHODS, INGESTION_PATHS, OPERATING_MODELS, PRIVACY_PATHS, TABLE_FORMATS };
