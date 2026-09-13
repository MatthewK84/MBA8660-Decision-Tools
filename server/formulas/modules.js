/**
 * Formula specifications for the module deliverables and the Final Project
 * Artifact, mirroring server/tools/modules.js.
 *
 * Every module grows an annual figure across a horizon. That is written once,
 * here, as the closed form of a geometric series rather than as a column of
 * years, so the workbook holds it in a single cell a student can read:
 *
 *   total = annual x ((1 + g)^h - 1) / g
 *
 * The zero-growth branch exists because the series divides by the growth rate.
 * Spreading the same total across a row of year columns would hide the horizon
 * and the growth rate inside the layout, which is exactly where an assumption
 * should never be.
 */

import { input, output, spec, unmodelled } from "./kit.js";

/**
 * The three-year total of one annual figure, grown.
 *
 * @param {string} annualKey
 * @param {string} growthKey
 * @param {string} horizonKey
 * @returns {(ref: import("./kit.js").RefFn) => string}
 */
function horizonTotalExpr(annualKey, growthKey, horizonKey) {
  return (r) =>
    `IF(${r(growthKey)}=0,${r(annualKey)}*${r(horizonKey)},${r(annualKey)}*((1+${r(growthKey)}/100)^${r(horizonKey)}-1)/(${r(growthKey)}/100))`;
}

/**
 * The final year's figure, grown across the horizon.
 *
 * @param {string} annualKey
 * @param {string} growthKey
 * @param {string} horizonKey
 * @returns {(ref: import("./kit.js").RefFn) => string}
 */
function finalYearExpr(annualKey, growthKey, horizonKey) {
  return (r) => `${r(annualKey)}*(1+${r(growthKey)}/100)^(${r(horizonKey)}-1)`;
}

