/**
 * A small writer for the subset of the Office Open XML spreadsheet format this
 * application needs: several sheets of text, numbers, dates, and formulas.
 *
 * Why it is hand-written rather than taken from a library: the file we produce
 * has no images, no pivot tables, no charts, and one style table, and the whole
 * of it is visible here in a few hundred lines. The application's dependency
 * list is short on purpose, and a student can read this file and see exactly
 * what lands on their disk.
 *
 * Every formula cell carries both the formula and the value the formula
 * evaluates to, and the workbook asks Excel to recalculate on open, so the
 * numbers are right whether or not the reader's spreadsheet recalculates.
 *
 * @typedef {{ kind: "blank" }} BlankCell
 * @typedef {{ kind: "text", value: string, style: string }} TextCell
 * @typedef {{ kind: "number", value: number, style: string }} NumberCell
 * @typedef {{ kind: "formula", formula: string, cached: number | string, style: string }} FormulaCell
 * @typedef {BlankCell | TextCell | NumberCell | FormulaCell} SheetCell
 * @typedef {{ name: string, widths: number[], rows: SheetCell[][] }} Sheet
 */

import { deflateRawSync } from "node:zlib";

/** Style names, in the order their formatting records are written. */
const STYLE_ORDER = ["default", "title", "section", "note", "number", "usd", "money", "date", "bold"];

/** Thrown when a workbook cannot be assembled. */
export class WorkbookError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "WorkbookError";
  }
}

/**
 * Index of a style name in the cell format table.
 *
 * @param {string} style
 * @returns {number}
 */
function styleIndex(style) {
  const index = STYLE_ORDER.indexOf(style);
  if (index < 0) {
    throw new WorkbookError(`No cell style named "${style}".`);
  }
  return index;
}

/**
 * Escape the five characters XML reserves.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Spreadsheet column name for a zero-based index: 0 is A, 26 is AA.
 *
 * @param {number} index
 * @returns {string}
 */
export function columnName(index) {
  let remaining = index;
  let name = "";
  while (remaining >= 0) {
    name = String.fromCharCode(65 + (remaining % 26)) + name;
    remaining = Math.floor(remaining / 26) - 1;
  }
  return name;
}

/** A cell holding nothing. */
export const blank = Object.freeze({ kind: "blank" });

/**
 * A cell holding text.
 *
 * @param {string} value
 * @param {string} style
 * @returns {TextCell}
 */
export function textCell(value, style = "default") {
  return { kind: "text", value, style };
}

/**
 * A cell holding a number, or a date as its serial number.
 *
 * @param {number} value
 * @param {string} style
 * @returns {NumberCell}
 */
export function numberCell(value, style = "number") {
  return { kind: "number", value, style };
}

/**
 * A cell holding a formula and the value it evaluates to.
 *
 * @param {string} formula
 * @param {number | string} cached
 * @param {string} style
 * @returns {FormulaCell}
 */
export function formulaCell(formula, cached, style = "number") {
  return { kind: "formula", formula, cached, style };
}

/**
 * Render a number the way a spreadsheet writes one.
 *
 * Very small figures, such as a fraction of a cent per query, reach here in
 * exponential form. The format allows it, but spreadsheets write the exponent
 * in upper case, so this does too.
 *
 * @param {number} value
 * @returns {string}
 */
function numberXml(value) {
  const safe = Number.isFinite(value) ? value : 0;
  return String(safe).replace("e", "E");
}

/**
 * Render one cell.
 *
 * @param {SheetCell} cell
 * @param {string} reference
 * @returns {string}
 */
function cellXml(cell, reference) {
  if (cell.kind === "blank") {
    return "";
  }
  const style = ` s="${styleIndex(cell.style)}"`;
  if (cell.kind === "text") {
    return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
  }
  if (cell.kind === "number") {
    return `<c r="${reference}"${style}><v>${numberXml(cell.value)}</v></c>`;
  }
  const body = escapeXml(cell.formula.replace(/^=/, ""));
  if (typeof cell.cached === "string") {
    return `<c r="${reference}"${style} t="str"><f>${body}</f><v>${escapeXml(cell.cached)}</v></c>`;
  }
  return `<c r="${reference}"${style}><f>${body}</f><v>${numberXml(cell.cached)}</v></c>`;
}

