/**
 * Shared vocabulary for the formula specifications.
 *
 * A specification describes one week's arithmetic once, in Excel syntax, and
 * two renderings fall out of that single description:
 *
 *   the workbook   every output cell carries the formula itself, so a student
 *                  can change an input and watch the sheet recalculate
 *   the interface  the same expression with cell addresses replaced by labels,
 *                  which is the equation written the way a memo would say it
 *
 * Writing the expression twice, once for Excel and once for the screen, is the
 * mistake this file exists to prevent. There is one definition per figure.
 *
 * @typedef {"number" | "usd" | "money" | "text" | "date"} CellFormat
 * @typedef {(key: string) => string} RefFn
 * @typedef {{
 *   kind: "input",
 *   key: string,
 *   label: string,
 *   unit: string,
 *   note: string,
 *   format: CellFormat
 * }} InputCell
 * @typedef {{
 *   kind: "constant",
 *   key: string,
 *   label: string,
 *   unit: string,
 *   note: string,
 *   format: CellFormat,
 *   value: number | string,
 *   rateKey: string
 * }} ConstantCell
 * @typedef {{
 *   kind: "output",
 *   key: string,
 *   label: string,
 *   unit: string,
 *   note: string,
 *   format: CellFormat,
 *   expr: RefFn extends never ? never : (ref: RefFn) => string,
 *   match: string
 * }} OutputCell
 * @typedef {InputCell | ConstantCell | OutputCell} SpecCell
 * @typedef {{
 *   slug: string,
 *   week: number,
 *   title: string,
 *   sheetName: string,
 *   inputs: readonly InputCell[],
 *   constants: readonly ConstantCell[],
 *   outputs: readonly OutputCell[],
 *   unmodelled: readonly { label: string, why: string }[]
 * }} FormulaSpec
 */

/** Thrown when a specification refers to something that does not exist. */
export class SpecError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "SpecError";
  }
}

/**
 * Declare a cell the student fills in.
 *
 * @param {string} key
 * @param {string} label
 * @param {string} unit
 * @param {string} note
 * @param {CellFormat} format
 * @returns {InputCell}
 */
export function input(key, label, unit, note = "", format = "number") {
  return { kind: "input", key, label, unit, note, format };
}

/**
 * Declare a fixed figure the arithmetic leans on, written into its own cell so
 * a student can see it, question it, and change it.
 *
 * @param {string} key
 * @param {string} label
 * @param {number} value
 * @param {string} unit
 * @param {string} note
 * @returns {ConstantCell}
 */
export function constant(key, label, value, unit, note = "") {
  return { kind: "constant", key, label, unit, note, format: "number", value, rateKey: "" };
}

/**
 * Declare a fixed date, stored as the serial number Excel counts dates in so
 * that subtracting two of them yields a number of days.
 *
 * @param {string} key
 * @param {string} label
 * @param {number} serial
 * @param {string} note
 * @returns {ConstantCell}
 */
export function dateConstant(key, label, serial, note = "") {
  return { kind: "constant", key, label, unit: "date", note, format: "date", value: serial, rateKey: "" };
}

/**
 * Declare a published list price, linked to the Rates sheet rather than copied
 * into the week sheet. Changing the price in one place changes every week that
 * uses it, which is the whole reason the Rates sheet exists.
 *
 * @param {string} key
 * @param {string} label
 * @param {string} rateKey
 * @param {string} note
 * @returns {ConstantCell}
 */
export function publishedRate(key, label, rateKey, note = "") {
  return { kind: "constant", key, label, unit: "", note, format: "money", value: 0, rateKey };
}

/**
 * Declare a computed figure.
 *
 * `expr` receives a reference function and returns an Excel expression. Use the
 * reference function for every value; a number written directly into an
 * expression is a number the student cannot find, change, or argue with.
 *
 * `match` is the label of the line this figure appears as in the application,
 * matched as a prefix. An empty string means the figure is an intermediate
 * step that the application does not print but the sheet still needs.
 *
 * @param {string} key
 * @param {string} label
 * @param {string} unit
 * @param {(ref: RefFn) => string} expr
 * @param {{ match?: string, note?: string, format?: CellFormat }} extra
 * @returns {OutputCell}
 */
export function output(key, label, unit, expr, extra = {}) {
  return {
    kind: "output",
    key,
    label,
    unit,
    note: extra.note ?? "",
    format: extra.format ?? "number",
    expr,
    match: extra.match ?? "",
  };
}

/**
 * Declare a line the application prints that carries no equation, and say why.
 *
 * Every printed line is either modelled or listed here. The test suite checks
 * that, so a new line in a tool cannot quietly go missing from the workbook.
 *
 * @param {string} label
 * @param {string} why
 * @returns {{ label: string, why: string }}
 */
export function unmodelled(label, why) {
  return { label, why };
}

/**
 * Assemble one week's specification.
 *
 * @param {{
 *   slug: string,
 *   week: number,
 *   title: string,
 *   inputs: readonly InputCell[],
 *   constants: readonly ConstantCell[],
 *   outputs: readonly OutputCell[],
 *   unmodelled?: readonly { label: string, why: string }[]
 * }} parts
 * @returns {FormulaSpec}
 */
export function spec(parts) {
  return {
    slug: parts.slug,
    week: parts.week,
    title: parts.title,
    sheetName: `Week ${parts.week}`,
    inputs: parts.inputs,
    constants: parts.constants,
    outputs: parts.outputs,
    unmodelled: parts.unmodelled ?? [],
  };
}
