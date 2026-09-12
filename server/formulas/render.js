/**
 * Turns a formula specification into cell addresses, Excel formulas, and the
 * plain-language equations shown beside the week picker.
 *
 * The layout is fixed and the same on every sheet, so a student who has read
 * one week can read all twelve: inputs first, then the rates and constants the
 * arithmetic leans on, then the computed figures. Column B always holds the
 * value, which is why every reference this module emits is a column B address.
 */

import { FormulaError, evaluateFormula } from "./evaluate.js";
import { SpecError } from "./kit.js";
import { rate } from "../reference/rates.js";

/** Column holding every value, on every sheet. */
const VALUE_COLUMN = "B";

/** First row of the first block. Rows 1 and 2 carry the title and the note. */
const FIRST_BLOCK_ROW = 4;

/** Days between the Excel epoch and the Unix epoch, as Excel counts them. */
const EXCEL_EPOCH_OFFSET = 25569;

/**
 * Convert an ISO date to the serial number Excel stores dates as.
 *
 * @param {string} iso
 * @returns {number}
 */
export function excelSerial(iso) {
  const parsed = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed)) {
    throw new SpecError(`Not an ISO date: ${iso}`);
  }
  return parsed / 86400000 + EXCEL_EPOCH_OFFSET;
}

/**
 * Convert an Excel date serial back to an ISO date.
 *
 * @param {number} serial
 * @returns {string}
 */
export function isoFromSerial(serial) {
  const millis = (serial - EXCEL_EPOCH_OFFSET) * 86400000;
  return new Date(millis).toISOString().slice(0, 10);
}

/**
 * Fill in a published rate's value, unit, and citation from the rate table.
 *
 * @param {import("./kit.js").ConstantCell} cell
 * @returns {import("./kit.js").ConstantCell}
 */
function resolveRate(cell) {
  const found = rate(cell.rateKey);
  const note = cell.note === "" ? found.note : cell.note;
  return {
    ...cell,
    unit: found.unitLabel,
    value: found.unitPriceUsd,
    note: `${found.vendor}, ${found.product}. List price retrieved ${found.retrievedAt}. ${note}`,
  };
}

/**
 * Place every cell of one specification on a sheet.
 *
 * @param {import("./kit.js").FormulaSpec} spec
 * @returns {{
 *   blocks: { title: string, caption: string, cells: import("./kit.js").SpecCell[], firstRow: number }[],
 *   addressOf: Record<string, string>,
 *   rowOf: Record<string, number>
 * }}
 */
export function layoutSpec(spec) {
  const constants = spec.constants.map((cell) => (cell.rateKey === "" ? cell : resolveRate(cell)));
  const blocks = [
    { title: "INPUTS YOU SUPPLY", caption: "Change any figure in column B. Every computed cell below recalculates.", cells: [...spec.inputs], firstRow: 0 },
    { title: "RATES AND CONSTANTS", caption: "Published list prices link to the Rates sheet. Change a price there and every week that uses it follows.", cells: constants, firstRow: 0 },
    { title: "COMPUTED", caption: "Each cell holds the formula shown in column D. Nothing here is typed in by hand.", cells: [...spec.outputs], firstRow: 0 },
  ];

  const addressOf = {};
  const rowOf = {};
  let row = FIRST_BLOCK_ROW;

  for (const block of blocks) {
    row += 2;
    block.firstRow = row;
    for (const cell of block.cells) {
      addressOf[cell.key] = `$${VALUE_COLUMN}$${row}`;
      rowOf[cell.key] = row;
      row += 1;
    }
    row += 1;
  }

  return { blocks, addressOf, rowOf };
}

/**
 * Build a reference function that substitutes cell addresses.
 *
 * @param {Record<string, string>} addressOf
 * @returns {(key: string) => string}
 */
function addressRef(addressOf) {
  return (key) => {
    const address = addressOf[key];
    if (address === undefined) {
      throw new SpecError(`No cell is defined for "${key}".`);
    }
    return address;
  };
}

/**
 * Render an expression the way a reader should see it.
 *
 * Labels and quoted text go in last. The expression is first built with
 * numbered placeholders, then spaced, then the placeholders are filled in,
 * because a label such as "Single-node memory ceiling" and a value such as
 * "Self-hosted" both contain a hyphen that operator spacing would otherwise
 * tear in half.
 *
 * @param {(ref: (key: string) => string) => string} expr
 * @param {Record<string, string>} labels
 * @returns {string}
 */
