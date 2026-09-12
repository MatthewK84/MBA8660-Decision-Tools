/**
 * The equivalence suite.
 *
 * Every week is computed twice: once by the tool, in JavaScript, and once by
 * evaluating the Excel formulas the workbook ships. This file checks that the
 * two agree, figure by figure, on every week. That check is the entire claim
 * the workbook makes, so it runs on every commit rather than on trust.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SPECS, findSpec } from "../server/formulas/index.js";
import { evaluateFormula } from "../server/formulas/evaluate.js";
import { evaluateSpec, excelSerial, isoFromSerial, layoutSpec, renderEquations } from "../server/formulas/render.js";
import { TOOLS, findTool } from "../server/tools/catalog.js";

const NOW = new Date("2026-09-01T00:00:00Z");

/** Inputs used for every week, drawn from the first preset of each tool. */
const CASES = TOOLS.map((tool) => ({
  slug: tool.slug,
  week: tool.week,
  values: { assessmentDate: NOW.toISOString().slice(0, 10), ...tool.presets[0].values },
  run: (values) => tool.run(values, NOW),
}));

/**
 * Pull the number out of a formatted figure such as "$1,234", "12.3 GiB", or
 * "1,095 partitions". Returns null when the figure is words rather than a
 * number, which several lines deliberately are.
 *
 * @param {string} text
 * @returns {{ value: number, decimals: number } | null}
 */
function parseDisplayed(text) {
  const match = /-?\d[\d,]*(\.\d+)?/.exec(text);
  if (match === null) {
    return null;
  }
  const digits = match[1] === undefined ? 0 : match[1].length - 1;
  return { value: Number(match[0].replace(/,/g, "")), decimals: digits };
}

/**
 * How far the evaluated figure may sit from the displayed one: half of the
 * last displayed digit, plus a margin for floating point noise.
 *
 * @param {{ value: number, decimals: number }} displayed
 * @returns {number}
 */
function tolerance(displayed) {
  return 0.5 * 10 ** -displayed.decimals + Math.abs(displayed.value) * 1e-9;
}

/**
 * The lines a spec output claims to reproduce.
 *
 * An exact label wins outright. Only when no label matches exactly does the
 * match fall back to a prefix, which is what the several lines whose labels
 * carry a figure ("Exposure avoided at 60 percent catch rate") need.
 *
 * @param {{ label: string, value: string }[]} lines
 * @param {string} match
 * @returns {{ label: string, value: string }[]}
 */
function linesFor(lines, match) {
  const exact = lines.filter((line) => line.label === match);
  return exact.length > 0 ? exact : lines.filter((line) => line.label.startsWith(match));
}

/**
 * The single line a spec output reproduces.
 *
 * @param {{ label: string, value: string }[]} lines
 * @param {string} match
 * @returns {{ label: string, value: string } | undefined}
 */
function findLine(lines, match) {
  return linesFor(lines, match)[0];
}

describe("formula specifications cover every tool", () => {
  it("registers one specification per week, in week order", () => {
    assert.equal(SPECS.length, TOOLS.length);
    assert.deepEqual(
      SPECS.map((spec) => spec.week),
      TOOLS.map((tool) => tool.week)
    );
    for (const spec of SPECS) {
      assert.equal(spec.slug, findTool(spec.slug)?.slug);
    }
  });

  it("declares an input cell for every field a tool requires", () => {
    for (const tool of TOOLS) {
      const spec = findSpec(tool.slug);
      const declared = new Set(spec.inputs.map((cell) => cell.key));
      for (const field of tool.fields) {
        assert.ok(declared.has(field.key), `Week ${tool.week} has no input cell for ${field.key}.`);
      }
    }
  });

  it("gives every cell a distinct address", () => {
    for (const spec of SPECS) {
      const { addressOf } = layoutSpec(spec);
      const addresses = Object.values(addressOf);
      assert.equal(new Set(addresses).size, addresses.length, `Week ${spec.week} reuses a cell.`);
    }
  });

  it("accounts for every line a tool prints", () => {
    for (const testCase of CASES) {
      const spec = findSpec(testCase.slug);
      const result = testCase.run(testCase.values);
      const matches = spec.outputs.map((cell) => cell.match).filter((match) => match !== "");
      const excused = spec.unmodelled.map((entry) => entry.label);
      for (const line of result.computed) {
        const covered = matches.some((match) => line.label.startsWith(match));
        const listed = excused.some((label) => line.label.startsWith(label));
        assert.ok(covered || listed, `Week ${spec.week} line "${line.label}" has neither an equation nor a reason.`);
      }
    }
  });

  it("matches each equation to exactly one printed line", () => {
    for (const testCase of CASES) {
      const spec = findSpec(testCase.slug);
      const result = testCase.run(testCase.values);
      for (const cell of spec.outputs) {
        if (cell.match === "") {
          continue;
        }
        const hits = linesFor(result.computed, cell.match);
        assert.equal(hits.length, 1, `Week ${spec.week}: "${cell.match}" matches ${hits.length} lines.`);
      }
    }
  });
});

