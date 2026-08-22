/**
 * Week 5 to Week 7 tools: platform economics and reliability.
 * Every export is a pure function. No I/O, no clock beyond an injected date.
 */

import {
  InputError,
  barChart,
  line,
  money,
  num,
  point,
  requirePositive,
  requireRange,
  requireRetrievalDate,
  requireText,
  stackChart,
  usd,
} from "./kit.js";
import { citation } from "../reference/rates.js";

const CUT_CATEGORIES = ["Storage", "Compute", "Ingestion", "Observability", "Licences"];

/**
 * Reads five category spend figures out of raw input.
 *
 * @param {Record<string, unknown>} input
 * @returns {{ category: string, spend: number }[]}
 */
function readCategorySpend(input) {
  return CUT_CATEGORIES.map((category) => {
    const key = `spend${category}`;
    return { category, spend: requirePositive(input[key], `${category} annual spend`) };
  });
}

/**
 * Reads the per-category cut percentages and checks they are in range.
 *
 * @param {Record<string, unknown>} input
 * @returns {{ category: string, cutPct: number }[]}
 */
function readCategoryCuts(input) {
  return CUT_CATEGORIES.map((category) => {
    const key = `cut${category}`;
    return { category, cutPct: requireRange(input[key], `${category} cut percent`, 0, 100) };
  });
}

/**
 * Pair spend against cuts, producing the saving for each category.
 *
 * @param {{ category: string, spend: number }[]} spend
 * @param {{ category: string, cutPct: number }[]} cuts
 * @returns {{ category: string, spend: number, saved: number, cutPct: number }[]}
 */
function applyCuts(spend, cuts) {
  return spend.map((s, i) => {
    const cut = cuts[i];
    if (cut === undefined) {
      throw new InputError("Cut percentages did not align with spend categories.");
    }
    return { category: s.category, spend: s.spend, saved: s.spend * (cut.cutPct / 100), cutPct: cut.cutPct };
  });
}

/**
 * Week 5. Simulates a spend reduction and restates the result in unit
 * economics, which is the form a budget conversation can actually use.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function simulateCut(input) {
  const targetPct = requireRange(input.targetReductionPct, "Target reduction percent", 1, 90);
  const queriesPerYear = requirePositive(input.queriesPerYear, "Queries per year");
  const activeUsers = requirePositive(input.activeUsers, "Monthly active users of the platform");
  const spend = readCategorySpend(input);
  const savings = applyCuts(spend, readCategoryCuts(input));

  const totalSpend = spend.reduce((sum, s) => sum + s.spend, 0);
  const totalSaved = savings.reduce((sum, s) => sum + s.saved, 0);
  const u = unitEconomics(totalSpend, totalSaved, queriesPerYear, activeUsers);
  const shortfall = (targetPct / 100) * totalSpend - totalSaved;

  return {
    computed: cutLines({ totalSpend, totalSaved, savings, u, shortfall }),
    assumptions: cutAssumptions({ targetPct, queriesPerYear, activeUsers, spend }),
    unresolved: [
      "For every category you cut above 20 percent, name what stops working and who notices first.",
      "Name the person who will object loudest to this plan, state their strongest argument, and say what you tell them.",
      "State which of these cuts is reversible within one quarter and which is not. Irreversible cuts need a higher bar.",
      "Cost per query fell. State whether that is efficiency or deferred maintenance, and say how a reader could tell the two apart from your numbers.",
    ],
    warnings: cutWarnings(targetPct, shortfall, savings),
    visuals: [
      stackChart(
        "Where the spend sits, and what survives the cut",
        "USD per year",
        "Percentages are misleading here. A 40 percent cut to the smallest category yields less than a 5 percent cut to the largest.",
        savings.flatMap((s) => [
          point(s.category, s.spend - s.saved, usd(s.spend - s.saved), "Remaining"),
          point(s.category, s.saved, usd(s.saved), "Cut"),
        ])
      ),
      barChart(
        "What each cut actually yields",
        "USD per year",
        "Rank the bars, then compare that ranking against the order in which the cuts hurt.",
        savings.map((s) => point(s.category, s.saved, usd(s.saved)))
      ),
    ],
  };
}

/**
 * Computed lines for Week 5.
 *
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Line[]}
 */