function toPlain(expr, labels) {
  const order = [];
  const placeheld = expr((key) => {
    if (labels[key] === undefined) {
      throw new SpecError(`No label is defined for "${key}".`);
    }
    order.push(key);
    return `_K${order.length - 1}_`;
  });
  const literals = [];
  const hidden = placeheld.replace(/"[^"]*"/g, (literal) => {
    literals.push(literal);
    return `_S${literals.length - 1}_`;
  });
  return spaceOperators(hidden)
    .replace(/_S(\d+)_/g, (_match, index) => literals[Number(index)])
    .replace(/_K(\d+)_/g, (_match, index) => labels[order[Number(index)]]);
}

/**
 * Rewrite an expression so it reads as prose rather than as code: spaced
 * operators, and the multiplication and division signs a reader expects rather
 * than the asterisk and slash Excel wants. The literal formula sits beside this
 * everywhere it is shown, so there is no chance of confusing the two.
 *
 * A minus sign is spaced only where it subtracts, which is after a word or a
 * closing bracket. A minus that negates what follows it stays tight against it,
 * so a negative number never reads as a subtraction.
 *
 * @param {string} expression
 * @returns {string}
 */
function spaceOperators(expression) {
  return expression
    .replace(/\*/g, " \u00d7 ")
    .replace(/\//g, " \u00f7 ")
    .replace(/([+^])/g, " $1 ")
    .replace(/([\w)])-/g, "$1 - ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collect every label in a specification, keyed by cell key.
 *
 * @param {import("./kit.js").FormulaSpec} spec
 * @returns {Record<string, string>}
 */
function labelsOf(spec) {
  const labels = {};
  for (const cell of [...spec.inputs, ...spec.constants, ...spec.outputs]) {
    labels[cell.key] = cell.label;
  }
  return labels;
}

/**
 * Render every equation in a specification, in Excel form and in words.
 *
 * @param {import("./kit.js").FormulaSpec} spec
 * @returns {{
 *   key: string,
 *   label: string,
 *   unit: string,
 *   note: string,
 *   cell: string,
 *   excel: string,
 *   plain: string
 * }[]}
 */
export function renderEquations(spec) {
  const { addressOf } = layoutSpec(spec);
  const toAddress = addressRef(addressOf);
  const labels = labelsOf(spec);
  return spec.outputs.map((cell) => ({
    key: cell.key,
    label: cell.label,
    unit: cell.unit,
    note: cell.note,
    cell: addressOf[cell.key].replace(/\$/g, ""),
    excel: `=${cell.expr(toAddress)}`,
    plain: toPlain(cell.expr, labels),
  }));
}

/**
 * Coerce one supplied input to the type its cell holds. Dates become Excel
 * serial numbers so that date arithmetic in a formula behaves as Excel does.
 *
 * @param {import("./kit.js").InputCell} cell
 * @param {number | string} supplied
 * @returns {number | string}
 */
function readSuppliedValue(cell, supplied) {
  if (cell.format === "date") {
    return excelSerial(String(supplied));
  }
  if (cell.format === "text") {
    return String(supplied);
  }
  const parsed = Number(supplied);
  if (!Number.isFinite(parsed)) {
    throw new SpecError(`"${cell.label}" must be a number, received "${supplied}".`);
  }
  return parsed;
}

/**
 * Evaluate a specification end to end.
 *
 * Inputs and constants are read straight out of the supplied values; outputs
 * are evaluated in declaration order, which is why specifications declare each
 * figure after the figures it depends on.
 *
 * @param {import("./kit.js").FormulaSpec} spec
 * @param {Record<string, number | string>} inputValues
 * @returns {Record<string, number | string | boolean>}
 */
export function evaluateSpec(spec, inputValues) {
  const { addressOf } = layoutSpec(spec);
  const byAddress = {};
  const byKey = {};

  for (const cell of spec.inputs) {
    const supplied = inputValues[cell.key];
    if (supplied === undefined) {
      throw new SpecError(`Week ${spec.week} needs a value for "${cell.key}".`);
    }
    const value = readSuppliedValue(cell, supplied);
    byKey[cell.key] = value;
    byAddress[addressOf[cell.key]] = value;
  }

  for (const cell of spec.constants) {
    const resolved = cell.rateKey === "" ? cell.value : rate(cell.rateKey).unitPriceUsd;
    byKey[cell.key] = resolved;
    byAddress[addressOf[cell.key]] = resolved;
  }

  const lookup = (reference) => {
    const found = byAddress[reference.startsWith("$") ? reference : `$${reference}`];
    if (found === undefined) {
      throw new FormulaError(`Formula referenced empty cell ${reference}.`);
    }
    return found;
  };

  const toAddress = addressRef(addressOf);
  for (const cell of spec.outputs) {
    const value = evaluateFormula(cell.expr(toAddress), lookup);
    byKey[cell.key] = value;
    byAddress[addressOf[cell.key]] = value;
  }

  return byKey;
}
