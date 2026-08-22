/**
 * Week 8 to Week 12 tools: governance, regulation, and agent access.
 * Every export is a pure function. Dates arrive as parameters, never from the clock.
 */

import {
  barChart,
  gibToGb,
  line,
  matrixChart,
  money,
  num,
  point,
  requireChoice,
  requirePositive,
  requireRange,
  requireText,
  timelineChart,
  usd,
} from "./kit.js";
import { DEFAULT_BLENDED_HOURLY_USD, citation, rate } from "../reference/rates.js";

const CRITERIA = ["Speed of change", "Consistency of definitions", "Domain expertise", "Audit burden", "Staffing reality"];

/**
 * Read the weighted-scoring grid for Week 8.
 *
 * @param {Record<string, unknown>} input
 * @returns {{ criterion: string, weight: number, central: number, federated: number }[]}
 */
function readCriteriaGrid(input) {
  return CRITERIA.map((criterion) => {
    const slug = criterion.replace(/\s+/g, "");
    return {
      criterion,
      weight: requireRange(input[`weight${slug}`], `${criterion} weight`, 0, 10),
      central: requireRange(input[`central${slug}`], `${criterion} centralized score`, 0, 10),
      federated: requireRange(input[`federated${slug}`], `${criterion} federated score`, 0, 10),
    };
  });
}

/**
 * The degenerate all-zero-weight result, kept separate so the main path stays flat.
 *
 * @returns {import("./kit.js").ToolResult}
 */
function zeroWeightResult() {
  return {
    computed: [line("Weighted result", "All weights are zero. Nothing to compute.", "A weighted model with no weights has no opinion, which is itself the finding.")],
    assumptions: [],
    unresolved: [
      "Assign weights that reflect what your case organization actually values.",
      "State why the criteria offered here are the right five, or name the one you would add.",
    ],
    warnings: ["Every criterion was weighted zero."],
    visuals: [],
  };
}

/**
 * Week 8. Weighs centralized against federated ownership on five criteria and
 * prices the staffing each model implies.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function weighOperatingModel(input) {
  const rows = readCriteriaGrid(input);
  const centralFte = requirePositive(input.centralFteCount, "Central platform team headcount");
  const domainFte = requirePositive(input.federatedFtePerDomain, "Embedded data engineers per domain");
  const domains = requirePositive(input.domainCount, "Business domains in scope");
  const fteCostUsd = requirePositive(input.fullyLoadedFteUsd, "Fully loaded annual cost per engineer");

  const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) {
    return zeroWeightResult();
  }

  const centralScore = rows.reduce((sum, r) => sum + r.weight * r.central, 0) / totalWeight;
  const federatedScore = rows.reduce((sum, r) => sum + r.weight * r.federated, 0) / totalWeight;
  const margin = Math.abs(centralScore - federatedScore);
  const centralCost = centralFte * fteCostUsd;
  const federatedCost = (domains * domainFte + Math.ceil(centralFte / 2)) * fteCostUsd;

  return {
    computed: modelLines(rows, { centralScore, federatedScore, margin, centralCost, federatedCost, domains, domainFte }),
    assumptions: [
      ...rows.map((r) => line(`${r.criterion} weight`, num(r.weight, 0, "of 10"), "")),
      line("Central platform headcount", num(centralFte, 0, "engineers"), ""),
      line("Embedded engineers per domain", num(domainFte, 1, "engineers"), ""),
      line("Business domains", num(domains, 0, ""), ""),
      line("Fully loaded cost per engineer", usd(fteCostUsd), "Salary, tax, benefits, equipment, and overhead. Not salary alone."),
    ],
    unresolved: [
      "Every score above is your judgment, entered by you. The arithmetic cannot make a weak judgment strong.",
      "State the strongest argument for the model this exercise scored lower, and say why you reject it.",
      "Name the condition under which you would switch models, and say who has authority to make that call.",
      "One model costs more in salary. State whether the score gap justifies that difference, in words, and to whom.",
    ],
    warnings: margin < 0.5 ? ["The models are within half a point. A margin this thin means the weights, not the evidence, are deciding."] : [],
    visuals: [
      barChart(
        "Weighted score, side by side",
        "points of 10",
        "Two numbers you produced from weights you chose. Read the margin, not the ranking.",
        [point("Centralized", centralScore, num(centralScore, 2, "")), point("Federated", federatedScore, num(federatedScore, 2, ""))]
      ),
      barChart(
        "Annual staffing cost of each model",
        "USD per year",
        "The score chart is opinion. This one is payroll, and it is the part the CFO will read first.",
        [point("Centralized", centralCost, usd(centralCost)), point("Federated", federatedCost, usd(federatedCost))]
      ),
    ],
  };
}

/**
 * Computed lines for Week 8.
 *
 * @param {{ criterion: string, weight: number, central: number, federated: number }[]} rows
 * @param {Record<string, number>} m
 * @returns {import("./kit.js").Line[]}
 */