function cutLines(a) {
  const savings = /** @type {{ category: string, spend: number, saved: number, cutPct: number }[]} */ (a.savings);
  const u = /** @type {Record<string, number>} */ (a.u);
  const shortfall = Number(a.shortfall);
  return [
    line("Total annual platform spend", usd(Number(a.totalSpend)), "Every category added up. This is the number nobody can act on."),
    ...savings.map((s) => line(`${s.category} saving at ${num(s.cutPct, 0, "percent")}`, usd(s.saved), `Reduces ${s.category.toLowerCase()} from ${usd(s.spend)} to ${usd(s.spend - s.saved)}.`)),
    line("Total saving", usd(Number(a.totalSaved)), "What this plan actually removes from next year's bill."),
    line("Reduction achieved", num(u.achievedPct, 1, "percent"), "Total saving as a share of total spend."),
    line("Gap to target", shortfall > 0 ? usd(shortfall) : "Target met", "What is still missing. A plan that is short is not a plan, it is a direction."),
    line("Cost per query, before", money(u.perQueryBefore), "Total spend divided by annual query volume. This is the FinOps unit, not the total."),
    line("Cost per query, after", money(u.perQueryAfter), "The same figure after the cuts. This is what you report to a business owner."),
    line("Cost per active user per year, before", money(u.perUserBefore), "Denominates the platform in people rather than infrastructure."),
    line("Cost per active user per year, after", money(u.perUserAfter), "If spend grows but this figure falls, the platform is getting more efficient, not less disciplined."),
  ];
}

/**
 * Echoed assumptions for Week 5.
 *
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Line[]}
 */
function cutAssumptions(a) {
  const spend = /** @type {{ category: string, spend: number }[]} */ (a.spend);
  return [
    line("Target reduction", num(Number(a.targetPct), 0, "percent"), "The mandate you were handed."),
    line("Queries per year", Number(a.queriesPerYear).toLocaleString("en-US"), "The denominator for cost per query."),
    line("Monthly active users", Number(a.activeUsers).toLocaleString("en-US"), "The denominator for cost per user."),
    ...spend.map((s) => line(`${s.category} annual spend`, usd(s.spend), "")),
    line("Reference storage price", citation("objectStorageStandard"), "For sanity-checking whether your storage line is plausible for the bytes you hold."),
    line("Reference scan price", citation("scanPerTb"), "For sanity-checking whether your compute line matches your query volume."),
  ];
}

/**
 * Restate a total in per-query and per-user terms.
 *
 * @param {number} totalSpend
 * @param {number} totalSaved
 * @param {number} queriesPerYear
 * @param {number} activeUsers
 * @returns {Record<string, number>}
 */
function unitEconomics(totalSpend, totalSaved, queriesPerYear, activeUsers) {
  const after = totalSpend - totalSaved;
  return {
    achievedPct: (totalSaved / totalSpend) * 100,
    perQueryBefore: totalSpend / queriesPerYear,
    perQueryAfter: after / queriesPerYear,
    perUserBefore: totalSpend / activeUsers,
    perUserAfter: after / activeUsers,
  };
}

/**
 * Warnings for Week 5.
 *
 * @param {number} targetPct
 * @param {number} shortfall
 * @param {{ category: string, cutPct: number }[]} savings
 * @returns {string[]}
 */
function cutWarnings(targetPct, shortfall, savings) {
  const warnings = [];
  if (shortfall > 0) {
    warnings.push(`This plan is ${usd(shortfall)} short of the ${num(targetPct, 0, "percent")} target.`);
  }
  const observability = savings.find((s) => s.category === "Observability");
  if (observability !== undefined && observability.cutPct > 50) {
    warnings.push("Cutting observability above 50 percent reduces your ability to detect the failures Week 7 asks you to control.");
  }
  const storage = savings.find((s) => s.category === "Storage");
  if (storage !== undefined && storage.cutPct > 40) {
    warnings.push("Storage cuts above 40 percent usually mean deletion or archival tiering. Both have retention and retrieval consequences. Check Weeks 9 and 11.");
  }
  return warnings;
}

/**
 * Week 6. Computes the break-even month between building and buying, counting
 * the infrastructure a built system also has to run on.
 *
 * @param {Record<string, unknown>} input
 * @param {Date} now
 * @returns {import("./kit.js").ToolResult}
 */
