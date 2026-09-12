/**
 * Checks the workbook the application hands a student.
 *
 * The file is a zip of XML parts, so the suite opens it the way a spreadsheet
 * would: read the central directory, inflate each entry, and check the markup
 * balances. It then checks the content that matters, which is that computed
 * cells hold formulas rather than pasted numbers, that published prices are
 * held once and referred to, and that the cached value beside each formula is
 * the value the tool computes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inflateRawSync } from "node:zlib";

import { SPECS } from "../server/formulas/index.js";
import { buildDecisionWorkbook, defaultSeeds, withSuppliedValues } from "../server/workbook.js";
import { columnName, escapeXml } from "../server/xlsx.js";

const NOW = new Date("2026-09-01T00:00:00Z");

/**
 * Read a zip archive into its entries, the way a reader opens the file: from
 * the central directory at the end, not by scanning forwards.
 *
 * @param {Buffer} archive
 * @returns {Record<string, string>}
 */
function readZip(archive) {
  const endIndex = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(endIndex > 0, "No end-of-central-directory record.");
  const count = archive.readUInt16LE(endIndex + 10);
  let cursor = archive.readUInt32LE(endIndex + 16);
  const entries = {};

  for (let index = 0; index < count; index += 1) {
    assert.equal(archive.readUInt32LE(cursor), 0x02014b50, "Bad central directory signature.");
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    assert.equal(archive.readUInt32LE(localOffset), 0x04034b50, `Bad local header for ${name}.`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    entries[name] = inflateRawSync(archive.subarray(start, start + compressedSize)).toString("utf8");

    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Check that every tag in a document opens and closes in order.
 *
 * @param {string} xml
 * @returns {void}
 */
function assertBalanced(xml) {
  const stack = [];
  for (const match of xml.matchAll(/<(\/?)([A-Za-z:][\w:.-]*)([^>]*)>/g)) {
    const [, closing, name, rest] = match;
    if (name === "?xml" || rest.endsWith("/")) {
      continue;
    }
    if (closing === "/") {
      assert.equal(stack.pop(), name, `Closing tag ${name} does not match.`);
    } else {
      stack.push(name);
    }
  }
  assert.equal(stack.length, 0, `Unclosed tags: ${stack.join(", ")}`);
}

const WORKBOOK = buildDecisionWorkbook(defaultSeeds(NOW), NOW);
const PARTS = readZip(WORKBOOK);

describe("the workbook package", () => {
  it("carries every part a spreadsheet needs to open it", () => {
    for (const name of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml"]) {
      assert.ok(PARTS[name] !== undefined, `Missing ${name}.`);
    }
    assert.ok(PARTS["xl/worksheets/sheet1.xml"] !== undefined);
  });

  it("holds one sheet per week, plus the guide and the rate card", () => {
    const names = [...PARTS["xl/workbook.xml"].matchAll(/<sheet name="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(names, ["How to use", ...SPECS.map((spec) => spec.sheetName), "Rates"]);
  });

  it("produces well-formed markup in every part", () => {
    for (const [name, body] of Object.entries(PARTS)) {
      assert.ok(body.startsWith("<?xml"), `${name} has no XML declaration.`);
      assertBalanced(body);
    }
  });

  it("asks the reader to recalculate on open", () => {
    assert.match(PARTS["xl/workbook.xml"], /fullCalcOnLoad="1"/);
  });

  it("builds the same bytes twice, so a change in the file means a change in the content", () => {
    const again = buildDecisionWorkbook(defaultSeeds(NOW), NOW);
    assert.ok(WORKBOOK.equals(again));
  });
});

describe("what the week sheets contain", () => {
  /**
   * The worksheet part for one week.
   *
   * @param {number} week
   * @returns {string}
   */
  const sheetFor = (week) => PARTS[`xl/worksheets/sheet${week + 1}.xml`];

  it("puts a formula, not a number, in every computed cell", () => {
    for (const spec of SPECS) {
      const xml = sheetFor(spec.week);
      const formulas = [...xml.matchAll(/<f>/g)].length;
      const rateLinks = spec.constants.filter((cell) => cell.rateKey !== "").length;
      assert.equal(formulas, spec.outputs.length + rateLinks, `Week ${spec.week} has the wrong number of formulas.`);
    }
  });

  it("refers to the rate card rather than copying a price", () => {
    const withRates = SPECS.filter((spec) => spec.constants.some((cell) => cell.rateKey !== ""));
    assert.ok(withRates.length > 0);
    for (const spec of withRates) {
      assert.match(sheetFor(spec.week), /<f>Rates!\$C\$\d+<\/f>/);
    }
  });

  it("caches the value each formula evaluates to", () => {
    const xml = sheetFor(1);
    const cell = /<c r="B35"[^>]*><f>([^<]+)<\/f><v>([^<]+)<\/v><\/c>/.exec(xml);
    assert.ok(cell !== null, "Week 1 has no raw size cell.");
    assert.equal(cell[1], "$B$6*$B$7/$B$17");
    assert.ok(Math.abs(Number(cell[2]) - (4200000000 * 310) / 1024 ** 3) < 1e-6);
  });

  it("seeds a week with the values a student supplied", () => {
    const seeds = withSuppliedValues(defaultSeeds(NOW), "sizing", { rows: 12345, bytesPerRow: 100 });
    const parts = readZip(buildDecisionWorkbook(seeds, NOW));
    assert.match(parts["xl/worksheets/sheet2.xml"], /<c r="B6"[^>]*><v>12345<\/v><\/c>/);
  });

  it("ignores a supplied value that is not an input of that week", () => {
    const seeds = withSuppliedValues(defaultSeeds(NOW), "sizing", { answers: ["nonsense"], rows: 7 });
    assert.equal(seeds.sizing.answers, undefined);
    assert.equal(seeds.sizing.rows, 7);
  });
});

describe("cell helpers", () => {
  it("names columns the way a spreadsheet does", () => {
    assert.equal(columnName(0), "A");
    assert.equal(columnName(25), "Z");
    assert.equal(columnName(26), "AA");
    assert.equal(columnName(27), "AB");
  });

  it("escapes the characters XML reserves", () => {
    assert.equal(escapeXml('a & b < c > "d"'), "a &amp; b &lt; c &gt; &quot;d&quot;");
  });
});
