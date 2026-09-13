/**
 * The formula specifications, one per course week and one per deliverable,
 * in the order the picker shows them.
 *
 * This is the single place the arithmetic is written down in Excel terms. The
 * workbook and the equations shown beside the week picker are both rendered
 * from it, so the two cannot disagree, and the test suite evaluates every
 * expression here against the tool that computes the same figure in
 * JavaScript. If a tool changes and this file does not, the suite fails.
 */

import { BUDGET_SPEC, CATALOG_SPEC, LOCK_IN_SPEC, SIZING_SPEC } from "./platform.js";
import { BUILD_VS_BUY_SPEC, CONTROL_SPEC, CUT_SPEC } from "./economics.js";
import {
  AGENT_SPEC,
  AI_ACT_SPEC,
  OPERATING_MODEL_SPEC,
  PRIVACY_SPEC,
  RAG_SPEC,
} from "./governance.js";
import { FINAL_ARTIFACT_SPEC, MODULE_1_SPEC, MODULE_2_SPEC, MODULE_3_SPEC } from "./modules.js";
import { SpecError } from "./kit.js";
import { renderEquations } from "./render.js";

/** @type {readonly import("./kit.js").FormulaSpec[]} */
export const SPECS = Object.freeze([
  SIZING_SPEC,
  LOCK_IN_SPEC,
  CATALOG_SPEC,
  BUDGET_SPEC,
  CUT_SPEC,
  BUILD_VS_BUY_SPEC,
  CONTROL_SPEC,
  OPERATING_MODEL_SPEC,
  PRIVACY_SPEC,
  AI_ACT_SPEC,
  RAG_SPEC,
  AGENT_SPEC,
  MODULE_1_SPEC,
  MODULE_2_SPEC,
  MODULE_3_SPEC,
  FINAL_ARTIFACT_SPEC,
]);

/**
 * Look up one week's specification by tool slug.
 *
 * @param {string} slug
 * @returns {import("./kit.js").FormulaSpec}
 */
export function findSpec(slug) {
  const found = SPECS.find((candidate) => candidate.slug === slug);
  if (found === undefined) {
    throw new SpecError(`No formula specification is registered for "${slug}".`);
  }
  return found;
}

/**
 * The equations for one week, as the client renders them: the figure, the
 * equation in words, the Excel formula, and the cell it occupies on the
 * workbook sheet so a student can check it against the file.
 *
 * @param {string} slug
 * @returns {Record<string, unknown>}
 */
export function describeEquations(slug) {
  const found = SPECS.find((candidate) => candidate.slug === slug);
  if (found === undefined) {
    return { sheetName: "", equations: [], unmodelled: [] };
  }
  return {
    sheetName: found.sheetName,
    equations: renderEquations(found),
    unmodelled: found.unmodelled,
  };
}
