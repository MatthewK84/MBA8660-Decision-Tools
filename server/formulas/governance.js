/**
 * Formula specifications for Weeks 8 to 12, mirroring server/tools/governance.js.
 *
 * Two of these weeks compute over lists: five weighted criteria in Week 8 and
 * five agent scopes in Week 12. Both generate their cells from the same
 * constants the tools use, so the sheet cannot drift from the application by
 * gaining or losing a row.
 */

import { constant, dateConstant, input, output, publishedRate, spec, unmodelled } from "./kit.js";
import { AGENT_SCOPES, AI_ACT_MILESTONES, CRITERIA } from "../tools/governance.js";
import { DEFAULT_BLENDED_HOURLY_USD } from "../reference/rates.js";
import { excelSerial } from "./render.js";

/** Bytes per gibibyte, and gigabytes per gibibyte. Both appear on the sheets. */
const BYTES_PER_GIB = 1024 ** 3;
const GB_PER_GIB = 1024 ** 3 / 1000 ** 3;

/**
 * Strip the spaces out of a criterion or scope name to build a cell key, the
 * same way the tools build their input keys.
 *
 * @param {string} name
 * @returns {string}
 */
function keyPart(name) {
  return name.replace(/\s+/g, "");
}

/**
 * Weight and score cells for all five criteria.
 *
 * @returns {import("./kit.js").InputCell[]}
 */
function criteriaInputs() {
  return CRITERIA.flatMap((criterion) => {
    const part = keyPart(criterion);
    return [
      input(`weight${part}`, `${criterion} weight`, "0 to 10", "How much this criterion matters to your case organization."),
      input(`central${part}`, `${criterion}, centralized score`, "0 to 10", "Your judgment of how the centralized model performs here."),
      input(`federated${part}`, `${criterion}, federated score`, "0 to 10", "Your judgment of how the federated model performs here."),
    ];
  });
}

/**
 * The weighted sum of one model's scores, as an Excel expression.
 *
 * @param {string} prefix
 * @returns {(ref: (key: string) => string) => string}
 */
function weightedSum(prefix) {
  return (ref) =>
    CRITERIA.map((criterion) => `${ref(`weight${keyPart(criterion)}`)}*${ref(`${prefix}${keyPart(criterion)}`)}`).join("+");
}