function modelLines(rows, m) {
  const dearer = Math.max(m.federatedCost, m.centralCost) - Math.min(m.federatedCost, m.centralCost);
  return [
    ...rows.map((r) => line(`${r.criterion} (weight ${num(r.weight, 0, "")})`, `centralized ${num(r.central, 0, "")}, federated ${num(r.federated, 0, "")}`, "Your score, times your weight. The arithmetic cannot make a weak judgment strong.")),
    line("Weighted centralized score", num(m.centralScore, 2, "of 10"), "Weighted average of your centralized scores."),
    line("Weighted federated score", num(m.federatedScore, 2, "of 10"), "Weighted average of your federated scores."),
    line("Margin", num(m.margin, 2, "points"), "The distance between them. Under half a point, the weights are deciding rather than the evidence."),
    line("Centralized staffing cost per year", usd(m.centralCost), "One platform team. Cheaper on payroll and slower at the domain boundary."),
    line("Federated staffing cost per year", usd(m.federatedCost), `${m.domains} domains at ${m.domainFte} engineers each, plus a half-size central enablement team.`),
    line("Annual staffing difference", usd(dearer), "Operating models are mostly a payroll decision. This is the size of it."),
    line("Cost per point of weighted score", usd(dearer / Math.max(m.margin, 0.01)), "What the more expensive model costs per point of advantage your own weights gave it."),
  ];
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
  const deletionRequests = requirePositive(input.deletionRequestsPerYear, "Deletion requests per year");
  const hoursPerRequest = requirePositive(input.hoursPerDeletionRequest, "Hours to service one deletion request");

  const nationalTotal = nationalBuildUsd + nationalRunUsd * horizon;
  const stateTotal = perStateBuildUsd * states + perStateRunUsd * states * horizon;
  const delta = stateTotal - nationalTotal;
  const crossover = (nationalBuildUsd + nationalRunUsd * horizon) / (perStateBuildUsd + perStateRunUsd * horizon);
  const dsarAnnual = deletionRequests * hoursPerRequest * DEFAULT_BLENDED_HOURLY_USD;

  return {
    computed: privacyLines({ horizon, states, nationalTotal, stateTotal, delta, crossover, dsarAnnual, deletionRequests }),
    assumptions: privacyAssumptions({ states, strictestState, nationalBuildUsd, nationalRunUsd, perStateBuildUsd, perStateRunUsd, horizon, deletionRequests, hoursPerRequest }),
    unresolved: [
      "Cheaper is not the same as correct. State the non-cost reason you would pick the more expensive path.",
      `You named ${strictestState} as the driver. Cite the specific provision that makes it strictest, not the statute as a whole.`,
      "State what happens to this model when a new state law takes effect mid-year, which is the normal case.",
      "Deletion requests cost real money per request and are legally non-optional. State the request volume at which you would automate, and what automating costs.",
    ],
    warnings: states > crossover && delta < 0 ? ["Your state count sits past the crossover, so the arithmetic and your inputs disagree. Recheck the per-state figures."] : [],
    visuals: [
      barChart(
        `Total cost of each path over ${num(horizon, 0, "years")}`,
        "USD",
        "One bar is a single programme. The other is the same programme repeated per jurisdiction.",
        [point("National standard", nationalTotal, usd(nationalTotal)), point("Per-state", stateTotal, usd(stateTotal))]
      ),
      barChart(
        "Recurring cost neither path avoids",
        "USD per year",
        "Servicing statutory requests is an operating cost on both paths. It scales with customers, not with states.",
        [point("Deletion request handling", dsarAnnual, usd(dsarAnnual))]
      ),
    ],
  };
}