export function breakEven(input, now) {
  const vendorMonthly = requirePositive(input.vendorMonthlyUsd, "Vendor monthly price");
  const retrievedAt = requireRetrievalDate(input.priceRetrievedAt, "Price retrieval date", now);
  const buildHours = requirePositive(input.buildHours, "One-time build hours");
  const hourlyRate = requirePositive(input.blendedHourlyUsd, "Blended hourly cost");
  const maintHoursMonthly = requirePositive(input.maintenanceHoursMonthly, "Monthly maintenance hours");
  const infraMonthly = requirePositive(input.buildInfraMonthlyUsd, "Monthly infrastructure cost of the built system");
  const horizon = requireRange(input.horizonMonths, "Evaluation horizon in months", 6, 60);

  const b = priceBuildVsBuy({ vendorMonthly, buildHours, hourlyRate, maintHoursMonthly, infraMonthly, horizon });

  return {
    computed: buildVsBuyLines(b, horizon),
    assumptions: [
      line("Vendor monthly price", usd(vendorMonthly), "The quoted price, dated. Not the price you remember from a conference."),
      line("Price retrieved on", retrievedAt, "The syllabus requires a dated price. An undated price is not evidence."),
      line("Build effort", num(buildHours, 0, "hours"), "One-time engineering to first production use. Excludes the second system you build when the first is wrong."),
      line("Blended hourly cost", usd(hourlyRate), "Fully loaded, not salary divided by 2,080."),
      line("Maintenance effort", num(maintHoursMonthly, 0, "hours per month"), "Ongoing engineering after launch. The figure teams underestimate most."),
      line("Infrastructure for the built system", usd(infraMonthly), `Servers, storage, and network the build runs on. For scale, ${citation("computeWorkerNode")}.`),
      line("Evaluation horizon", num(horizon, 0, "months"), "The window over which you are comparing. It often decides the answer by itself."),
    ],
    unresolved: [
      "Break-even is one number resting on your maintenance estimate. State that estimate's source and what break-even becomes if maintenance doubles.",
      "This model prices engineering time and infrastructure. Name one cost of building that it still omits.",
      "Name the single assumption the answer hinges on, in one clause, as the final artifact requires.",
      "State what you would have to see, and by when, to reverse this decision. A decision with no reversal condition is a bet, not a plan.",
    ],
    warnings: breakEvenWarnings(b, horizon),
    visuals: [
      barChart(
        `Total cost of each path over ${num(horizon, 0, "months")}`,
        "USD",
        "Two totals over one stated horizon. Change the horizon and the ranking can flip, which is the point of stating it.",
        [
          point("Build", b.buildTotal, usd(b.buildTotal)),
          point("Buy", b.vendorTotal, usd(b.vendorTotal)),
        ]
      ),
      stackChart(
        "What the build actually costs",
        "USD over the horizon",
        "The up-front number is the one that gets debated. The recurring two are the ones that decide it.",
        [
          point("One-time build", b.buildUpfront, usd(b.buildUpfront), "Build"),
          point("Maintenance", b.maintenanceTotal, usd(b.maintenanceTotal), "Build"),
          point("Infrastructure", b.infraTotal, usd(b.infraTotal), "Build"),
        ]
      ),
    ],
  };
}

/**
 * Price both sides of the build versus buy question.
 *
 * @param {{ vendorMonthly: number, buildHours: number, hourlyRate: number, maintHoursMonthly: number, infraMonthly: number, horizon: number }} a
 * @returns {Record<string, number>}
 */
function priceBuildVsBuy(a) {
  const buildUpfront = a.buildHours * a.hourlyRate;
  const buildMonthly = a.maintHoursMonthly * a.hourlyRate + a.infraMonthly;
  const monthlyDelta = a.vendorMonthly - buildMonthly;
  return {
    buildUpfront,
    buildMonthly,
    monthlyDelta,
    breakEvenMonths: monthlyDelta > 0 ? buildUpfront / monthlyDelta : Number.POSITIVE_INFINITY,
    buildTotal: buildUpfront + buildMonthly * a.horizon,
    vendorTotal: a.vendorMonthly * a.horizon,
    maintenanceTotal: a.maintHoursMonthly * a.hourlyRate * a.horizon,
    infraTotal: a.infraMonthly * a.horizon,
  };
}

/**
 * Computed lines for Week 6.
 *
 * @param {Record<string, number>} b
 * @param {number} horizon
 * @returns {import("./kit.js").Line[]}
 */
