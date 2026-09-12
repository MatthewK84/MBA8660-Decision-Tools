/**
 * Builds the companion workbook: one sheet per course week, plus the rate card
 * every week draws its published prices from.
 *
 * The point of the file is replication. Every computed cell holds the formula,
 * not a pasted number, and every formula refers to a labelled cell rather than
 * to a figure typed inline. A student can change one input and watch the week
 * recalculate, or change a price on the Rates sheet and watch every week that
 * uses it follow. Nothing is hidden in a helper function, because a
 * spreadsheet has none.
 */

import { SPECS } from "./formulas/index.js";
import { evaluateSpec, layoutSpec, renderEquations } from "./formulas/render.js";
import { allRates } from "./reference/rates.js";
import { blank, buildWorkbook, formulaCell, numberCell, textCell } from "./xlsx.js";
import { findTool } from "./tools/catalog.js";

/** Name of the sheet holding the published prices. */
const RATES_SHEET = "Rates";

/** Column widths shared by every week sheet. */
const WEEK_WIDTHS = [46, 20, 18, 62, 78];

/** Cell style for each declared cell format. */
const STYLE_FOR_FORMAT = Object.freeze({
  number: "number",
  usd: "usd",
  money: "money",
  date: "date",
  text: "default",
});

/**
 * Style a value cell according to what the cell holds.
 *
 * @param {string} format
 * @returns {string}
 */
function styleFor(format) {
  return STYLE_FOR_FORMAT[format] ?? "number";
}

/**
 * Build the Rates sheet and the address of every rate on it.
 *
 * @returns {{ sheet: import("./xlsx.js").Sheet, addressOf: Record<string, string> }}
 */
function buildRatesSheet() {
  const rows = [
    [textCell("Published list prices", "title")],
    [textCell("Every figure is a US-region, on-demand, list price with no negotiated discount applied. Change a price here and every week sheet that uses it recalculates. You are still required to retrieve and date your own prices.", "note")],
    [],
    [
      textCell("Key", "section"),
      textCell("Vendor", "section"),
      textCell("Unit price, USD", "section"),
      textCell("Unit", "section"),
      textCell("Retrieved", "section"),
      textCell("Source", "section"),
      textCell("Note", "section"),
    ],
  ];

  const addressOf = {};
  for (const entry of allRates()) {
    const row = rows.length + 1;
    addressOf[entry.key] = `${RATES_SHEET}!$C$${row}`;
    rows.push([
      textCell(entry.key),
      textCell(`${entry.vendor}, ${entry.product}`),
      numberCell(entry.unitPriceUsd, "money"),
      textCell(entry.unitLabel),
      textCell(entry.retrievedAt),
      textCell(entry.sourceUrl),
      textCell(entry.note, "note"),
    ]);
  }

  return { sheet: { name: RATES_SHEET, widths: [26, 58, 16, 24, 14, 44, 86], rows }, addressOf };
}

/**
 * The heading rows that open a block on a week sheet.
 *
 * @param {string} title
 * @param {string} caption
 * @param {string[]} headers
 * @returns {import("./xlsx.js").SheetCell[][]}
 */
function blockHeading(title, caption, headers) {
  return [
    [textCell(title, "section"), blank, blank, blank, textCell(caption, "note")],
    headers.map((header) => textCell(header, "bold")),
  ];
}

/**
 * One value cell for an input or a constant.
 *
 * @param {import("./formulas/kit.js").SpecCell} cell
 * @param {Record<string, unknown>} values
 * @param {Record<string, string>} rateAddress
 * @returns {import("./xlsx.js").SheetCell}
 */
function valueCell(cell, values, rateAddress) {
  if (cell.kind === "constant" && cell.rateKey !== "") {
    const address = rateAddress[cell.rateKey];
    return formulaCell(address, Number(values[cell.key]), "money");
  }
  const value = values[cell.key];
  if (typeof value === "string") {
    return textCell(value, "default");
  }
  return numberCell(Number(value), styleFor(cell.format));
}

/**
 * Write every row of one block.
 *
 * @param {import("./formulas/kit.js").SpecCell[]} cells
 * @param {Record<string, unknown>} values
 * @param {Record<string, string>} rateAddress
 * @param {Record<string, { plain: string, excel: string }>} rendered
 * @returns {import("./xlsx.js").SheetCell[][]}
 */
function blockRows(cells, values, rateAddress, rendered) {
  return cells.map((cell) => {
    if (cell.kind !== "output") {
      return [
        textCell(cell.label),
        valueCell(cell, values, rateAddress),
        textCell(cell.unit),
        textCell(cell.note, "note"),
      ];
    }
    const cached = values[cell.key];
    const equation = rendered[cell.key];
    return [
      textCell(cell.label),
      formulaCell(equation.excel, typeof cached === "string" ? cached : Number(cached), styleFor(cell.format)),
      textCell(cell.unit),
      textCell(equation.plain, "note"),
      textCell(cell.note, "note"),
    ];
  });
}

/**
 * Build one week sheet.
 *
 * @param {import("./formulas/kit.js").FormulaSpec} spec
 * @param {Record<string, unknown>} inputValues
 * @param {Record<string, string>} rateAddress
 * @returns {import("./xlsx.js").Sheet}
 */