/** @type {import("./kit.js").FormulaSpec} */
export const MODULE_1_SPEC = spec({
  slug: "module-1-architecture",
  week: 13,
  title: "Module 1: Platform Architecture Recommendation",
  sheetName: "Module 1",
  inputs: [
    input("caseOrganization", "Case organization", "", "The organization every figure belongs to.", "text"),
    input("architecturePath", "Architecture path", "", "The Week 1 recommendation: single node or distributed.", "text"),
    input("tableFormat", "Table format", "", "The Week 2 recommendation.", "text"),
    input("catalogChoice", "Catalog", "", "The Week 3 recommendation.", "text"),
    input("engineChoice", "Engine", "", "The Week 4 recommendation.", "text"),
    input("workingSetYearThreeGib", "Year-three working set", "GiB", "Carried from Week 1, grown at your stated rate."),
    input("singleNodeCeilingGib", "Single-node memory ceiling", "GiB", "The largest single machine you are willing to rent."),
    input("exitCostUsd", "Priced exit cost", "USD", "Rewrite compute plus egress, from Week 2."),
    input("catalogAnnualUsd", "Catalog annual cost", "USD per year", "Week 3 objects and requests, plus the licence or self-hosting salary."),
    input("engineAnnualUsd", "Engine annual cost", "USD per year", "Compute after any committed-use discount, from Week 4."),
    input("storageAnnualUsd", "Storage annual cost", "USD per year", "From Week 4. It grows whether or not anyone queries."),
    input("annualBudgetUsd", "Annual budget ceiling", "USD per year", "The constraint the artifact fails against. It does not grow."),
    input("annualGrowthPct", "Annual growth", "percent", "Compounded across the horizon."),
    input("queriesPerYear", "Queries per year", "queries", "The denominator for cost per query."),
    input("horizonYears", "Horizon", "years", "Three, to match the Final Project Artifact."),
  ],
  constants: [],
  outputs: [
    output("headroomRatio", "Single-node headroom in year three", "x", (r) => `${r("singleNodeCeilingGib")}/${r("workingSetYearThreeGib")}`, {
      match: "Single-node headroom in year three",
      note: "Below 1.0 the single-node path has run out of capacity, which decides the architecture for you.",
    }),
    output("platformAnnual", "Platform run rate", "USD per year", (r) => `${r("engineAnnualUsd")}+${r("storageAnnualUsd")}+${r("catalogAnnualUsd")}`, {
      match: "Engine and storage and catalog, per year",
      format: "usd",
      note: "The three architecture layers added up, before anything Module 2 does to them.",
    }),
    output("catalogSharePct", "Catalog share of the platform bill", "percent", (r) => `${r("catalogAnnualUsd")}/${r("platformAnnual")}*100`, {
      match: "Catalog share of the platform bill",
      note: "The smallest line and the largest blast radius. Price is not a measure of importance.",
    }),
    output("costPerQuery", "Platform cost per query", "USD", (r) => `${r("platformAnnual")}/${r("queriesPerYear")}`, {
      match: "Platform cost per query",
      format: "money",
      note: "The run rate in the unit a business owner acts on.",
    }),
    output("finalYear", "Final-year platform cost", "USD per year", finalYearExpr("platformAnnual", "annualGrowthPct", "horizonYears"), {
      match: "Final-year platform cost",
      format: "usd",
      note: "The run rate after growth compounds. The ceiling it is measured against did not move.",
    }),
    output("horizonTotal", "Platform total across the horizon", "USD", horizonTotalExpr("platformAnnual", "annualGrowthPct", "horizonYears"), {
      match: "Platform total across the horizon",
      format: "usd",
      note: "The geometric series. Change the growth rate or the horizon and watch which one is deciding.",
    }),
    output("budgetRemaining", "Budget remaining in year one", "USD per year", (r) => `${r("annualBudgetUsd")}-${r("platformAnnual")}`, {
      match: "Budget remaining in year one",
      format: "usd",
      note: "Negative means the artifact fails before Module 2 adds anything.",
    }),
    output("ceilingUtilisationPct", "Ceiling utilisation in year one", "percent", (r) => `${r("platformAnnual")}/${r("annualBudgetUsd")}*100`, {
      match: "Ceiling utilisation in year one",
      note: "How much of the ceiling the architecture alone consumes.",
    }),
    output("exitMonths", "Priced exit, in months of run rate", "months", (r) => `${r("exitCostUsd")}/(${r("platformAnnual")}/12)`, {
      match: "Priced exit, in months of run rate",
      note: "The honest unit for a lock-in argument.",
    }),
    output("exitSharePct", "Priced exit as a share of the horizon total", "percent", (r) => `${r("exitCostUsd")}/${r("horizonTotal")}*100`, {
      match: "Priced exit as a share",
      note: "What leaving costs against what staying costs.",
    }),
  ],
  unmodelled: [
    unmodelled("Case organization", "A name, carried from Week 1. There is nothing to compute."),
    unmodelled("Architecture and format chosen", "The Week 1 and Week 2 decisions restated. Both are judgments the tools refused to make for you."),
    unmodelled("Catalog and engine", "The Week 3 and Week 4 decisions restated. The costs they imply are modelled; the choice is not."),
  ],
});