/**
 * Render one worksheet.
 *
 * @param {Sheet} sheet
 * @returns {string}
 */
function sheetXml(sheet) {
  const columns = sheet.widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const rows = sheet.rows
    .map((cells, rowIndex) => {
      const body = cells.map((cell, columnIndex) => cellXml(cell, `${columnName(columnIndex)}${rowIndex + 1}`)).join("");
      return body === "" ? "" : `<row r="${rowIndex + 1}">${body}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${rows}</sheetData></worksheet>`;
}

/**
 * The style table. Four number formats, three fonts, one fill.
 *
 * @returns {string}
 */
function stylesXml() {
  const fonts = [
    '<font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/></font>',
    '<font><sz val="10"/><color rgb="FF6B6B7B"/><name val="Calibri"/></font>',
    '<font><b/><sz val="14"/><name val="Calibri"/></font>',
  ].join("");
  const formats = [
    { numFmt: 0, font: 0 },
    { numFmt: 0, font: 3 },
    { numFmt: 0, font: 1, fill: 2 },
    { numFmt: 0, font: 2 },
    { numFmt: 164, font: 0 },
    { numFmt: 165, font: 0 },
    { numFmt: 166, font: 0 },
    { numFmt: 167, font: 0 },
    { numFmt: 0, font: 1 },
  ]
    .map((entry) => {
      const fill = entry.fill === undefined ? 0 : entry.fill;
      return `<xf numFmtId="${entry.numFmt}" fontId="${entry.font}" fillId="${fill}" borderId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="$#,##0"/><numFmt numFmtId="166" formatCode="[&lt;1]$0.00000;$#,##0.00"/><numFmt numFmtId="167" formatCode="yyyy\\-mm\\-dd"/></numFmts><fonts count="4">${fonts}</fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEAF5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${STYLE_ORDER.length}">${formats}</cellXfs></styleSheet>`;
}

/**
 * The workbook part, naming every sheet and asking for a full recalculation
 * when the file opens.
 *
 * @param {Sheet[]} sheets
 * @returns {string}
 */
function workbookXml(sheets) {
  const entries = sheets
    .map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${entries}</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`;
}

/**
 * Every part of the package, as name and body.
 *
 * @param {Sheet[]} sheets
 * @returns {{ name: string, body: string }[]}
 */
function packageParts(sheets) {
  const overrides = sheets
    .map((_sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("");
  const relationships = sheets
    .map((_sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
    .join("");
  const styleRelId = sheets.length + 1;

  return [
    {
      name: "[Content_Types].xml",
      body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    { name: "xl/workbook.xml", body: workbookXml(sheets) },
    {
      name: "xl/_rels/workbook.xml.rels",
      body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${styleRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", body: stylesXml() },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, body: sheetXml(sheet) })),
  ];
}

/** CRC-32 lookup table, built once. */
const CRC_TABLE = buildCrcTable();

/**
 * Build the CRC-32 table the zip format requires.
 *
 * @returns {Int32Array}
 */
function buildCrcTable() {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    table[index] = value;
  }
  return table;
}

/**
 * CRC-32 of a buffer.
 *
 * @param {Buffer} data
 * @returns {number}
 */
function crc32(data) {
  let crc = -1;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Assemble a zip archive with every entry deflated.
 *
 * Timestamps are fixed rather than taken from the clock, so building the same
 * workbook twice produces the same bytes and a change in the file means a
 * change in the content.
 *
 * @param {{ name: string, body: string }[]} parts
 * @returns {Buffer}
 */
function zip(parts) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const part of parts) {
    const raw = Buffer.from(part.body, "utf8");
    const compressed = deflateRawSync(raw);
    const name = Buffer.from(part.name, "utf8");
    const checksum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x2821, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x2821, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuffer, end]);
}

/**
 * Build a workbook.
 *
 * @param {Sheet[]} sheets
 * @returns {Buffer}
 */
export function buildWorkbook(sheets) {
  if (sheets.length === 0) {
    throw new WorkbookError("A workbook needs at least one sheet.");
  }
  return zip(packageParts(sheets));
}
