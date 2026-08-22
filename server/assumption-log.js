/**
 * Builds the assumption log a student attaches to their Canvas submission.
 * This is the only artifact the application produces. Nothing is stored.
 *
 * @typedef {{
 *   courseCode: string,
 *   week: number,
 *   toolTitle: string,
 *   decision: string,
 *   generatedAt: string,
 *   computed: import("./tools/kit.js").Line[],
 *   assumptions: import("./tools/kit.js").Line[],
 *   unresolved: { question: string, answer: string }[],
 *   warnings: string[],
 *   terms: { term: string, plain: string }[]
 * }} AssumptionLog
 */

import { InputError } from "./tools/kit.js";

/**
 * Pair each unresolved question with the student's written answer.
 *
 * @param {string[]} questions
 * @param {unknown} rawAnswers
 * @returns {{ question: string, answer: string }[]}
 */
function pairAnswers(questions, rawAnswers) {
  const answers = Array.isArray(rawAnswers) ? rawAnswers : [];
  return questions.map((question, index) => {
    const candidate = answers[index];
    const answer = typeof candidate === "string" ? candidate.trim() : "";
    if (answer === "") {
      throw new InputError(`Unresolved question ${index + 1} needs a written answer before export.`);
    }
    if (answer.length < 40) {
      throw new InputError(`Answer ${index + 1} is too short to be a judgment. Write at least 40 characters.`);
    }
    return { question, answer };
  });
}

/**
 * Assemble the export payload.
 *
 * @param {{ courseCode: string, week: number, toolTitle: string, decision: string, terms?: { term: string, plain: string }[] }} meta
 * @param {import("./tools/kit.js").ToolResult} result
 * @param {unknown} rawAnswers
 * @param {Date} now
 * @returns {AssumptionLog}
 */
export function buildAssumptionLog(meta, result, rawAnswers, now) {
  return {
    courseCode: meta.courseCode,
    week: meta.week,
    toolTitle: meta.toolTitle,
    decision: meta.decision,
    generatedAt: now.toISOString(),
    computed: result.computed,
    assumptions: result.assumptions,
    unresolved: pairAnswers(result.unresolved, rawAnswers),
    warnings: result.warnings,
    terms: meta.terms ?? [],
  };
}