/** @type {import("./kit.js").FormulaSpec} */
export const MODULE_2_SPEC = spec({
  slug: "module-2-cost-model",
  week: 14,
  title: "Module 2: Cost Model and Reliability Review",
  sheetName: "Module 2",
  inputs: [
    input("controlName", "Reliability control", "", "The one control you would fund, from Week 7.", "text"),
    input("ingestionPath", "Ingestion path", "", "The Week 6 decision: build or buy.", "text"),
    input("platformAnnualUsd", "Total annual platform spend", "USD per year", "The whole platform bill Week 5 cut against."),
    input("annualSavingUsd", "Annual saving", "USD per year", "What the Week 5 cut plan removes, summed across categories."),
    input("targetReductionPct", "Target reduction", "percent", "The mandate. The syllabus sets it at 20 percent."),
    input("ingestionChosenAnnualUsd", "Chosen ingestion path, annual cost", "USD per year", "The Week 6 path you chose, at twelve months."),
    input("ingestionCountedAnnualUsd", "Ingestion already counted in platform spend", "USD per year", "The ingestion category inside Week 5's total."),
    input("breakEvenMonths", "Break-even", "months", "From Week 6. Compare it against the horizon before reading it as a verdict."),
    input("controlAnnualUsd", "Control steady-state annual cost", "USD per year", "Tooling plus operating effort, from Week 7."),
    input("exposureAvoidedUsd", "Exposure avoided", "USD per year", "Annual exposure times your estimated catch rate, from Week 7."),
    input("annualBudgetUsd", "Annual budget ceiling", "USD per year", "Unchanged from Module 1."),
    input("queriesPerYear", "Queries per year", "queries", "The denominator for cost per query."),
    input("annualGrowthPct", "Annual growth", "percent", "Applied to the operating run rate."),
    input("horizonYears", "Horizon", "years", "Three, to match the Final Project Artifact."),
  ],
  constants: [],
  outputs: [
    output("postCutAnnual", "Platform spend after the cut", "USD per year", (r) => `${r("platformAnnualUsd")}-${r("annualSavingUsd")}`, {
      match: "Platform spend after the cut",
      format: "usd",
      note: "Week 5 total minus the Week 5 saving. The starting point for everything below.",
    }),
    output("achievedReductionPct", "Reduction achieved", "percent", (r) => `${r("annualSavingUsd")}/${r("platformAnnualUsd")}*100`, {
      match: "Reduction achieved",
      note: "The saving as a share of total spend, against the mandate.",
    }),
    output("ingestionDelta", "Ingestion delta against what was already counted", "USD per year", (r) => `${r("ingestionChosenAnnualUsd")}-${r("ingestionCountedAnnualUsd")}`, {
      match: "Ingestion delta against what was already counted",
      format: "usd",
      note: "The line that prevents double counting. Negative releases spend, positive adds it.",
    }),
    output("controlAnnual", "Reliability control, per year", "USD per year", (r) => `${r("controlAnnualUsd")}`, {
      match: "Reliability control, per year",
      format: "usd",
      note: "New spend rather than reconciled spend, so it is added rather than netted.",
    }),
    output("operationsAnnual", "Operating run rate", "USD per year", (r) => `${r("postCutAnnual")}+${r("ingestionDelta")}+${r("controlAnnual")}`, {
      match: "Operating run rate",
      format: "usd",
      note: "What Module 3 and the Final Artifact carry forward.",
    }),
    output("netAgainstBaseline", "Net change against the Week 5 baseline", "USD per year", (r) => `${r("platformAnnualUsd")}-${r("operationsAnnual")}`, {
      match: "Net change against the Week 5 baseline",
      format: "usd",
      note: "What the whole module actually moved, control included.",
    }),
    output("controlFundedBySavingPct", "Share of the cut consumed by the control", "percent", (r) => `${r("controlAnnual")}/${r("annualSavingUsd")}*100`, {
      match: "Share of the cut consumed by the control",
      note: "Above 100 percent the cut funded the control and nothing else.",
    }),
    output("netReliabilityPosition", "Net reliability position", "USD per year", (r) => `${r("exposureAvoidedUsd")}-${r("controlAnnual")}`, {
      match: "Net reliability position",
      format: "usd",
      note: "Positive is not the same as fundable, and it never was.",
    }),
    output("costPerQuery", "Operating cost per query", "USD", (r) => `${r("operationsAnnual")}/${r("queriesPerYear")}`, {
      match: "Operating cost per query",
      format: "money",
      note: "Compare it against the Module 1 figure to see what this module bought.",
    }),
    output("finalYear", "Final-year operating run rate", "USD per year", finalYearExpr("operationsAnnual", "annualGrowthPct", "horizonYears"), {
      match: "Final-year operating run rate",
      format: "usd",
      note: "The cut was a one-time step down on a curve that keeps rising.",
    }),
    output("horizonTotal", "Operating total across the horizon", "USD", horizonTotalExpr("operationsAnnual", "annualGrowthPct", "horizonYears"), {
      match: "Operating total across the horizon",
      format: "usd",
      note: "Every year grown and added. Carried into the Final Project Artifact.",
    }),
    output("budgetRemaining", "Budget remaining in year one", "USD per year", (r) => `${r("annualBudgetUsd")}-${r("operationsAnnual")}`, {
      match: "Budget remaining in year one",
      format: "usd",
      note: "Governance is still to come in Module 3.",
    }),
    output("ceilingUtilisationPct", "Ceiling utilisation in year one", "percent", (r) => `${r("operationsAnnual")}/${r("annualBudgetUsd")}*100`, {
      match: "Ceiling utilisation in year one",
      note: "How much of the ceiling operations consume before any governance cost is counted.",
    }),
  ],
  unmodelled: [
    unmodelled("Reliability control funded", "A name, carried from Week 7. Its cost is modelled; the choice of which control to fund is not."),
    unmodelled("Ingestion path chosen", "The Week 6 decision restated. The delta it produces is modelled on the row below."),
  ],
});