describe("the workbook computes what the application computes", () => {
  for (const testCase of CASES) {
    it(`agrees on every figure in week ${testCase.week}`, () => {
      const spec = findSpec(testCase.slug);
      const evaluated = evaluateSpec(spec, testCase.values);
      const result = testCase.run(testCase.values);

      for (const cell of spec.outputs) {
        if (cell.match === "") {
          continue;
        }
        const line = findLine(result.computed, cell.match);
        assert.ok(line !== undefined, `Week ${spec.week} prints no line for ${cell.key}.`);
        const displayed = parseDisplayed(line.value);
        if (displayed === null) {
          continue;
        }
        const computed = evaluated[cell.key];
        assert.equal(typeof computed, "number", `Week ${spec.week}: ${cell.key} evaluated to text.`);
        const gap = Math.abs(Number(computed) - displayed.value);
        assert.ok(
          gap <= tolerance(displayed),
          `Week ${spec.week}: ${cell.key} evaluated to ${computed}, the application printed ${line.value}.`
        );
      }
    });
  }
});

describe("equation rendering", () => {
  it("renders every output in Excel syntax and in words", () => {
    for (const spec of SPECS) {
      const equations = renderEquations(spec);
      assert.equal(equations.length, spec.outputs.length);
      for (const equation of equations) {
        assert.ok(equation.excel.startsWith("="), `${equation.key} is not an Excel formula.`);
        assert.match(equation.cell, /^B\d+$/);
        assert.ok(equation.plain.length > 0);
        assert.ok(!/\$B\$\d+/.test(equation.plain), `${equation.key} leaks a cell address into its plain form.`);
      }
    }
  });

  it("refers only to cells the sheet actually holds", () => {
    for (const spec of SPECS) {
      const { addressOf } = layoutSpec(spec);
      const known = new Set(Object.values(addressOf));
      for (const equation of renderEquations(spec)) {
        for (const reference of equation.excel.match(/\$[A-Z]+\$\d+/g) ?? []) {
          assert.ok(known.has(reference), `Week ${spec.week}: ${equation.key} refers to empty cell ${reference}.`);
        }
      }
    }
  });
});

describe("the formula evaluator", () => {
  const lookup = (reference) => ({ "$B$1": 10, "$B$2": 4, "$B$3": "Granted" })[reference];

  it("respects precedence and parentheses", () => {
    assert.equal(evaluateFormula("=$B$1+$B$2*2", lookup), 18);
    assert.equal(evaluateFormula("=($B$1+$B$2)*2", lookup), 28);
    assert.equal(evaluateFormula("=2^3^2", lookup), 512);
    assert.equal(evaluateFormula("=-$B$2+$B$1", lookup), 6);
  });

  it("applies the functions the specifications use", () => {
    assert.equal(evaluateFormula("=MAX(2,CEILING($B$1/$B$2,1))", lookup), 3);
    assert.equal(evaluateFormula("=ABS($B$2-$B$1)", lookup), 6);
    assert.equal(evaluateFormula("=ROUND($B$1/3,2)", lookup), 3.33);
    assert.equal(evaluateFormula('=IF($B$3="Granted",1,0)', lookup), 1);
    assert.equal(evaluateFormula('=IF($B$3="Denied","none",$B$1)', lookup), 10);
  });

  it("rounds half away from zero, as Excel does", () => {
    assert.equal(evaluateFormula("=ROUND(-2.5,0)", lookup), -3);
    assert.equal(evaluateFormula("=ROUND(2.5,0)", lookup), 3);
  });

  it("rejects a formula it cannot parse", () => {
    assert.throws(() => evaluateFormula("=$B$1 $B$2", lookup), /single value/);
    assert.throws(() => evaluateFormula("=SUMPRODUCT($B$1,$B$2)", lookup), /supported subset/);
    assert.throws(() => evaluateFormula("=($B$1", lookup), /parentheses/);
  });
});

describe("date handling", () => {
  it("round-trips an ISO date through the Excel serial", () => {
    assert.equal(isoFromSerial(excelSerial("2027-12-02")), "2027-12-02");
    assert.equal(excelSerial("1900-01-01"), 2);
  });

  it("counts the same days to Annex III as the tool does", () => {
    const spec = findSpec("ai-act");
    const tool = findTool("ai-act");
    const values = { assessmentDate: NOW.toISOString().slice(0, 10), ...tool.presets[0].values };
    const evaluated = evaluateSpec(spec, values);
    const line = findLine(tool.run(tool.presets[0].values, NOW).computed, "Days until Annex III");
    assert.equal(Number(evaluated.daysToAnnex), parseDisplayed(line.value).value);
  });
});