function buildVsBuyLines(b, horizon) {
  return [
    line("One-time build cost", usd(b.buildUpfront), "Build hours times blended rate. Paid once, before any value arrives."),
    line("Build running cost per month", usd(b.buildMonthly), "Maintenance labour plus infrastructure. This recurs forever, unlike the build."),
    line("Monthly saving from building", b.monthlyDelta > 0 ? usd(b.monthlyDelta) : "None", "Vendor price minus what running your own costs. If this is not positive, building never repays."),
    line("Break-even", Number.isFinite(b.breakEvenMonths) ? num(b.breakEvenMonths, 1, "months") : "Never", "The month cumulative build cost equals cumulative vendor cost."),
    line(`Build total over ${num(horizon, 0, "months")}`, usd(b.buildTotal), "Up front plus running, across your stated horizon."),
    line(`Vendor total over ${num(horizon, 0, "months")}`, usd(b.vendorTotal), "Monthly price times the horizon, assuming the price holds."),
    line("Difference over the horizon", usd(Math.abs(b.buildTotal - b.vendorTotal)), "The size of the bet you are making on your own maintenance estimate."),
  ];
}

/**
 * Warnings for Week 6.
 *
 * @param {Record<string, number>} b
 * @param {number} horizon
 * @returns {string[]}
 */
function breakEvenWarnings(b, horizon) {
  const warnings = [];
  if (b.monthlyDelta <= 0) {
    warnings.push("Monthly maintenance and infrastructure cost as much as the vendor. Building never breaks even under these assumptions. Check the maintenance figure.");
  }
  if (Number.isFinite(b.breakEvenMonths) && b.breakEvenMonths > horizon) {
    warnings.push("Break-even falls outside your stated horizon, so the horizon is doing the deciding, not the arithmetic.");
  }
  return warnings;
}

/**
 * Week 7. Prices a reliability control against the incident it would prevent,
 * and against how long the incident runs before anybody notices.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function annualControlCost(input) {
  const controlName = requireText(input.controlName, "Control name");
  const toolingAnnual = requirePositive(input.toolingAnnualUsd, "Annual tooling cost");
  const setupHours = requirePositive(input.setupHours, "Setup hours");
  const opsHoursMonthly = requirePositive(input.opsHoursMonthly, "Monthly operating hours");
  const hourlyRate = requirePositive(input.blendedHourlyUsd, "Blended hourly cost");
  const incidentCost = requirePositive(input.incidentCostUsd, "Cost of one incident");
  const incidentsPerYear = requirePositive(input.incidentsPerYear, "Expected incidents per year");
  const catchRate = requireRange(input.catchRatePct, "Share of incidents this control catches", 0, 100);
  const detectHoursBefore = requirePositive(input.detectionHoursBefore, "Hours to detect today");
  const detectHoursAfter = requirePositive(input.detectionHoursAfter, "Hours to detect with this control");

  const c = priceControl({ toolingAnnual, setupHours, opsHoursMonthly, hourlyRate, incidentCost, incidentsPerYear, catchRate, detectHoursBefore, detectHoursAfter });

  return {
    computed: controlLines(controlName, c, catchRate, detectHoursBefore, detectHoursAfter),
    assumptions: controlAssumptions({ toolingAnnual, setupHours, opsHoursMonthly, hourlyRate, incidentCost, incidentsPerYear, catchRate, detectHoursBefore, detectHoursAfter }),
    unresolved: [
      "Catch rate and incident frequency are both your estimates. State where each came from and how confident you are.",
      "A positive net position is not an argument for funding. State who pays for this control and what they stop funding instead.",
      "Say whether this control would have caught the specific incident in the assigned post-mortem, and cite the part of the report that supports your answer.",
      "You claimed detection drops from one figure to another. State what makes that true, and who is on the other end of the alert at 3am.",
    ],
    warnings: controlWarnings(catchRate, detectHoursAfter, detectHoursBefore, c),
    visuals: [
      barChart(
        "Annual cost against annual exposure avoided",
        "USD per year",
        "Both bars are estimates. The right one rests on a catch rate you supplied, so treat the gap as a range, not a result.",
        [
          point("Steady-state cost", c.steadyState, usd(c.steadyState)),
          point("Exposure avoided", c.avoided, usd(c.avoided)),
        ]
      ),
      barChart(
        "Hours an incident runs before detection",
        "hours",
        "Detection time multiplies every other cost in an incident. It is usually the cheapest thing to improve.",
        [
          point("Today", detectHoursBefore, num(detectHoursBefore, 1, "h")),
          point("With this control", detectHoursAfter, num(detectHoursAfter, 1, "h")),
        ]
      ),
    ],
  };
}

/**
 * Echoed assumptions for Week 7.
 *
 * @param {Record<string, number>} a
 * @returns {import("./kit.js").Line[]}
 */
