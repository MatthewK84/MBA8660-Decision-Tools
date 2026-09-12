/**
 * Formula specifications for Weeks 5 to 7, mirroring server/tools/economics.js.
 *
 * Week 5 has five spend categories and five cut percentages, so the cells are
 * generated rather than typed out. Generating them keeps the category list in
 * one place: add a category to the tool and the sheet follows.
 */

import { constant, input, output, spec, unmodelled } from "./kit.js";
import { CUT_CATEGORIES } from "../tools/economics.js";

/**
 * The spend and cut input cells for every category.
 *
 * @returns {import("./kit.js").InputCell[]}
 */
function categoryInputs() {
  const spend = CUT_CATEGORIES.map((category) =>
    input(`spend${category}`, `${category} annual spend`, "USD", `Current annual ${category.toLowerCase()} spend, from the invoice rather than the budget.`)
  );
  const cuts = CUT_CATEGORIES.map((category) =>
    input(`cut${category}`, `${category} cut`, "percent", `Share of ${category.toLowerCase()} you propose to remove.`)
  );
  return [...spend, ...cuts];
}

/**
 * One saving figure per category, plus the two totals they feed.
 *
 * @returns {import("./kit.js").OutputCell[]}
 */
function categoryOutputs() {
  const saved = CUT_CATEGORIES.map((category) =>
    output(`saved${category}`, `${category} saving`, "USD per year", (r) => `${r(`spend${category}`)}*${r(`cut${category}`)}/100`, {
      match: `${category} saving`,
      format: "usd",
      note: `Spend times cut percentage. Compare this against how much the ${category.toLowerCase()} cut hurts.`,
    })
  );
  const sum = (prefix) => (r) => CUT_CATEGORIES.map((category) => r(`${prefix}${category}`)).join("+");
  return [
    output("totalSpend", "Total annual platform spend", "USD per year", sum("spend"), {
      match: "Total annual platform spend",
      format: "usd",
      note: "Every category added up. The number nobody can act on.",
    }),
    ...saved,
    output("totalSaved", "Total saving", "USD per year", sum("saved"), {
      match: "Total saving",
      format: "usd",
      note: "What this plan actually removes from next year's bill.",
    }),
  ];
}

/** @type {import("./kit.js").FormulaSpec} */
export const CUT_SPEC = spec({
  slug: "finops-cut",
  week: 5,
  title: "Spend Reduction and Unit Economics",
  inputs: [
    input("targetReductionPct", "Target reduction", "percent", "The mandate you were handed."),
    input("queriesPerYear", "Queries per year", "queries", "The denominator for cost per query."),
    input("activeUsers", "Monthly active users", "people", "The denominator for cost per user."),
    ...categoryInputs(),
  ],
  constants: [],
  outputs: [
    ...categoryOutputs(),
    output("spendAfter", "Spend after the cuts", "USD per year", (r) => `${r("totalSpend")}-${r("totalSaved")}`, {
      note: "The figure both unit-economics lines below are computed from.",
    }),
    output("achievedPct", "Reduction achieved", "percent", (r) => `${r("totalSaved")}/${r("totalSpend")}*100`, {
      match: "Reduction achieved",
      note: "Total saving as a share of total spend.",
    }),
    output("shortfall", "Gap to target", "USD per year", (r) => `IF(${r("targetReductionPct")}/100*${r("totalSpend")}-${r("totalSaved")}>0,${r("targetReductionPct")}/100*${r("totalSpend")}-${r("totalSaved")},"Target met")`, {
      match: "Gap to target",
      format: "usd",
      note: "What is still missing. A plan that is short is not a plan, it is a direction.",
    }),
    output("perQueryBefore", "Cost per query, before", "USD", (r) => `${r("totalSpend")}/${r("queriesPerYear")}`, {
      match: "Cost per query, before",
      format: "money",
      note: "This is the FinOps unit, not the total.",
    }),
    output("perQueryAfter", "Cost per query, after", "USD", (r) => `${r("spendAfter")}/${r("queriesPerYear")}`, {
      match: "Cost per query, after",
      format: "money",
    }),
    output("perUserBefore", "Cost per active user per year, before", "USD", (r) => `${r("totalSpend")}/${r("activeUsers")}`, {
      match: "Cost per active user per year, before",
      format: "money",
      note: "Denominates the platform in people rather than infrastructure.",
    }),
    output("perUserAfter", "Cost per active user per year, after", "USD", (r) => `${r("spendAfter")}/${r("activeUsers")}`, {
      match: "Cost per active user per year, after",
      format: "money",
    }),
  ],
});