/** @type {import("./kit.js").FormulaSpec} */
export const MODULE_3_SPEC = spec({
  slug: "module-3-governance",
  week: 15,
  title: "Module 3: Governance and Regulatory Exposure Assessment",
  sheetName: "Module 3",
  inputs: [
    input("operatingModel", "Operating model", "", "The Week 8 decision: centralized or federated.", "text"),
    input("privacyPath", "Privacy path", "", "The Week 9 decision: one national standard or state by state.", "text"),
    input("aiActRole", "Role under the AI Act", "", "The Week 10 classification.", "text"),
    input("agentAuthMethod", "Agent authentication method", "", "The Week 12 decision.", "text"),
    input("agentPersonalDataGrant", "Agent grant over personal data", "", "Whether the agent may read tables containing personal data.", "text"),
    input("staffingAnnualUsd", "Governance staffing, annual", "USD per year", "Fully loaded headcount cost for the operating model you chose."),
    input("privacyBuildUsd", "Privacy programme build", "USD", "One-time cost of the Week 9 path you chose."),
    input("privacyAnnualUsd", "Privacy programme, annual", "USD per year", "Ongoing programme cost on that same path."),
    input("aiActReadinessUsd", "AI Act readiness cost", "USD", "Readiness hours times a blended rate, from Week 10."),
    input("daysToAnnexIii", "Days until Annex III applies", "days", "From the Week 10 timeline."),
    input("ragAnnualUsd", "Retrieval corpus, annual", "USD per year", "Embedding plus vector storage plus answer generation, from Week 11."),
    input("deletionSlaDays", "Deletion request SLA", "days", "What you have promised, statutorily or contractually."),
    input("reindexIntervalDays", "Reindex interval", "days", "How often the index is rebuilt."),
    input("agentAnnualUsd", "Agent read spend, annual", "USD per year", "From Week 12, at the same per-TB rate a human pays."),
    input("operationsAnnualUsd", "Operating run rate from Module 2", "USD per year", "The denominator for every share on this sheet."),
    input("horizonYears", "Horizon", "years", "Three, to match the Final Project Artifact."),
  ],
  constants: [],
  outputs: [
    output("governanceAnnual", "Governance run rate", "USD per year", (r) => `${r("staffingAnnualUsd")}+${r("privacyAnnualUsd")}+${r("ragAnnualUsd")}+${r("agentAnnualUsd")}`, {
      match: "Governance run rate",
      format: "usd",
      note: "The recurring cost of being allowed to operate.",
    }),
    output("staffingSharePct", "Staffing share of governance", "percent", (r) => `${r("staffingAnnualUsd")}/${r("governanceAnnual")}*100`, {
      match: "Staffing share of governance",
      note: "Governance is an organizational decision priced as an architectural one.",
    }),
    output("oneTime", "One-time readiness investment", "USD", (r) => `${r("privacyBuildUsd")}+${r("aiActReadinessUsd")}`, {
      match: "One-time readiness investment",
      format: "usd",
      note: "Paid once, in year one, on top of the run rate.",
    }),
    output("horizonTotal", "Governance total across the horizon", "USD", (r) => `${r("governanceAnnual")}*${r("horizonYears")}+${r("oneTime")}`, {
      match: "Governance total across the horizon",
      format: "usd",
      note: "Run rate times the horizon plus the one-time investment. Held flat deliberately: staffing does not compound the way a query bill does.",
    }),
    output("governanceSharePct", "Governance as a share of total run rate", "percent", (r) => `${r("governanceAnnual")}/(${r("governanceAnnual")}+${r("operationsAnnualUsd")})*100`, {
      match: "Governance as a share of total run rate",
      note: "Above 50 percent the platform is the cheaper half of the platform.",
    }),
    output("governanceMultiple", "Governance per dollar of operations", "x", (r) => `${r("governanceAnnual")}/${r("operationsAnnualUsd")}`, {
      match: "Governance per dollar of operations",
      note: "State whether your organization knows this ratio.",
    }),
    output("weeksToAnnexIii", "Weeks until Annex III applies", "weeks", (r) => `${r("daysToAnnexIii")}/7`, {
      match: "Weeks until Annex III applies",
      note: "Working time remaining before the deferred high-risk obligations take effect.",
    }),
    output("readinessPerWeek", "Readiness spend per remaining week", "USD per week", (r) => `${r("aiActReadinessUsd")}/${r("weeksToAnnexIii")}`, {
      match: "Readiness spend per remaining week",
      format: "usd",
      note: "If nobody has budgeted this, the deferral bought less than it appeared to.",
    }),
    output("deletionGapDays", "Deletion promise against reindex interval", "days", (r) => `${r("deletionSlaDays")}-${r("reindexIntervalDays")}`, {
      match: "Deletion promise against reindex interval",
      note: "Positive means deleted records stay retrievable past the date you promised they would be gone.",
    }),
  ],
  unmodelled: [
    unmodelled("Operating model", "The Week 8 decision restated. Its staffing cost is modelled on the rows below."),
    unmodelled("Privacy path", "The Week 9 decision restated. Its build and annual costs are modelled."),
    unmodelled("Role under the AI Act", "A classification, not a calculation. Provider obligations are heavier, and which one you are is a legal judgment."),
    unmodelled("Agent authentication and scope", "The Week 12 decision restated. The exposure window it implies is a property of the method, not arithmetic."),
  ],
});