/**
 * Computed lines for Week 9.
 *
 * @param {Record<string, number>} a
 * @returns {import("./kit.js").Line[]}
 */
function privacyLines(a) {
  return [
    line(`National standard over ${num(a.horizon, 0, "years")}`, usd(a.nationalTotal), "Build once to the strictest rule, run it everywhere. One system, one audit."),
    line(`Per-state compliance over ${num(a.horizon, 0, "years")}`, usd(a.stateTotal), `${a.states} separate builds and ${a.states} separate annual programmes.`),
    line("Difference", usd(Math.abs(a.delta)), "The size of the decision, over the horizon you stated."),
    line("Cheaper on this model", a.delta > 0 ? "National standard" : "Per-state compliance", "Cheaper on cost alone. This tool has no view on whether cheaper is correct."),
    line("States at which the two paths cost the same", num(a.crossover, 1, "states"), "Below this count, per-state is cheaper. Above it, the national standard is."),
    line("Deletion request handling per year", usd(a.dsarAnnual), `Requests times hours times a ${usd(DEFAULT_BLENDED_HOURLY_USD)} blended rate. This recurs on both paths and grows with your customer base.`),
    line("Cost per deletion request", money(a.dsarAnnual / a.deletionRequests), "The unit economics of a statutory right. Automation is justified against this figure, not against the total."),
    line("National standard, per state per year", money(a.nationalTotal / a.horizon / a.states), "What one national programme works out to per state. Compare it against the per-state annual figure you entered."),
  ];
}

/**
 * Echoed assumptions for Week 9.
 *
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Line[]}
 */