/** @type {import("./kit.js").FormulaSpec} */
export const OPERATING_MODEL_SPEC = spec({
  slug: "governance-model",
  week: 8,
  title: "Operating Model Weighting and Staffing Cost",
  inputs: [
    ...criteriaInputs(),
    input("centralFteCount", "Central platform headcount", "engineers", "Size of one central data platform team."),
    input("federatedFtePerDomain", "Engineers per domain", "engineers", "Embedded data engineers each domain would hire."),
    input("domainCount", "Business domains", "domains", "The multiplier on federated headcount."),
    input("fullyLoadedFteUsd", "Cost per engineer", "USD per year", "Salary, payroll tax, benefits, equipment, and overhead."),
  ],
  constants: [
    constant("enablementShare", "Central team retained under federation", 2, "divisor", "The federated model keeps a half-size central enablement team, so headcount is divided by two and rounded up."),
    constant("minimumMargin", "Floor on the score margin", 0.01, "points", "Prevents a division by zero when the two models score identically."),
  ],
  outputs: [
    output("totalWeight", "Total weight", "points", (ref) => CRITERIA.map((criterion) => ref(`weight${keyPart(criterion)}`)).join("+"), {
      note: "The divisor that turns weighted sums into a score out of ten.",
    }),
    output("centralWeighted", "Centralized weighted sum", "points", weightedSum("central"), {
      note: "Each centralized score times its weight.",
    }),
    output("federatedWeighted", "Federated weighted sum", "points", weightedSum("federated"), {
      note: "Each federated score times its weight.",
    }),
    output("centralScore", "Weighted centralized score", "of 10", (r) => `${r("centralWeighted")}/${r("totalWeight")}`, {
      match: "Weighted centralized score",
    }),
    output("federatedScore", "Weighted federated score", "of 10", (r) => `${r("federatedWeighted")}/${r("totalWeight")}`, {
      match: "Weighted federated score",
    }),
    output("margin", "Margin", "points", (r) => `ABS(${r("centralScore")}-${r("federatedScore")})`, {
      match: "Margin",
      note: "Under half a point, the weights are deciding rather than the evidence.",
    }),
    output("centralCost", "Centralized staffing cost per year", "USD per year", (r) => `${r("centralFteCount")}*${r("fullyLoadedFteUsd")}`, {
      match: "Centralized staffing cost per year",
      format: "usd",
    }),
    output("federatedCost", "Federated staffing cost per year", "USD per year", (r) => `(${r("domainCount")}*${r("federatedFtePerDomain")}+CEILING(${r("centralFteCount")}/${r("enablementShare")},1))*${r("fullyLoadedFteUsd")}`, {
      match: "Federated staffing cost per year",
      format: "usd",
      note: "Domains times engineers each, plus a half-size central enablement team.",
    }),
    output("staffingDifference", "Annual staffing difference", "USD per year", (r) => `ABS(${r("federatedCost")}-${r("centralCost")})`, {
      match: "Annual staffing difference",
      format: "usd",
      note: "Operating models are mostly a payroll decision. This is the size of it.",
    }),
    output("costPerPoint", "Cost per point of weighted score", "USD per point", (r) => `${r("staffingDifference")}/MAX(${r("margin")},${r("minimumMargin")})`, {
      match: "Cost per point of weighted score",
      format: "usd",
      note: "What the dearer model costs per point of advantage your own weights gave it.",
    }),
  ],
  unmodelled: [
    unmodelled("Speed of change (weight", "Echoes one criterion's scores as a sentence."),
    unmodelled("Consistency of definitions (weight", "Echoes one criterion's scores as a sentence."),
    unmodelled("Domain expertise (weight", "Echoes one criterion's scores as a sentence."),
    unmodelled("Audit burden (weight", "Echoes one criterion's scores as a sentence."),
    unmodelled("Staffing reality (weight", "Echoes one criterion's scores as a sentence."),
    unmodelled("Weighted result", "Printed only when every weight is zero, in which case there is nothing to compute."),
  ],
});

