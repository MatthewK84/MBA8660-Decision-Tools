/**
 * Week 8 to Week 12 tools: governance, regulation, and agent access.
 * Every export is a pure function. Dates arrive as parameters, never from the clock.
 */

import {
  line,
  num,
  requireChoice,
  requirePositive,
  requireRange,
  requireText,
  usd,
} from "./kit.js";

const CRITERIA = ["Speed of change", "Consistency of definitions", "Domain expertise", "Audit burden", "Staffing reality"];

/**
 * Week 8. Weighs centralized against federated ownership on five criteria.
 * Produces a score. Explicitly declines to declare a winner.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function weighOperatingModel(input) {
  const rows = CRITERIA.map((criterion) => {
    const slug = criterion.replace(/\s+/g, "");
    return {
      criterion,
      weight: requireRange(input[`weight${slug}`], `${criterion} weight`, 0, 10),
      central: requireRange(input[`central${slug}`], `${criterion} centralized score`, 0, 10),
      federated: requireRange(input[`federated${slug}`], `${criterion} federated score`, 0, 10),
    };
  });

  const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) {
    return {
      computed: [line("Weighted result", "All weights are zero. Nothing to compute.")],
      assumptions: [],
      unresolved: ["Assign weights that reflect what your case organization actually values."],
      warnings: ["Every criterion was weighted zero."],
    };
  }

  const centralScore = rows.reduce((sum, r) => sum + r.weight * r.central, 0) / totalWeight;
  const federatedScore = rows.reduce((sum, r) => sum + r.weight * r.federated, 0) / totalWeight;
  const margin = Math.abs(centralScore - federatedScore);

  const warnings = [];
  if (margin < 0.5) {
    warnings.push("The models are within half a point. A margin this thin means the weights, not the evidence, are deciding.");
  }

  return {
    computed: [
      ...rows.map((r) => line(`${r.criterion} (weight ${num(r.weight, 0, "")})`, `centralized ${num(r.central, 0, "")}, federated ${num(r.federated, 0, "")}`)),
      line("Weighted centralized score", num(centralScore, 2, "of 10")),
      line("Weighted federated score", num(federatedScore, 2, "of 10")),
      line("Margin", num(margin, 2, "points")),
    ],
    assumptions: rows.map((r) => line(`${r.criterion} weight`, num(r.weight, 0, "of 10"))),
    unresolved: [
      "Every score above is your judgment, entered by you. The arithmetic cannot make a weak judgment strong.",
      "State the strongest argument for the model this exercise scored lower, and say why you reject it.",
      "Name the condition under which you would switch models, and say who has authority to make that call.",
    ],
    warnings,
  };
}

/**
 * Week 9. Costs a single national standard against per-state compliance.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function costPrivacyPaths(input) {
  const states = requireRange(input.stateCount, "Number of states in scope", 1, 50);
  const nationalBuildUsd = requirePositive(input.nationalBuildUsd, "National standard build cost");
  const nationalRunUsd = requirePositive(input.nationalAnnualUsd, "National standard annual cost");
  const perStateBuildUsd = requirePositive(input.perStateBuildUsd, "Per-state build cost");
  const perStateRunUsd = requirePositive(input.perStateAnnualUsd, "Per-state annual cost");
  const horizon = requireRange(input.horizonYears, "Horizon in years", 1, 10);
  const strictestState = requireText(input.strictestState, "Strictest state driving the national standard");

  const nationalTotal = nationalBuildUsd + nationalRunUsd * horizon;
  const stateTotal = perStateBuildUsd * states + perStateRunUsd * states * horizon;
  const delta = stateTotal - nationalTotal;
  const crossover = (nationalBuildUsd + nationalRunUsd * horizon) / (perStateBuildUsd + perStateRunUsd * horizon);

  return {
    computed: [
      line(`National standard over ${num(horizon, 0, "years")}`, usd(nationalTotal)),
      line(`Per-state compliance over ${num(horizon, 0, "years")}`, usd(stateTotal)),
      line("Difference", usd(Math.abs(delta))),
      line("Cheaper on this model", delta > 0 ? "National standard" : "Per-state compliance"),
      line("States at which the two paths cost the same", num(crossover, 1, "states")),
    ],
    assumptions: [
      line("States in scope", num(states, 0, "")),
      line("Strictest state driving the standard", strictestState),
      line("National build", usd(nationalBuildUsd)),
      line("National annual", usd(nationalRunUsd)),
      line("Per-state build", usd(perStateBuildUsd)),
      line("Per-state annual", usd(perStateRunUsd)),
      line("Horizon", num(horizon, 0, "years")),
    ],
    unresolved: [
      "Cheaper is not the same as correct. State the non-cost reason you would pick the more expensive path.",
      `You named ${strictestState} as the driver. Cite the specific provision that makes it strictest, not the statute as a whole.`,
      "State what happens to this model when a new state law takes effect mid-year, which is the normal case.",
    ],
    warnings: states > crossover && delta < 0 ? ["Your state count sits past the crossover, so the arithmetic and your inputs disagree. Recheck the per-state figures."] : [],
  };
}

const AI_ACT_MILESTONES = [
  { iso: "2025-02-02", label: "Prohibitions and AI literacy obligations apply" },
  { iso: "2025-08-02", label: "GPAI model provider obligations and governance apply" },
  { iso: "2026-08-02", label: "Article 50 transparency duties apply, and AI Office enforcement over GPAI begins" },
  { iso: "2026-12-02", label: "Deadline for transparency solutions for artificially generated content" },
  { iso: "2027-08-02", label: "Member State AI regulatory sandboxes operational" },
  { iso: "2027-12-02", label: "Annex III standalone high-risk obligations apply, deferred by the Digital Omnibus" },
  { iso: "2028-08-02", label: "Annex I product-embedded high-risk obligations apply, deferred by the Digital Omnibus" },
];

/**
 * Week 10. Builds a dated exposure timeline relative to a given date.
 * The milestone set is fact. The exposure judgment is not, and is refused.
 *
 * @param {Record<string, unknown>} input
 * @param {Date} asOf
 * @returns {import("./kit.js").ToolResult}
 */
