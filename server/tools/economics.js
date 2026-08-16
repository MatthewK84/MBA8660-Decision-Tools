/**
 * Week 5 to Week 7 tools: platform economics and reliability.
 * Every export is a pure function. No I/O, no clock beyond an injected date.
 */

import {
  InputError,
  line,
  num,
  requirePositive,
  requireRange,
  requireRetrievalDate,
  requireText,
  usd,
} from "./kit.js";

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
 * Week 5. Simulates a spend reduction across five categories.
 * Reports what the cut yields. Refuses to say which categories to cut.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function simulateCut(input) {
  const targetPct = requireRange(input.targetReductionPct, "Target reduction percent", 1, 90);
  const spend = readCategorySpend(input);
  const cuts = readCategoryCuts(input);

  const totalSpend = spend.reduce((sum, s) => sum + s.spend, 0);
  const savings = spend.map((s, i) => {
    const cut = cuts[i];
    if (cut === undefined) {
      throw new InputError("Cut percentages did not align with spend categories.");
    }
    return { category: s.category, saved: s.spend * (cut.cutPct / 100), cutPct: cut.cutPct };
  });
  const totalSaved = savings.reduce((sum, s) => sum + s.saved, 0);
  const achievedPct = (totalSaved / totalSpend) * 100;
  const shortfall = (targetPct / 100) * totalSpend - totalSaved;

  const warnings = [];
  if (shortfall > 0) {
    warnings.push(`This plan is ${usd(shortfall)} short of the ${num(targetPct, 0, "percent")} target.`);
  }
  const observability = savings.find((s) => s.category === "Observability");
  if (observability !== undefined && observability.cutPct > 50) {
    warnings.push("Cutting observability above 50 percent reduces your ability to detect the failures Week 7 asks you to control.");
  }

  return {
    computed: [
      line("Total annual platform spend", usd(totalSpend)),
      ...savings.map((s) => line(`${s.category} saving at ${num(s.cutPct, 0, "percent")}`, usd(s.saved))),
      line("Total saving", usd(totalSaved)),
      line("Reduction achieved", num(achievedPct, 1, "percent")),
      line("Gap to target", shortfall > 0 ? usd(shortfall) : "Target met"),
    ],
    assumptions: [
      line("Target reduction", num(targetPct, 0, "percent")),
      ...spend.map((s) => line(`${s.category} annual spend`, usd(s.spend))),
    ],
    unresolved: [
      "For every category you cut above 20 percent, name what stops working and who notices first.",
      "Name the person who will object loudest to this plan, state their strongest argument, and say what you tell them.",
      "State which of these cuts is reversible within one quarter and which is not. Irreversible cuts need a higher bar.",
    ],
    warnings,
  };
}

/**
 * Week 6. Computes the break-even month between building and buying ingestion.
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
  const horizon = requireRange(input.horizonMonths, "Evaluation horizon in months", 6, 60);

  const buildUpfront = buildHours * hourlyRate;
  const buildMonthly = maintHoursMonthly * hourlyRate;
  const monthlyDelta = vendorMonthly - buildMonthly;

  const breakEvenMonths = monthlyDelta > 0 ? buildUpfront / monthlyDelta : Number.POSITIVE_INFINITY;
  const buildTotal = buildUpfront + buildMonthly * horizon;
  const vendorTotal = vendorMonthly * horizon;

  const warnings = [];
  if (monthlyDelta <= 0) {
    warnings.push("Monthly maintenance costs as much as the vendor. Building never breaks even under these assumptions. Check the maintenance figure.");
  }
  if (Number.isFinite(breakEvenMonths) && breakEvenMonths > horizon) {
    warnings.push("Break-even falls outside your stated horizon, so the horizon is doing the deciding, not the arithmetic.");
  }

  return {
    computed: [
      line("One-time build cost", usd(buildUpfront)),
      line("Build running cost per month", usd(buildMonthly)),
      line("Vendor cost per month", usd(vendorMonthly)),
      line("Monthly saving from building", monthlyDelta > 0 ? usd(monthlyDelta) : "None"),
      line("Break-even", Number.isFinite(breakEvenMonths) ? num(breakEvenMonths, 1, "months") : "Never"),
      line(`Build total over ${num(horizon, 0, "months")}`, usd(buildTotal)),
      line(`Vendor total over ${num(horizon, 0, "months")}`, usd(vendorTotal)),
    ],
    assumptions: [
      line("Vendor monthly price", usd(vendorMonthly)),
      line("Price retrieved on", retrievedAt),
      line("Build effort", num(buildHours, 0, "hours")),
      line("Blended hourly cost", usd(hourlyRate)),
      line("Maintenance effort", num(maintHoursMonthly, 0, "hours per month")),
      line("Evaluation horizon", num(horizon, 0, "months")),
    ],
    unresolved: [
      "Break-even is one number resting on your maintenance estimate. State that estimate's source and what break-even becomes if maintenance doubles.",
      "This model prices engineering time and nothing else. Name one cost of building that it omits.",
      "Name the single assumption the answer hinges on, in one clause, as the final artifact requires.",
    ],
    warnings,
  };
}

/**
 * Week 7. Prices a reliability control against the incident it would prevent.
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

  const yearOne = toolingAnnual + setupHours * hourlyRate + opsHoursMonthly * 12 * hourlyRate;
  const steadyState = toolingAnnual + opsHoursMonthly * 12 * hourlyRate;
  const exposure = incidentCost * incidentsPerYear;
  const avoided = exposure * (catchRate / 100);
  const net = avoided - steadyState;

  return {
    computed: [
      line("Control", controlName),
      line("Year one cost", usd(yearOne)),
      line("Steady-state annual cost", usd(steadyState)),
      line("Annual incident exposure", usd(exposure)),
      line(`Exposure avoided at ${num(catchRate, 0, "percent")} catch rate`, usd(avoided)),
      line("Net annual position", usd(net)),
    ],
    assumptions: [
      line("Annual tooling cost", usd(toolingAnnual)),
      line("Setup effort", num(setupHours, 0, "hours")),
      line("Operating effort", num(opsHoursMonthly, 0, "hours per month")),
      line("Blended hourly cost", usd(hourlyRate)),
      line("Cost per incident", usd(incidentCost)),
      line("Incidents per year", num(incidentsPerYear, 2, "")),
      line("Catch rate", num(catchRate, 0, "percent")),
    ],
    unresolved: [
      "Catch rate and incident frequency are both your estimates. State where each came from and how confident you are.",
      "A positive net position is not an argument for funding. State who pays for this control and what they stop funding instead.",
      "Say whether this control would have caught the specific incident in the assigned post-mortem, and cite the part of the report that supports your answer.",
    ],
    warnings: catchRate > 90 ? ["A catch rate above 90 percent is a strong claim. The post-mortem probably describes a control that existed and still missed it."] : [],
  };
}

export { CUT_CATEGORIES };