/** @type {import("./kit.js").FormulaSpec} */
export const PRIVACY_SPEC = spec({
  slug: "privacy-paths",
  week: 9,
  title: "Privacy Compliance Path Cost",
  inputs: [
    input("stateCount", "States in scope", "states", "States whose statutes reach your data subjects."),
    input("strictestState", "Strictest state driving the standard", "", "The state whose rule sets your national floor.", "text"),
    input("nationalBuildUsd", "National standard build", "USD", "One-time cost to build to the strictest standard."),
    input("nationalAnnualUsd", "National standard annual", "USD per year", "One jurisdiction's worth of process applied to all of them."),
    input("perStateBuildUsd", "Per-state build", "USD", "One-time cost per state."),
    input("perStateAnnualUsd", "Per-state annual", "USD per year", "The line that compounds."),
    input("horizonYears", "Horizon", "years", "Longer horizons favour the one-time build."),
    input("deletionRequestsPerYear", "Deletion requests per year", "requests", "Statutory deletion and access requests you expect to service."),
    input("hoursPerDeletionRequest", "Hours per request", "hours", "Manual effort per request today."),
  ],
  constants: [
    constant("blendedHourlyUsd", "Blended hourly cost", DEFAULT_BLENDED_HOURLY_USD, "USD per hour", "An organizational assumption, not a published price. Salary divided by 2,080 understates it badly."),
  ],
  outputs: [
    output("nationalTotal", "National standard over the horizon", "USD", (r) => `${r("nationalBuildUsd")}+${r("nationalAnnualUsd")}*${r("horizonYears")}`, {
      match: "National standard over",
      format: "usd",
      note: "Build once to the strictest rule, run it everywhere.",
    }),
    output("stateTotal", "Per-state compliance over the horizon", "USD", (r) => `${r("perStateBuildUsd")}*${r("stateCount")}+${r("perStateAnnualUsd")}*${r("stateCount")}*${r("horizonYears")}`, {
      match: "Per-state compliance over",
      format: "usd",
      note: "Separate builds and separate annual programmes, one set per state.",
    }),
    output("difference", "Difference", "USD", (r) => `ABS(${r("stateTotal")}-${r("nationalTotal")})`, {
      match: "Difference",
      format: "usd",
      note: "The size of the decision, over the horizon you stated.",
    }),
    output("crossover", "States at which the two paths cost the same", "states", (r) => `(${r("nationalBuildUsd")}+${r("nationalAnnualUsd")}*${r("horizonYears")})/(${r("perStateBuildUsd")}+${r("perStateAnnualUsd")}*${r("horizonYears")})`, {
      match: "States at which the two paths cost the same",
      note: "Below this count, per-state is cheaper. Above it, the national standard is.",
    }),
    output("dsarAnnual", "Deletion request handling per year", "USD per year", (r) => `${r("deletionRequestsPerYear")}*${r("hoursPerDeletionRequest")}*${r("blendedHourlyUsd")}`, {
      match: "Deletion request handling per year",
      format: "usd",
      note: "Recurs on both paths and grows with your customer base.",
    }),
    output("perRequest", "Cost per deletion request", "USD", (r) => `${r("dsarAnnual")}/${r("deletionRequestsPerYear")}`, {
      match: "Cost per deletion request",
      format: "money",
      note: "Automation is justified against this figure, not against the total.",
    }),
    output("nationalPerStatePerYear", "National standard, per state per year", "USD", (r) => `${r("nationalTotal")}/${r("horizonYears")}/${r("stateCount")}`, {
      match: "National standard, per state per year",
      format: "money",
      note: "Compare it against the per-state annual figure you entered.",
    }),
  ],
  unmodelled: [unmodelled("Cheaper on this model", "Names the cheaper path. Cheaper is not the same as correct.")],
});

/**
 * One date cell per EU AI Act milestone.
 *
 * @returns {import("./kit.js").ConstantCell[]}
 */
function milestoneConstants() {
  return AI_ACT_MILESTONES.map((milestone, index) =>
    dateConstant(`milestone${index + 1}`, milestone.iso, excelSerial(milestone.iso), milestone.label)
  );
}

/**
 * One day-count cell per milestone, measured from the assessment date.
 *
 * @returns {import("./kit.js").OutputCell[]}
 */
function milestoneOutputs() {
  return AI_ACT_MILESTONES.map((milestone, index) =>
    output(`daysTo${index + 1}`, `Days to ${milestone.iso}`, "days", (r) => `ROUND(${r(`milestone${index + 1}`)}-${r("assessmentDate")},0)`, {
      note: `${milestone.label} A negative figure means the obligation is already in force.`,
    })
  );
}

/** Position of the Annex III standalone high-risk milestone in the list. */
const ANNEX_III_INDEX = AI_ACT_MILESTONES.findIndex((milestone) => milestone.iso === "2027-12-02") + 1;