function controlAssumptions(a) {
  return [
    line("Annual tooling cost", usd(a.toolingAnnual), "Licence or subscription. The line finance can already see."),
    line("Setup effort", num(a.setupHours, 0, "hours"), "One-time integration, paid in year one only."),
    line("Operating effort", num(a.opsHoursMonthly, 0, "hours per month"), "Tuning, triage, and responding to what it finds. Controls are not free after purchase."),
    line("Blended hourly cost", usd(a.hourlyRate), "Fully loaded cost of an engineering hour."),
    line("Cost per incident", usd(a.incidentCost), "Your estimate of one incident's total cost, including the work to recover from it."),
    line("Incidents per year", num(a.incidentsPerYear, 2, ""), "Frequency, from your own history or the assigned post-mortem."),
    line("Catch rate", num(a.catchRate, 0, "percent"), "Share of incidents this control would actually have caught, not the share it is designed to catch."),
    line("Detection time today", num(a.detectHoursBefore, 1, "hours"), "How long an incident runs before anyone knows. This is the multiplier on incident cost."),
    line("Detection time with the control", num(a.detectHoursAfter, 1, "hours"), "What this control changes. Faster detection shrinks the blast radius of the same failure."),
  ];
}

/**
 * Price a reliability control.
 *
 * @param {Record<string, number>} a
 * @returns {Record<string, number>}
 */
function priceControl(a) {
  const steadyState = a.toolingAnnual + a.opsHoursMonthly * 12 * a.hourlyRate;
  const exposure = a.incidentCost * a.incidentsPerYear;
  const avoided = exposure * (a.catchRate / 100);
  const detectionFactor = a.detectHoursBefore === 0 ? 1 : a.detectHoursAfter / a.detectHoursBefore;
  return {
    yearOne: steadyState + a.setupHours * a.hourlyRate,
    steadyState,
    exposure,
    avoided,
    net: avoided - steadyState,
    residualExposure: (exposure - avoided) * detectionFactor,
    costPerIncidentCaught: a.incidentsPerYear * (a.catchRate / 100) === 0 ? 0 : steadyState / (a.incidentsPerYear * (a.catchRate / 100)),
  };
}

/**
 * Computed lines for Week 7.
 *
 * @param {string} controlName
 * @param {Record<string, number>} c
 * @param {number} catchRate
 * @param {number} before
 * @param {number} after
 * @returns {import("./kit.js").Line[]}
 */
function controlLines(controlName, c, catchRate, before, after) {
  return [
    line("Control", controlName, "One control, not a programme. A programme cannot be priced on one page."),
    line("Year one cost", usd(c.yearOne), "Tooling plus setup plus a year of operating effort."),
    line("Steady-state annual cost", usd(c.steadyState), "What it costs every year after the first. This is the number to compare against."),
    line("Annual incident exposure", usd(c.exposure), "Cost per incident times incidents per year, with no control in place."),
    line(`Exposure avoided at ${num(catchRate, 0, "percent")} catch rate`, usd(c.avoided), "Exposure this control removes, if your catch rate estimate holds."),
    line("Net annual position", usd(c.net), "Exposure avoided minus steady-state cost. Positive is not the same as fundable."),
    line("Cost per incident caught", usd(c.costPerIncidentCaught), "Steady-state cost divided by incidents actually caught per year. The unit economics of reliability."),
    line("Detection time change", `${num(before, 1, "hours")} to ${num(after, 1, "hours")}`, "The incidents this control misses still get shorter, which is a benefit the net position above does not count."),
    line("Residual exposure after detection speed-up", usd(c.residualExposure), "Exposure from missed incidents, scaled by the shorter time they now run."),
  ];
}

/**
 * Warnings for Week 7.
 *
 * @param {number} catchRate
 * @param {number} after
 * @param {number} before
 * @param {Record<string, number>} c
 * @returns {string[]}
 */
function controlWarnings(catchRate, after, before, c) {
  const warnings = [];
  if (catchRate > 90) {
    warnings.push("A catch rate above 90 percent is a strong claim. The post-mortem probably describes a control that existed and still missed it.");
  }
  if (after >= before) {
    warnings.push("This control does not improve detection time. If it neither catches more nor detects faster, state what it does buy.");
  }
  if (c.net < 0) {
    warnings.push("Steady-state cost exceeds the exposure this control avoids. That can still be the right call for a regulated or safety-critical failure, but you have to say so explicitly.");
  }
  return warnings;
}

export { CUT_CATEGORIES };