/** @type {import("./kit.js").FormulaSpec} */
export const BUILD_VS_BUY_SPEC = spec({
  slug: "build-vs-buy",
  week: 6,
  title: "Build Versus Buy Break-Even",
  inputs: [
    input("vendorMonthlyUsd", "Vendor monthly price", "USD per month", "The quoted price, dated."),
    input("priceRetrievedAt", "Price retrieved on", "date", "An undated price is not evidence.", "date"),
    input("buildHours", "One-time build effort", "hours", "Engineering to first production use."),
    input("blendedHourlyUsd", "Blended hourly cost", "USD per hour", "Fully loaded, not salary divided by 2,080."),
    input("maintenanceHoursMonthly", "Maintenance effort", "hours per month", "The figure teams underestimate most."),
    input("buildInfraMonthlyUsd", "Infrastructure for the build", "USD per month", "A vendor price already includes theirs."),
    input("horizonMonths", "Evaluation horizon", "months", "It frequently decides the answer by itself."),
  ],
  constants: [],
  outputs: [
    output("buildUpfront", "One-time build cost", "USD", (r) => `${r("buildHours")}*${r("blendedHourlyUsd")}`, {
      match: "One-time build cost",
      format: "usd",
      note: "Paid once, before any value arrives.",
    }),
    output("buildMonthly", "Build running cost per month", "USD per month", (r) => `${r("maintenanceHoursMonthly")}*${r("blendedHourlyUsd")}+${r("buildInfraMonthlyUsd")}`, {
      match: "Build running cost per month",
      format: "usd",
      note: "Maintenance labour plus infrastructure. This recurs forever, unlike the build.",
    }),
    output("monthlyDelta", "Monthly saving from building", "USD per month", (r) => `${r("vendorMonthlyUsd")}-${r("buildMonthly")}`, {
      match: "Monthly saving from building",
      format: "usd",
      note: "If this is not positive, building never repays and the application prints None.",
    }),
    output("breakEvenMonths", "Break-even", "months", (r) => `IF(${r("monthlyDelta")}>0,${r("buildUpfront")}/${r("monthlyDelta")},"Never")`, {
      match: "Break-even",
      note: "The month cumulative build cost equals cumulative vendor cost.",
    }),
    output("maintenanceTotal", "Maintenance over the horizon", "USD", (r) => `${r("maintenanceHoursMonthly")}*${r("blendedHourlyUsd")}*${r("horizonMonths")}`, {
      format: "usd",
      note: "Charted in the application as part of what the build costs.",
    }),
    output("infraTotal", "Infrastructure over the horizon", "USD", (r) => `${r("buildInfraMonthlyUsd")}*${r("horizonMonths")}`, {
      format: "usd",
      note: "Charted in the application as part of what the build costs.",
    }),
    output("buildTotal", "Build total over the horizon", "USD", (r) => `${r("buildUpfront")}+${r("buildMonthly")}*${r("horizonMonths")}`, {
      match: "Build total over",
      format: "usd",
    }),
    output("vendorTotal", "Vendor total over the horizon", "USD", (r) => `${r("vendorMonthlyUsd")}*${r("horizonMonths")}`, {
      match: "Vendor total over",
      format: "usd",
      note: "Monthly price times the horizon, assuming the price holds.",
    }),
    output("difference", "Difference over the horizon", "USD", (r) => `ABS(${r("buildTotal")}-${r("vendorTotal")})`, {
      match: "Difference over the horizon",
      format: "usd",
      note: "The size of the bet you are making on your own maintenance estimate.",
    }),
  ],
});