/** @type {import("./kit.js").FormulaSpec} */
export const AI_ACT_SPEC = spec({
  slug: "ai-act",
  week: 10,
  title: "EU AI Act Exposure Timeline",
  inputs: [
    input("assessmentDate", "Assessed as of", "date", "Every day count is measured from this date. The application uses the day you run it.", "date"),
    input("role", "Your role under the Act", "", "Provider, Deployer, Both, or Neither.", "text"),
    input("annexIiiUseCase", "Annex III use case in scope", "", "Yes, No, or Unsure. Unsure is a finding, not a gap.", "text"),
    input("usesGpai", "Uses a general-purpose AI model", "", "Yes or No.", "text"),
    input("generatesSyntheticContent", "Generates synthetic content", "", "Yes or No. Triggers Article 50 duties, already in force.", "text"),
    input("readinessHours", "Readiness effort", "hours", "Your estimate of the work to reach compliance."),
    input("blendedHourlyUsd", "Blended hourly cost", "USD per hour", "Fully loaded cost of an engineering or compliance hour."),
  ],
  constants: [
    ...milestoneConstants(),
    constant("daysPerWeek", "Days per week", 7, "days", ""),
  ],
  outputs: [
    ...milestoneOutputs(),
    output("readinessCost", "Readiness cost", "USD", (r) => `${r("readinessHours")}*${r("blendedHourlyUsd")}`, {
      match: "Readiness cost",
      format: "usd",
      note: "Compliance work is engineering work, paid for out of the same budget.",
    }),
    output("daysToAnnex", "Days until Annex III obligations apply", "days", (r) => `${r(`daysTo${ANNEX_III_INDEX}`)}`, {
      match: "Days until Annex III obligations apply",
      note: "Measured from your assessment date to 2 December 2027.",
    }),
    output("hoursPerWeek", "Sustained effort to be ready in time", "hours per week", (r) => `IF(${r("daysToAnnex")}>0,${r("readinessHours")}/(${r("daysToAnnex")}/${r("daysPerWeek")}),${r("readinessHours")})`, {
      match: "Sustained effort to be ready in time",
      note: "If this exceeds your team's slack, the deferral did not buy you what you think.",
    }),
  ],
  unmodelled: [
    ...AI_ACT_MILESTONES.map((milestone) => unmodelled(milestone.iso, "States one milestone and whether it is in force. The day count beside it is on the sheet.")),
    unmodelled("Flag ", "Raised by the posture you stated, not by a calculation."),
  ],
});