export function exposureTimeline(input, asOf) {
  const role = requireChoice(input.role, "Your role under the Act", ["Provider", "Deployer", "Both", "Neither"]);
  const annexIII = requireChoice(input.annexIiiUseCase, "Annex III use case in scope", ["Yes", "No", "Unsure"]);
  const gpai = requireChoice(input.usesGpai, "Uses a general-purpose AI model", ["Yes", "No"]);
  const generatesContent = requireChoice(input.generatesSyntheticContent, "Generates synthetic content", ["Yes", "No"]);

  const dated = AI_ACT_MILESTONES.map((m) => {
    const when = new Date(`${m.iso}T00:00:00Z`);
    const days = Math.round((when.getTime() - asOf.getTime()) / 86400000);
    const status = days < 0 ? `in force, ${Math.abs(days)} days ago` : `${days} days away`;
    return line(m.iso, `${m.label} (${status})`);
  });

  /** @type {string[]} */
  const flags = [];
  if (generatesContent === "Yes") {
    flags.push("Article 50 transparency duties are already in force and already apply to you.");
  }
  if (gpai === "Yes") {
    flags.push("GPAI provider obligations have been in force since August 2025. Confirm whether you are a provider or only a deployer.");
  }
  if (annexIII === "Yes") {
    flags.push("Annex III high-risk duties were deferred to 2 December 2027. Deferred is not cancelled.");
  }
  if (annexIII === "Unsure") {
    flags.push("Unsure is a finding, not a gap. Resolving Annex III classification is itself a roadmap item with an owner and a date.");
  }

  return {
    computed: [...dated, ...flags.map((f, i) => line(`Flag ${i + 1}`, f))],
    assumptions: [
      line("Assessed as of", asOf.toISOString().slice(0, 10)),
      line("Role", role),
      line("Annex III use case", annexIII),
      line("Uses general-purpose AI model", gpai),
      line("Generates synthetic content", generatesContent),
      line("Milestone source", "Regulation (EU) 2024/1689 as amended by the 2026 Digital Omnibus"),
    ],
    unresolved: [
      "This timeline lists dates. It does not tell you whether your roadmap changes. State whether it does and by how much.",
      "The high-risk deferral bought time. State whether you spend that time preparing or reallocating it, and defend the choice.",
      "Name the one obligation above where you are least confident of your classification, and say what you would do to resolve it.",
    ],
    warnings: role === "Neither" ? ["If you are neither provider nor deployer, explain why the Act reaches your organization at all. It may not."] : [],
  };
}