function privacyAssumptions(a) {
  return [
    line("States in scope", num(Number(a.states), 0, ""), "States whose statutes reach your data subjects."),
    line("Strictest state driving the standard", String(a.strictestState), "The state whose rule sets the national floor, if you build one."),
    line("National build", usd(Number(a.nationalBuildUsd)), "One-time cost to build to the strictest standard."),
    line("National annual", usd(Number(a.nationalRunUsd)), "Ongoing programme cost, one jurisdiction's worth of process for all of them."),
    line("Per-state build", usd(Number(a.perStateBuildUsd)), "One-time cost per state, multiplied by state count."),
    line("Per-state annual", usd(Number(a.perStateRunUsd)), "Ongoing cost per state per year. This is the line that compounds."),
    line("Horizon", num(Number(a.horizon), 0, "years"), "The window over which you are comparing. Longer horizons favour the one-time build."),
    line("Deletion requests per year", Number(a.deletionRequests).toLocaleString("en-US"), "Statutory deletion and access requests you expect to service."),
    line("Hours per request", num(Number(a.hoursPerRequest), 1, "hours"), "Manual effort per request today. Automation trades build cost against this figure."),
  ];
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
 * Flags raised by the student's stated AI Act posture.
 *
 * @param {{ annexIII: string, gpai: string, generatesContent: string }} a
 * @returns {string[]}
 */
function aiActFlags(a) {
  const flags = [];
  if (a.generatesContent === "Yes") {
    flags.push("Article 50 transparency duties are already in force and already apply to you.");
  }
  if (a.gpai === "Yes") {
    flags.push("GPAI provider obligations have been in force since August 2025. Confirm whether you are a provider or only a deployer.");
  }
  if (a.annexIII === "Yes") {
    flags.push("Annex III high-risk duties were deferred to 2 December 2027. Deferred is not cancelled.");
  }
  if (a.annexIII === "Unsure") {
    flags.push("Unsure is a finding, not a gap. Resolving Annex III classification is itself a roadmap item with an owner and a date.");
  }
  return flags;
}

/**
 * Week 10. Builds a dated exposure timeline and prices the readiness work
 * against the time remaining before each obligation bites.
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
  const readinessHours = requirePositive(input.readinessHours, "Estimated readiness effort in hours");
  const hourlyRate = requirePositive(input.blendedHourlyUsd, "Blended hourly cost");

  const dated = AI_ACT_MILESTONES.map((m) => {
    const when = new Date(`${m.iso}T00:00:00Z`);
    const days = Math.round((when.getTime() - asOf.getTime()) / 86400000);
    const status = days < 0 ? `in force, ${Math.abs(days)} days ago` : `${days} days away`;
    return { ...m, days, status };
  });

  const flags = aiActFlags({ annexIII, gpai, generatesContent });
  const readinessCost = readinessHours * hourlyRate;
  const annexDeadline = dated.find((d) => d.iso === "2027-12-02");
  const daysToAnnex = annexDeadline === undefined ? 0 : annexDeadline.days;
  const hoursPerWeek = daysToAnnex > 0 ? readinessHours / (daysToAnnex / 7) : readinessHours;

  return {
    computed: [
      ...dated.map((d) => line(d.iso, `${d.label} (${d.status})`, d.days < 0 ? "Already in force. Nothing about this date is a plan; it is a fact about today." : "Still ahead. Days remaining is the only budget you cannot buy more of.")),
      ...flags.map((f, i) => line(`Flag ${i + 1}`, f, "Raised by the posture you stated, not by any judgment about your roadmap.")),
      line("Readiness cost", usd(readinessCost), "Your effort estimate at your blended rate. Compliance work is engineering work and is paid for out of the same budget."),
      line("Days until Annex III obligations apply", num(daysToAnnex, 0, "days"), "Measured from the assessment date you supplied, to 2 December 2027."),
      line("Sustained effort to be ready in time", num(hoursPerWeek, 1, "hours per week"), "Readiness hours spread evenly over the days remaining. If this exceeds your team's slack, the deferral did not buy you what you think."),
    ],
    assumptions: aiActAssumptions({ asOf, role, annexIII, gpai, generatesContent, readinessHours, hourlyRate }),
    unresolved: [
      "This timeline lists dates. It does not tell you whether your roadmap changes. State whether it does and by how much.",
      "The high-risk deferral bought time. State whether you spend that time preparing or reallocating it, and defend the choice.",
      "Name the one obligation above where you are least confident of your classification, and say what you would do to resolve it.",
      "You estimated the readiness effort. State who supplied that estimate and whether they have done this work before.",
    ],
    warnings: role === "Neither" ? ["If you are neither provider nor deployer, explain why the Act reaches your organization at all. It may not."] : [],
    visuals: [
      timelineChart(
        "EU AI Act obligations, relative to your assessment date",
        "Everything left of zero is already law. Everything right of it is a deadline you are currently spending.",
        dated.map((d) => point(d.iso, d.days, d.days < 0 ? "in force" : `${d.days}d`))
      ),
    ],
  };
}

/**
 * Echoed assumptions for Week 10.
 *
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Line[]}
 */
function aiActAssumptions(a) {
  const asOf = /** @type {Date} */ (a.asOf);
  return [
    line("Assessed as of", asOf.toISOString().slice(0, 10), "Every day count above is measured from this date."),
    line("Role", String(a.role), "Provider obligations are far heavier than deployer obligations. Most organizations are both, for different systems."),
    line("Annex III use case", String(a.annexIII), "Whether any of your uses appear on the high-risk list."),
    line("Uses general-purpose AI model", String(a.gpai), "Fine-tuning a GPAI model can make you a provider of a new one."),
    line("Generates synthetic content", String(a.generatesContent), "Triggers Article 50 transparency duties, which are already in force."),
    line("Readiness effort", num(Number(a.readinessHours), 0, "hours"), "Your estimate of the work to reach compliance."),
    line("Blended hourly cost", usd(Number(a.hourlyRate)), "Fully loaded cost of an engineering or compliance hour."),
    line("Milestone source", "Regulation (EU) 2024/1689 as amended by the 2026 Digital Omnibus", "The dates are fact. What you do about them is not."),
  ];
}

/** Vector dimensions assumed for storage sizing. Titan V2 default output size. */
const EMBEDDING_DIMENSIONS = 1024;

/** Bytes per dimension in a float32 vector index. */
const BYTES_PER_DIMENSION = 4;

/** Output tokens assumed per generated answer. */
const ANSWER_OUTPUT_TOKENS = 400;

/**
 * Price a retrieval corpus: embedding at index time, storage of the vectors,
 * and generation at question time.
 *
 * @param {Record<string, number>} a
 * @returns {Record<string, number>}
 */
function priceCorpus(a) {
  const chunks = (a.docs * a.tokensPerDoc) / a.chunkTokens;
  const corpusTokens = a.docs * a.tokensPerDoc;
  const embedRate = rate("embeddingTokens").unitPriceUsd;
  const passesPerYear = 365 / a.reindexDays;
  const vectorGib = (chunks * EMBEDDING_DIMENSIONS * BYTES_PER_DIMENSION) / 1024 ** 3;
  const inputTokensPerAnswer = a.chunksPerAnswer * a.chunkTokens;
  const perAnswer =
    (inputTokensPerAnswer / 1000000) * rate("generationInputTokens").unitPriceUsd +
    (ANSWER_OUTPUT_TOKENS / 1000000) * rate("generationOutputTokens").unitPriceUsd;

  return {
    chunks,
    corpusTokens,
    embedOnce: (corpusTokens / 1000000) * embedRate,
    embedAnnual: (corpusTokens / 1000000) * embedRate * passesPerYear,
    passesPerYear,
    vectorGib,
    vectorStorageAnnual: gibToGb(vectorGib) * rate("objectStorageStandard").unitPriceUsd * 12,
    perAnswer,
    answersAnnual: perAnswer * a.questionsPerDay * 365,
  };
}

/**
 * Week 11. Frames a retention and evaluation policy for a retrieval corpus,
 * and prices the corpus at both index time and question time.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function draftRetentionPolicy(input) {
  const docs = requirePositive(input.documentCount, "Documents in corpus");
  const tokensPerDoc = requirePositive(input.tokensPerDocument, "Average tokens per document");
  const chunkTokens = requireRange(input.chunkTokens, "Tokens per chunk", 50, 4000);
  const chunksPerAnswer = requireRange(input.chunksPerAnswer, "Chunks retrieved per answer", 1, 50);
  const questionsPerDay = requirePositive(input.questionsPerDay, "Questions answered per day");
  const pctPersonal = requireRange(input.percentPersonalData, "Percent containing personal data", 0, 100);
  const retentionMonths = requireRange(input.retentionMonths, "Retention period in months", 1, 240);
  const reindexDays = requirePositive(input.reindexIntervalDays, "Reindex interval in days");
  const evalSetSize = requirePositive(input.evalSetSize, "Evaluation set size");
  const deleteSlaDays = requirePositive(input.deletionSlaDays, "Deletion request SLA in days");

  const c = priceCorpus({ docs, tokensPerDoc, chunkTokens, chunksPerAnswer, questionsPerDay, reindexDays });
  const personalDocs = docs * (pctPersonal / 100);
  const evalCoverage = (evalSetSize / docs) * 100;

  return {
    computed: ragLines(c, { personalDocs, evalCoverage, retentionMonths, reindexDays, chunksPerAnswer }),
    assumptions: ragAssumptions({ docs, tokensPerDoc, chunkTokens, chunksPerAnswer, questionsPerDay, pctPersonal, retentionMonths, reindexDays, evalSetSize, deleteSlaDays }),
    unresolved: [
      "State what a deletion request actually removes: the source document, the chunk, the embedding, the cached response, or all four.",
      "State what your evaluation set measures. Retrieval accuracy and answer quality are different failures with different owners.",
      "Name who approves a change to the retention period and what evidence they would need.",
      "Reindexing more often costs embedding money and buys freshness. State the staleness your users can actually tolerate, and how you know.",
    ],
    warnings: ragWarnings({ deleteSlaDays, reindexDays, evalCoverage, c }),
    visuals: [
      barChart(
        "Annual cost of the retrieval corpus",
        "USD per year",
        "Indexing is a one-time cost repeated per reindex. Answering is a cost per question, forever. They rarely have the same owner.",
        [
          point("Embedding, reindexed", c.embedAnnual, usd(c.embedAnnual)),
          point("Vector storage", c.vectorStorageAnnual, usd(c.vectorStorageAnnual)),
          point("Answer generation", c.answersAnnual, usd(c.answersAnnual)),
        ]
      ),
      barChart(
        "Deletion SLA against reindex interval",
        "days",
        "If the left bar is taller, deleted records stay retrievable in the index until the next pass. Both bars are policy, and they must be set together.",
        [
          point("Deletion SLA", deleteSlaDays, num(deleteSlaDays, 0, "d")),
          point("Reindex interval", reindexDays, num(reindexDays, 0, "d")),
        ]
      ),
    ],
  };
}

/**
 * Echoed assumptions for Week 11.
 *
 * @param {Record<string, number>} a
 * @returns {import("./kit.js").Line[]}
 */
function ragAssumptions(a) {
  return [
    line("Corpus size", a.docs.toLocaleString("en-US"), "Source documents before chunking."),
    line("Tokens per document", a.tokensPerDoc.toLocaleString("en-US"), "Roughly 750 words per 1,000 tokens."),
    line("Tokens per chunk", num(a.chunkTokens, 0, "tokens"), "Smaller chunks retrieve more precisely and cost more to embed and store."),
    line("Chunks retrieved per answer", num(a.chunksPerAnswer, 0, ""), "Every retrieved chunk is billed as input tokens on every question."),
    line("Questions per day", a.questionsPerDay.toLocaleString("en-US"), "Drives the generation bill, which recurs forever."),
    line("Share containing personal data", num(a.pctPersonal, 0, "percent"), "Sets the perimeter for retention, deletion, and access control."),
    line("Retention period", num(a.retentionMonths, 0, "months"), "How long a document stays in the corpus, whatever its source system does."),
    line("Reindex interval", num(a.reindexDays, 0, "days"), "Sets both maximum staleness and how often you pay the embedding bill."),
    line("Evaluation set", num(a.evalSetSize, 0, "documents"), "The sample you measure retrieval quality against."),
    line("Deletion SLA", num(a.deleteSlaDays, 0, "days"), "What you have promised, statutorily or contractually."),
    line("Embedding price", citation("embeddingTokens"), ""),
    line("Generation input price", citation("generationInputTokens"), ""),
    line("Generation output price", citation("generationOutputTokens"), `Assumes ${ANSWER_OUTPUT_TOKENS} output tokens per answer.`),
    line("Vector index sizing", `${EMBEDDING_DIMENSIONS} dimensions at ${BYTES_PER_DIMENSION} bytes`, "float32 vectors. Quantising to int8 cuts this by four with some recall loss."),
  ];
}

/**
 * Computed lines for Week 11.
 *
 * @param {Record<string, number>} c
 * @param {Record<string, number>} m
 * @returns {import("./kit.js").Line[]}
 */
function ragLines(c, m) {
  return [
    line("Chunks in the index", Math.round(c.chunks).toLocaleString("en-US"), "The real unit of a retrieval corpus. Deletion, cost, and retrieval all operate on chunks, not documents."),
    line("Documents containing personal data", `${Math.round(m.personalDocs).toLocaleString("en-US")} documents`, "Everything in scope for retention limits, deletion rights, and access control."),
    line("Cost to embed the corpus once", money(c.embedOnce), `Whole corpus at ${citation("embeddingTokens")}.`),
    line("Reindex passes per year", num(c.passesPerYear, 1, ""), "How often the whole corpus is re-embedded."),
    line("Embedding cost per year", money(c.embedAnnual), "One pass times passes per year. Halving the reindex interval doubles this line."),
    line("Vector index size", num(c.vectorGib, 2, "GiB"), `${EMBEDDING_DIMENSIONS} float32 dimensions per chunk. Vectors are often larger than the text they represent.`),
    line("Vector storage per year", money(c.vectorStorageAnnual), `At ${citation("objectStorageStandard")}. Usually the smallest of the three bills.`),
    line("Cost of one answer", money(c.perAnswer), `${m.chunksPerAnswer} retrieved chunks as input, plus ${ANSWER_OUTPUT_TOKENS} output tokens.`),
    line("Answer generation per year", money(c.answersAnnual), "Cost per answer times your question volume. This is the line that scales with adoption."),
    line("Total corpus cost per year", money(c.embedAnnual + c.vectorStorageAnnual + c.answersAnnual), "Indexing plus storage plus answering. Compare against what the corpus is worth to whoever asked for it."),
    line("Maximum index staleness", num(m.reindexDays, 0, "days"), "Worst case age of what the index believes. A user cannot tell a stale answer from a wrong one."),
    line("Evaluation set coverage", num(m.evalCoverage, 2, "percent of corpus"), "Share of the corpus you actually measure. Below one percent, rare document types are invisible."),
    line("Retention horizon", num(m.retentionMonths, 0, "months"), "How long a document remains retrievable, independent of its source system."),
  ];
}

/**
 * Warnings for Week 11.
 *
 * @param {Record<string, number>} a
 * @returns {string[]}
 */
function ragWarnings(a) {
  const warnings = [];
  if (a.deleteSlaDays > a.reindexDays) {
    warnings.push(`Your deletion SLA of ${num(a.deleteSlaDays, 0, "days")} is longer than your reindex interval. Deleted records stay retrievable in the index until the next reindex.`);
  }
  if (a.evalCoverage < 1) {
    warnings.push("An evaluation set under one percent of the corpus will not detect retrieval regressions on rare document types.");
  }
  if (a.c.answersAnnual > a.c.embedAnnual * 10) {
    warnings.push("Answer generation costs more than ten times what indexing costs. Optimising the reindex schedule will not move this bill; retrieving fewer chunks per answer will.");
  }
  return warnings;
}

const AGENT_SCOPES = ["Read public tables", "Read internal tables", "Read tables containing personal data", "Write to staging", "Write to production"];

/** How an agent may prove what it is. */
const AUTH_METHODS = ["Static API key", "Short-lived vended credential", "Workload identity federation"];

/**
 * Read the grant for every agent scope.
 *
 * @param {Record<string, unknown>} input
 * @returns {{ scope: string, granted: string }[]}
 */
function readGrants(input) {
  return AGENT_SCOPES.map((scope) => ({
    scope,
    granted: requireChoice(input[`grant${scope.replace(/\s+/g, "")}`], `${scope} grant`, ["Granted", "Denied"]),
  }));
}

/**
 * Week 12. Builds an agent access scope matrix, surfaces the blast radius, and
 * prices what an unattended reader costs to run.
 *
 * @param {Record<string, unknown>} input
 * @returns {import("./kit.js").ToolResult}
 */
export function buildScopeMatrix(input) {
  const authMethod = requireChoice(input.authMethod, "Agent authentication method", AUTH_METHODS);
  const tokenMinutes = requirePositive(input.credentialLifetimeMinutes, "Credential lifetime in minutes");
  const humanApproval = requireChoice(input.humanInLoop, "Human approval before write", ["Required", "Not required"]);
  const queriesPerDay = requirePositive(input.agentQueriesPerDay, "Agent queries per day");
  const gibPerQuery = requirePositive(input.gibScannedPerQuery, "GiB scanned per agent query");
  const grants = readGrants(input);

  const grantedCount = grants.filter((g) => g.granted === "Granted").length;
  const exposureWindow = authMethod === "Static API key" ? Number.POSITIVE_INFINITY : tokenMinutes;
  const writesGranted = grants.some((g) => g.scope.startsWith("Write") && g.granted === "Granted");
  const personalGranted = grants.some((g) => g.scope.includes("personal data") && g.granted === "Granted");
  const perQuery = (gibToGb(gibPerQuery) / 1000) * rate("scanPerTb").unitPriceUsd;
  const annualScan = perQuery * queriesPerDay * 365;

  return {
    computed: agentLines(grants, { grantedCount, exposureWindow, writesGranted, humanApproval, perQuery, annualScan, queriesPerDay }),
    assumptions: [
      line("Authentication method", authMethod, "How the agent proves what it is before anything else happens."),
      line("Credential lifetime", num(tokenMinutes, 0, "minutes"), "Ignored entirely when the method is a static key, which has no expiry."),
      line("Human approval before write", humanApproval, "An approval gate everyone rubber-stamps costs latency and buys nothing."),
      line("Agent queries per day", queriesPerDay.toLocaleString("en-US"), "Automated volume. Typically an order of magnitude above human volume."),
      line("Bytes scanned per query", num(gibPerQuery, 2, "GiB"), "What one agent question actually reads off disk."),
      line("Scan price", citation("scanPerTb"), "List price, no negotiated discount applied."),
    ],
    unresolved: [
      "State how you would detect an agent reading more than it should, given that an over-broad grant produces no error and no complaint.",
      "Name the human accountable for each granted scope. An agent cannot be accountable, so somebody must be.",
      "State what you revoke first when an agent misbehaves, and how long revocation takes to take effect.",
      "You have priced this agent's reads. State the budget owner, and what happens when the agent's volume changes without a human deciding it should.",
    ],
    warnings: agentWarnings({ authMethod, writesGranted, humanApproval, personalGranted, annualScan }),
    visuals: [
      matrixChart(
        "What this agent may reach",
        "Every granted row is inside the blast radius of one credential, whether or not the agent ever uses it.",
        grants.map((g) => point(g.scope, g.granted === "Granted" ? 1 : 0, g.granted))
      ),
      barChart(
        "What an unattended reader costs per year",
        "USD per year",
        "The right bar is the same agent after somebody changes a configuration value. No hiring approval is involved.",
        [
          point("At stated volume", annualScan, usd(annualScan)),
          point("At triple volume", annualScan * 3, usd(annualScan * 3)),
        ]
      ),
    ],
  };
}

/**
 * Computed lines for Week 12.
 *
 * @param {{ scope: string, granted: string }[]} grants
 * @param {Record<string, unknown>} a
 * @returns {import("./kit.js").Line[]}
 */
function agentLines(grants, a) {
  const exposureWindow = Number(a.exposureWindow);
  const perQuery = Number(a.perQuery);
  const annualScan = Number(a.annualScan);
  return [
    ...grants.map((g) => line(g.scope, g.granted, g.granted === "Granted" ? "In the blast radius of this agent's credential, whether or not it ever reads this." : "Outside the blast radius while this grant stays denied.")),
    line("Scopes granted", num(Number(a.grantedCount), 0, `of ${AGENT_SCOPES.length}`), "Count of what one compromised credential reaches."),
    line("Credential exposure window", Number.isFinite(exposureWindow) ? num(exposureWindow, 0, "minutes") : "Unbounded", "How long a stolen credential stays valid with nobody intervening."),
    line("Write path", a.writesGranted === true ? `Granted, approval ${String(a.humanApproval).toLowerCase()}` : "No write access", "Reads are recoverable. Writes are the ones that reach production."),
    line("Cost of one agent query", money(perQuery), `Bytes scanned at ${citation("scanPerTb")}. An agent pays the same per-TB price a human does.`),
    line("Agent read spend per year", usd(annualScan), "Unattended queries at your stated volume. Nobody complains about this bill because nobody is waiting on the result."),
    line("Cost of one agent, per day", money(perQuery * Number(a.queriesPerDay)), "The daily run rate of an identity that never sleeps and never gets bored."),
    line("Spend if query volume triples", usd(annualScan * 3), "Agents scale by configuration change, not by hiring. Budget for the configuration change."),
  ];
}

/**
 * Warnings for Week 12.
 *
 * @param {Record<string, unknown>} a
 * @returns {string[]}
 */
function agentWarnings(a) {
  const warnings = [];
  if (a.authMethod === "Static API key") {
    warnings.push("A static key has no expiry. A leaked key stays valid until somebody notices, and nobody is watching an agent.");
  }
  if (a.writesGranted === true && a.humanApproval === "Not required") {
    warnings.push("Unattended writes with no approval gate mean an incorrect agent action reaches production with no human signal.");
  }
  if (a.personalGranted === true) {
    warnings.push("Personal data in agent scope pulls this decision into your Week 9 privacy position and your Week 11 retention policy.");
  }
  if (typeof a.annualScan === "number" && a.annualScan > 100000) {
    warnings.push(`This agent reads ${usd(a.annualScan)} of data per year. That is a headcount-sized line item attached to an identity with no manager.`);
  }
  return warnings;
}

export { AI_ACT_MILESTONES, AGENT_SCOPES, CRITERIA };