/** @type {import("./kit.js").FormulaSpec} */
export const RAG_SPEC = spec({
  slug: "rag-retention",
  week: 11,
  title: "Retrieval Corpus Retention and Cost",
  inputs: [
    input("documentCount", "Documents in corpus", "documents", "Source documents before chunking."),
    input("tokensPerDocument", "Tokens per document", "tokens", "Roughly 750 words per 1,000 tokens."),
    input("chunkTokens", "Tokens per chunk", "tokens", "Smaller chunks retrieve more precisely and cost more to embed and store."),
    input("chunksPerAnswer", "Chunks retrieved per answer", "chunks", "Every retrieved chunk is billed as input tokens on every question."),
    input("questionsPerDay", "Questions per day", "questions", "Drives the generation bill, which recurs forever."),
    input("percentPersonalData", "Share containing personal data", "percent", "Sets the perimeter for retention, deletion, and access control."),
    input("retentionMonths", "Retention period", "months", "How long a document stays in the corpus."),
    input("reindexIntervalDays", "Reindex interval", "days", "Sets both maximum staleness and how often you pay to embed."),
    input("evalSetSize", "Evaluation set size", "documents", "The sample you measure retrieval quality against."),
    input("deletionSlaDays", "Deletion request SLA", "days", "What you have promised, statutorily or contractually."),
  ],
  constants: [
    constant("embeddingDimensions", "Embedding dimensions", 1024, "dimensions", "Titan Text Embeddings V2 default output size."),
    constant("bytesPerDimension", "Bytes per dimension", 4, "bytes", "float32. Quantising to int8 cuts this by four with some recall loss."),
    constant("answerOutputTokens", "Output tokens per answer", 400, "tokens", "Assumed length of one generated answer."),
    constant("tokensPerPricedBlock", "Tokens per priced block", 1000000, "tokens", "Token prices are quoted per million."),
    constant("bytesPerGib", "Bytes per GiB", BYTES_PER_GIB, "bytes", "1,024 cubed."),
    constant("gbPerGib", "GB per GiB", GB_PER_GIB, "GB", "Index size is measured in GiB and storage is billed in GB."),
    constant("daysPerYear", "Days per year", 365, "days", ""),
    constant("monthsPerYear", "Months per year", 12, "months", ""),
    publishedRate("embedRate", "Embedding price", "embeddingTokens"),
    publishedRate("generationInputRate", "Generation input price", "generationInputTokens"),
    publishedRate("generationOutputRate", "Generation output price", "generationOutputTokens"),
    publishedRate("storageRate", "Object storage price", "objectStorageStandard"),
  ],
  outputs: [
    output("corpusTokens", "Tokens in the corpus", "tokens", (r) => `${r("documentCount")}*${r("tokensPerDocument")}`, {
      note: "Documents times tokens each. The quantity you pay to embed.",
    }),
    output("chunks", "Chunks in the index", "chunks", (r) => `${r("corpusTokens")}/${r("chunkTokens")}`, {
      match: "Chunks in the index",
      note: "The real unit of a retrieval corpus. Deletion, cost, and retrieval all operate on chunks.",
    }),
    output("personalDocs", "Documents containing personal data", "documents", (r) => `${r("documentCount")}*${r("percentPersonalData")}/100`, {
      match: "Documents containing personal data",
      note: "Everything in scope for retention limits, deletion rights, and access control.",
    }),
    output("embedOnce", "Cost to embed the corpus once", "USD", (r) => `${r("corpusTokens")}/${r("tokensPerPricedBlock")}*${r("embedRate")}`, {
      match: "Cost to embed the corpus once",
      format: "money",
    }),
    output("passesPerYear", "Reindex passes per year", "passes", (r) => `${r("daysPerYear")}/${r("reindexIntervalDays")}`, {
      match: "Reindex passes per year",
      note: "How often the whole corpus is re-embedded.",
    }),
    output("embedAnnual", "Embedding cost per year", "USD per year", (r) => `${r("embedOnce")}*${r("passesPerYear")}`, {
      match: "Embedding cost per year",
      format: "money",
      note: "Halving the reindex interval doubles this line.",
    }),
    output("vectorGib", "Vector index size", "GiB", (r) => `${r("chunks")}*${r("embeddingDimensions")}*${r("bytesPerDimension")}/${r("bytesPerGib")}`, {
      match: "Vector index size",
      note: "Vectors are often larger than the text they represent.",
    }),
    output("vectorStorageAnnual", "Vector storage per year", "USD per year", (r) => `${r("vectorGib")}*${r("gbPerGib")}*${r("storageRate")}*${r("monthsPerYear")}`, {
      match: "Vector storage per year",
      format: "money",
      note: "Usually the smallest of the three bills.",
    }),
    output("inputTokensPerAnswer", "Input tokens per answer", "tokens", (r) => `${r("chunksPerAnswer")}*${r("chunkTokens")}`, {
      note: "Every retrieved chunk is paid for on every question.",
    }),
    output("perAnswer", "Cost of one answer", "USD", (r) => `${r("inputTokensPerAnswer")}/${r("tokensPerPricedBlock")}*${r("generationInputRate")}+${r("answerOutputTokens")}/${r("tokensPerPricedBlock")}*${r("generationOutputRate")}`, {
      match: "Cost of one answer",
      format: "money",
      note: "Retrieved chunks as input, plus the assumed output length.",
    }),
    output("answersAnnual", "Answer generation per year", "USD per year", (r) => `${r("perAnswer")}*${r("questionsPerDay")}*${r("daysPerYear")}`, {
      match: "Answer generation per year",
      format: "money",
      note: "The line that scales with adoption.",
    }),
    output("corpusAnnual", "Total corpus cost per year", "USD per year", (r) => `${r("embedAnnual")}+${r("vectorStorageAnnual")}+${r("answersAnnual")}`, {
      match: "Total corpus cost per year",
      format: "money",
    }),
    output("evalCoverage", "Evaluation set coverage", "percent of corpus", (r) => `${r("evalSetSize")}/${r("documentCount")}*100`, {
      match: "Evaluation set coverage",
      note: "Below one percent, rare document types are invisible.",
    }),
  ],
  unmodelled: [
    unmodelled("Maximum index staleness", "Echoes the reindex interval you entered."),
    unmodelled("Retention horizon", "Echoes the retention period you entered."),
  ],
});