/**
 * Week 11. Frames a retention and evaluation policy for a retrieval corpus.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function draftRetentionPolicy(input) {
  const docs = requirePositive(input.documentCount, "Documents in corpus");
  const pctPersonal = requireRange(input.percentPersonalData, "Percent containing personal data", 0, 100);
  const retentionMonths = requireRange(input.retentionMonths, "Retention period in months", 1, 240);
  const reindexDays = requirePositive(input.reindexIntervalDays, "Reindex interval in days");
  const evalSetSize = requirePositive(input.evalSetSize, "Evaluation set size");
  const deleteSlaDays = requirePositive(input.deletionSlaDays, "Deletion request SLA in days");

  const personalDocs = docs * (pctPersonal / 100);
  const reindexPerYear = 365 / reindexDays;
  const evalCoverage = (evalSetSize / docs) * 100;
  const staleWindow = reindexDays;

  const warnings = [];
  if (deleteSlaDays > staleWindow) {
    warnings.push(`Your deletion SLA of ${num(deleteSlaDays, 0, "days")} is longer than your reindex interval. Deleted records stay retrievable in the index until the next reindex.`);
  }
  if (evalCoverage < 1) {
    warnings.push("An evaluation set under one percent of the corpus will not detect retrieval regressions on rare document types.");
  }

  return {
    computed: [
      line("Documents containing personal data", num(personalDocs, 0, "documents")),
      line("Reindex passes per year", num(reindexPerYear, 1, "")),
      line("Maximum index staleness", num(staleWindow, 0, "days")),
      line("Evaluation set coverage", num(evalCoverage, 2, "percent of corpus")),
      line("Retention horizon", num(retentionMonths, 0, "months")),
    ],
    assumptions: [
      line("Corpus size", docs.toLocaleString("en-US")),
      line("Share containing personal data", num(pctPersonal, 0, "percent")),
      line("Retention period", num(retentionMonths, 0, "months")),
      line("Reindex interval", num(reindexDays, 0, "days")),
      line("Evaluation set", num(evalSetSize, 0, "documents")),
      line("Deletion SLA", num(deleteSlaDays, 0, "days")),
    ],
    unresolved: [
      "State what a deletion request actually removes: the source document, the chunk, the embedding, the cached response, or all four.",
      "State what your evaluation set measures. Retrieval accuracy and answer quality are different failures with different owners.",
      "Name who approves a change to the retention period and what evidence they would need.",
    ],
    warnings,
  };
}

const AGENT_SCOPES = ["Read public tables", "Read internal tables", "Read tables containing personal data", "Write to staging", "Write to production"];

/**
 * Week 12. Builds an agent access scope matrix and surfaces the blast radius.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function buildScopeMatrix(input) {
  const authMethod = requireChoice(input.authMethod, "Agent authentication method", [
    "Static API key",
    "Short-lived vended credential",
    "Workload identity federation",
  ]);
  const tokenMinutes = requirePositive(input.credentialLifetimeMinutes, "Credential lifetime in minutes");
  const humanApproval = requireChoice(input.humanInLoop, "Human approval before write", ["Required", "Not required"]);
  const grants = AGENT_SCOPES.map((scope) => ({
    scope,
    granted: requireChoice(input[`grant${scope.replace(/\s+/g, "")}`], `${scope} grant`, ["Granted", "Denied"]),
  }));

  const grantedCount = grants.filter((g) => g.granted === "Granted").length;
  const exposureWindow = authMethod === "Static API key" ? Number.POSITIVE_INFINITY : tokenMinutes;
  const writesGranted = grants.some((g) => g.scope.startsWith("Write") && g.granted === "Granted");
  const personalGranted = grants.some((g) => g.scope.includes("personal data") && g.granted === "Granted");

  const warnings = [];
  if (authMethod === "Static API key") {
    warnings.push("A static key has no expiry. A leaked key stays valid until somebody notices, and nobody is watching an agent.");
  }
  if (writesGranted && humanApproval === "Not required") {
    warnings.push("Unattended writes with no approval gate mean an incorrect agent action reaches production with no human signal.");
  }
  if (personalGranted) {
    warnings.push("Personal data in agent scope pulls this decision into your Week 9 privacy position and your Week 11 retention policy.");
  }

  return {
    computed: [
      ...grants.map((g) => line(g.scope, g.granted)),
      line("Scopes granted", num(grantedCount, 0, `of ${AGENT_SCOPES.length}`)),
      line("Credential exposure window", Number.isFinite(exposureWindow) ? num(exposureWindow, 0, "minutes") : "Unbounded"),
      line("Write path", writesGranted ? `Granted, approval ${humanApproval.toLowerCase()}` : "No write access"),
    ],
    assumptions: [
      line("Authentication method", authMethod),
      line("Credential lifetime", num(tokenMinutes, 0, "minutes")),
      line("Human approval before write", humanApproval),
    ],
    unresolved: [
      "State how you would detect an agent reading more than it should, given that an over-broad grant produces no error and no complaint.",
      "Name the human accountable for each granted scope. An agent cannot be accountable, so somebody must be.",
      "State what you revoke first when an agent misbehaves, and how long revocation takes to take effect.",
    ],
    warnings,
  };
}

export { AI_ACT_MILESTONES, AGENT_SCOPES, CRITERIA };