function buildWeekSheet(spec, inputValues, rateAddress) {
  const { blocks } = layoutSpec(spec);
  const values = evaluateSpec(spec, /** @type {Record<string, number | string>} */ (inputValues));
  const tool = findTool(spec.slug);
  const rendered = {};
  for (const equation of renderEquations(spec)) {
    rendered[equation.key] = equation;
  }

  const rows = [
    [textCell(`Week ${spec.week}: ${spec.title}`, "title")],
    [textCell(tool === undefined ? "" : tool.decision, "note")],
  ];

  const headers = {
    "INPUTS YOU SUPPLY": ["Item", "Value", "Unit", "Where it comes from"],
    "RATES AND CONSTANTS": ["Item", "Value", "Unit", "Source and note"],
    COMPUTED: ["Figure", "Value", "Unit", "Equation in words", "Note"],
  };

  for (const block of blocks) {
    while (rows.length < block.firstRow - 3) {
      rows.push([]);
    }
    rows.push(...blockHeading(block.title, block.caption, headers[block.title]));
    rows.push(...blockRows(block.cells, values, rateAddress, rendered));
    rows.push([]);
  }

  return { name: spec.sheetName, widths: WEEK_WIDTHS, rows };
}

/**
 * The opening sheet: what the file is, and what it is not.
 *
 * @param {Date} now
 * @returns {import("./xlsx.js").Sheet}
 */
function buildGuideSheet(now) {
  const lines = [
    ["How to use this workbook", "title"],
    [`Generated ${now.toISOString().slice(0, 10)} from the MBA 8660 Decision Tools application.`, "note"],
    ["", "default"],
    ["One sheet per week", "bold"],
    ["Each week sheet has three blocks. Inputs you supply, the rates and constants the arithmetic leans on, and the computed figures. Every computed cell holds a formula, and column D says what that formula means in words.", "note"],
    ["", "default"],
    ["Change an input, not a result", "bold"],
    ["Type over any cell in the Inputs block and the sheet recalculates. If you overwrite a computed cell you have replaced the model with a number, which is the one thing the assignment asks you not to do.", "note"],
    ["", "default"],
    ["Prices live on the Rates sheet", "bold"],
    ["Published list prices are held once, on the Rates sheet, and every week that uses a price refers to it there. Change a price on that sheet and each week that depends on it follows. Each price carries the vendor, the unit, the date it was retrieved, and its source.", "note"],
    ["", "default"],
    ["This workbook computes. It does not recommend.", "bold"],
    ["The figures here are arithmetic over assumptions you supplied. They do not choose an architecture, an operating model, or a compliance path, and no amount of recalculating will make them do so. The judgments each week refuses to make are listed in the application, and you are expected to answer them in writing.", "note"],
    ["", "default"],
    ["Every figure is reproducible", "bold"],
    ["The application shows the same equations beside the week picker, with the cell each one occupies here. If a number in the application and a number in this workbook ever disagree, that is a defect. The test suite checks all twelve weeks against each other on every commit.", "note"],
  ];
  return {
    name: "How to use",
    widths: [128],
    rows: lines.map(([text, style]) => [textCell(text, style)]),
  };
}

/**
 * The inputs each week sheet opens with: the first preset of that week's tool,
 * which is one of the seeded case organizations. A student who opens the file
 * before running anything still sees a complete, working sheet.
 *
 * Week 10 measures every milestone from an assessment date, which the
 * application takes from the clock and the sheet takes from a cell, so that
 * cell is seeded here.
 *
 * @param {Date} now
 * @returns {Record<string, Record<string, unknown>>}
 */
export function defaultSeeds(now) {
  const seeds = {};
  for (const spec of SPECS) {
    const tool = findTool(spec.slug);
    const preset = tool === undefined ? undefined : tool.presets[0];
    seeds[spec.slug] = { assessmentDate: now.toISOString().slice(0, 10), ...(preset === undefined ? {} : preset.values) };
  }
  return seeds;
}

/**
 * Overlay one week's supplied values on the defaults, ignoring anything that
 * is not an input cell of that week.
 *
 * @param {Record<string, Record<string, unknown>>} seeds
 * @param {string} slug
 * @param {Record<string, unknown>} supplied
 * @returns {Record<string, Record<string, unknown>>}
 */
export function withSuppliedValues(seeds, slug, supplied) {
  const spec = SPECS.find((candidate) => candidate.slug === slug);
  if (spec === undefined) {
    return seeds;
  }
  const merged = { ...seeds[slug] };
  for (const cell of spec.inputs) {
    const value = supplied[cell.key];
    if (value !== undefined && value !== "") {
      merged[cell.key] = value;
    }
  }
  return { ...seeds, [slug]: merged };
}

/**
 * Build the whole workbook.
 *
 * @param {Record<string, Record<string, unknown>>} seeds Input values per slug.
 * @param {Date} now
 * @returns {Buffer}
 */
export function buildDecisionWorkbook(seeds, now) {
  const rates = buildRatesSheet();
  const weeks = SPECS.map((spec) => buildWeekSheet(spec, seeds[spec.slug] ?? {}, rates.addressOf));
  return buildWorkbook([buildGuideSheet(now), ...weeks, rates.sheet]);
}