/**
 * A grant cell per agent scope.
 *
 * @returns {import("./kit.js").InputCell[]}
 */
function scopeInputs() {
  return AGENT_SCOPES.map((scope) =>
    input(`grant${keyPart(scope)}`, scope, "", "Granted or Denied. Every granted row is inside the blast radius of one credential.", "text")
  );
}

/** @type {import("./kit.js").FormulaSpec} */
export const AGENT_SPEC = spec({
  slug: "agent-access",
  week: 12,
  title: "Agent Access Scope and Run Cost",
  inputs: [
    input("authMethod", "Agent authentication method", "", "Static API key, Short-lived vended credential, or Workload identity federation.", "text"),
    input("credentialLifetimeMinutes", "Credential lifetime", "minutes", "Ignored when the method is a static key, which has no expiry."),
    input("humanInLoop", "Human approval before write", "", "Required or Not required.", "text"),
    input("agentQueriesPerDay", "Agent queries per day", "queries", "Automated volume, typically an order of magnitude above human volume."),
    input("gibScannedPerQuery", "Bytes scanned per query", "GiB", "What one agent question actually reads off disk."),
    ...scopeInputs(),
  ],
  constants: [
    constant("gbPerGib", "GB per GiB", GB_PER_GIB, "GB", "Scan volume is measured in GiB and billed in decimal TB."),
    constant("gbPerTb", "GB per TB", 1000, "GB", ""),
    constant("daysPerYear", "Days per year", 365, "days", ""),
    constant("volumeMultiple", "Volume multiple for the stress case", 3, "x", "Agents scale by configuration change, not by hiring."),
    publishedRate("scanRate", "Scan price", "scanPerTb"),
  ],
  outputs: [
    output("grantedCount", "Scopes granted", `of ${AGENT_SCOPES.length}`, (ref) => AGENT_SCOPES.map((scope) => `IF(${ref(`grant${keyPart(scope)}`)}="Granted",1,0)`).join("+"), {
      match: "Scopes granted",
      note: "Count of what one compromised credential reaches.",
    }),
    output("exposureWindow", "Credential exposure window", "minutes", (r) => `IF(${r("authMethod")}="Static API key","Unbounded",${r("credentialLifetimeMinutes")})`, {
      match: "Credential exposure window",
      note: "How long a stolen credential stays valid with nobody intervening. A static key never expires.",
    }),
    output("perQuery", "Cost of one agent query", "USD", (r) => `${r("gibScannedPerQuery")}*${r("gbPerGib")}/${r("gbPerTb")}*${r("scanRate")}`, {
      match: "Cost of one agent query",
      format: "money",
      note: "An agent pays the same per-TB price a human does.",
    }),
    output("perDay", "Cost of one agent, per day", "USD per day", (r) => `${r("perQuery")}*${r("agentQueriesPerDay")}`, {
      match: "Cost of one agent, per day",
      format: "money",
      note: "The daily run rate of an identity that never sleeps.",
    }),
    output("annualScan", "Agent read spend per year", "USD per year", (r) => `${r("perDay")}*${r("daysPerYear")}`, {
      match: "Agent read spend per year",
      format: "usd",
      note: "Nobody complains about this bill because nobody is waiting on the result.",
    }),
    output("tripleAnnual", "Spend if query volume triples", "USD per year", (r) => `${r("annualScan")}*${r("volumeMultiple")}`, {
      match: "Spend if query volume triples",
      format: "usd",
      note: "Budget for the configuration change.",
    }),
  ],
  unmodelled: [
    ...AGENT_SCOPES.map((scope) => unmodelled(scope, "States whether that scope is granted. The Inputs block holds the grant itself.")),
    unmodelled("Write path", "Restates the write grants and the approval gate as a sentence."),
  ],
});