/** @type {import("./kit.js").FormulaSpec} */
export const CONTROL_SPEC = spec({
  slug: "control-cost",
  week: 7,
  title: "Reliability Control Pricing",
  inputs: [
    input("controlName", "Control name", "", "One control, not a programme.", "text"),
    input("toolingAnnualUsd", "Annual tooling cost", "USD per year", "Licence or subscription."),
    input("setupHours", "Setup effort", "hours", "One-time integration, paid in year one only."),
    input("opsHoursMonthly", "Operating effort", "hours per month", "Tuning, triage, and acting on what it finds."),
    input("blendedHourlyUsd", "Blended hourly cost", "USD per hour", "Fully loaded cost of an engineering hour."),
    input("incidentCostUsd", "Cost of one incident", "USD", "Including the work to recover from it."),
    input("incidentsPerYear", "Expected incidents per year", "incidents", "From your own history or the assigned post-mortem."),
    input("catchRatePct", "Share of incidents caught", "percent", "What it would actually have caught."),
    input("detectionHoursBefore", "Hours to detect today", "hours", "The multiplier on every other cost."),
    input("detectionHoursAfter", "Hours to detect with the control", "hours", "What this control changes."),
  ],
  constants: [constant("monthsPerYear", "Months per year", 12, "months", "")],
  outputs: [
    output("steadyState", "Steady-state annual cost", "USD per year", (r) => `${r("toolingAnnualUsd")}+${r("opsHoursMonthly")}*${r("monthsPerYear")}*${r("blendedHourlyUsd")}`, {
      match: "Steady-state annual cost",
      format: "usd",
      note: "What it costs every year after the first. This is the number to compare against.",
    }),
    output("yearOne", "Year one cost", "USD", (r) => `${r("steadyState")}+${r("setupHours")}*${r("blendedHourlyUsd")}`, {
      match: "Year one cost",
      format: "usd",
      note: "Tooling plus setup plus a year of operating effort.",
    }),
    output("exposure", "Annual incident exposure", "USD per year", (r) => `${r("incidentCostUsd")}*${r("incidentsPerYear")}`, {
      match: "Annual incident exposure",
      format: "usd",
      note: "With no control in place.",
    }),
    output("avoided", "Exposure avoided", "USD per year", (r) => `${r("exposure")}*${r("catchRatePct")}/100`, {
      match: "Exposure avoided at",
      format: "usd",
      note: "Exposure this control removes, if your catch rate estimate holds.",
    }),
    output("net", "Net annual position", "USD per year", (r) => `${r("avoided")}-${r("steadyState")}`, {
      match: "Net annual position",
      format: "usd",
      note: "Positive is not the same as fundable.",
    }),
    output("incidentsCaught", "Incidents caught per year", "incidents", (r) => `${r("incidentsPerYear")}*${r("catchRatePct")}/100`, {
      note: "The denominator of the cost per incident caught below.",
    }),
    output("costPerIncidentCaught", "Cost per incident caught", "USD", (r) => `IF(${r("incidentsCaught")}=0,0,${r("steadyState")}/${r("incidentsCaught")})`, {
      match: "Cost per incident caught",
      format: "usd",
      note: "The unit economics of reliability.",
    }),
    output("detectionFactor", "Detection time factor", "x", (r) => `IF(${r("detectionHoursBefore")}=0,1,${r("detectionHoursAfter")}/${r("detectionHoursBefore")})`, {
      note: "How much shorter an incident runs once the control exists.",
    }),
    output("residualExposure", "Residual exposure after detection speed-up", "USD per year", (r) => `(${r("exposure")}-${r("avoided")})*${r("detectionFactor")}`, {
      match: "Residual exposure after detection speed-up",
      format: "usd",
      note: "Exposure from missed incidents, scaled by the shorter time they now run.",
    }),
  ],
  unmodelled: [
    unmodelled("Control", "Echoes the control you named."),
    unmodelled("Detection time change", "Restates two inputs as a sentence."),
  ],
});