/** @type {import("./kit.js").FormulaSpec} */
export const FINAL_ARTIFACT_SPEC = spec({
  slug: "final-project",
  week: 16,
  title: "Final Project Artifact",
  sheetName: "Final Project",
  inputs: [
    input("caseOrganization", "Case organization", "", "Assigned in Week 1, carried through every module.", "text"),
    input("platformAnnualUsd", "Platform run rate after the cut", "USD per year", "From Module 2, carried forward rather than recomputed."),
    input("ingestionAnnualUsd", "Ingestion, annual", "USD per year", "The Week 6 path you chose, at its full annual cost."),
    input("controlAnnualUsd", "Reliability control, annual", "USD per year", "The Week 7 control you would fund, at steady state."),
    input("governanceAnnualUsd", "Governance, annual", "USD per year", "From Module 3."),
    input("oneTimeInvestmentUsd", "One-time investment", "USD", "Privacy build, AI Act readiness, and any ingestion build. Lands entirely in year one."),
    input("annualBudgetUsd", "Annual budget ceiling", "USD per year", "The constraint the artifact fails against. It does not grow."),
    input("annualGrowthPct", "Annual growth", "percent", "Applied to every recurring stream."),
    input("queriesPerYear", "Queries per year", "queries", "The denominator for both cost-per-query figures."),
    input("horizonYears", "Horizon", "years", "Three, as the Final Project Artifact requires."),
    input("rejectedArchitecture", "Architecture considered and rejected", "", "Required by the syllabus. An option you actually costed.", "text"),
    input("rejectionReason", "Reason for rejection", "", "One clause, as the syllabus requires.", "text"),
    input("mostLikelyWrong", "Recommendation most likely to be wrong", "", "Required by the syllabus.", "text"),
    input("disconfirmingEvidence", "Evidence that would change your mind", "", "The observation that reverses the decision above.", "text"),
  ],
  constants: [],
  outputs: [
    output("annualRunRate", "Annual run rate", "USD per year", (r) => `${r("platformAnnualUsd")}+${r("ingestionAnnualUsd")}+${r("controlAnnualUsd")}+${r("governanceAnnualUsd")}`, {
      match: "Annual run rate",
      format: "usd",
      note: "What the recommendation costs every year, forever, excluding the one-time investment.",
    }),
    output("yearOne", "Year one total", "USD", (r) => `${r("annualRunRate")}+${r("oneTimeInvestmentUsd")}`, {
      match: "Year one total",
      format: "usd",
      note: "Run rate plus the one-time investment. The figure the ceiling is tested against.",
    }),
    output("ceilingVerdict", "Ceiling verdict", "", (r) => `IF(${r("annualBudgetUsd")}-${r("yearOne")}>=0,"Inside the ceiling","Breaches the ceiling")`, {
      match: "Ceiling verdict",
      format: "text",
      note: "The syllabus is explicit: exceed the stated annual budget ceiling and the artifact fails.",
    }),
    output("headroom", "Headroom in year one", "USD", (r) => `${r("annualBudgetUsd")}-${r("yearOne")}`, {
      match: "Headroom in year one",
      format: "usd",
      note: "Negative is the amount by which the artifact fails.",
    }),
    output("ceilingUtilisationPct", "Ceiling utilisation in year one", "percent", (r) => `${r("yearOne")}/${r("annualBudgetUsd")}*100`, {
      match: "Ceiling utilisation in year one",
      note: "Above about 95 percent there is no room for a price change you do not control.",
    }),
    output("oneTimeSharePct", "One-time share of year one", "percent", (r) => `${r("oneTimeInvestmentUsd")}/${r("yearOne")}*100`, {
      match: "One-time share of year one",
      note: "A high share means year one misrepresents the commitment.",
    }),
    output("governanceSharePct", "Governance share of the run rate", "percent", (r) => `${r("governanceAnnualUsd")}/${r("annualRunRate")}*100`, {
      match: "Governance share of the run rate",
      note: "Carried from Module 3 and usually the largest single stream.",
    }),
    output("finalYear", "Final-year run rate", "USD per year", finalYearExpr("annualRunRate", "annualGrowthPct", "horizonYears"), {
      match: "Final-year run rate",
      format: "usd",
      note: "The run rate after growth compounds across the horizon.",
    }),
    output("finalYearHeadroom", "Headroom in the final year", "USD", (r) => `${r("annualBudgetUsd")}-${r("finalYear")}`, {
      match: "Headroom in the final year",
      format: "usd",
      note: "The same ceiling against the final-year run rate. The figure a reviewer checks second.",
    }),
    output("horizonTotal", "Total cost of ownership across the horizon", "USD", (r) => {
      const grown = horizonTotalExpr("annualRunRate", "annualGrowthPct", "horizonYears")(r);
      return `${grown}+${r("oneTimeInvestmentUsd")}`;
    }, {
      match: "Total cost of ownership across the horizon",
      format: "usd",
      note: "Every year grown and added, plus the one-time investment. The headline number of the artifact.",
    }),
    output("costPerQueryYearOne", "Cost per query in year one", "USD", (r) => `${r("yearOne")}/${r("queriesPerYear")}`, {
      match: "Cost per query in year one",
      format: "money",
      note: "The artifact denominated in the unit a business owner recognizes.",
    }),
    output("costPerQueryFinalYear", "Cost per query in the final year", "USD", (r) => `${r("finalYear")}/${r("queriesPerYear")}`, {
      match: "Cost per query in the final year",
      format: "money",
      note: "If this falls while total spend rises, the platform is getting more efficient. Say so, because the total will not.",
    }),
  ],
  unmodelled: [
    unmodelled("Case organization", "A name, carried from Week 1."),
    unmodelled("Architecture considered and rejected", "A judgment the syllabus requires in writing, because a model cannot supply it on your behalf."),
    unmodelled("Reason for rejection", "One clause of reasoning. The tool checks its length and that it is one sentence; it cannot check that it is true."),
    unmodelled("Recommendation most likely to be wrong", "The judgment that distinguishes an artifact from a spreadsheet. No arithmetic produces it."),
    unmodelled("Evidence that would change your mind", "A reversal condition, stated in advance. It is monitored, not computed."),
  ],
});
