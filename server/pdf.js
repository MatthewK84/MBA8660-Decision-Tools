/**
 * Renders an assumption log as a vector PDF using pdfmake.
 * Pure with respect to application state. Takes a log, returns bytes.
 */

import PdfPrinter from "pdfmake";

const FONTS = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

/**
 * Render a label and value list as a two-column table body.
 *
 * @param {import("./tools/kit.js").Line[]} lines
 * @returns {unknown[][]}
 */
function linesToRows(lines) {
  return lines.map((entry) => [
    { text: entry.label, bold: true, fontSize: 9 },
    { text: entry.value, fontSize: 9 },
  ]);
}

/**
 * Build the pdfmake document definition.
 *
 * @param {import("./assumption-log.js").AssumptionLog} log
 * @returns {Record<string, unknown>}
 */
function buildDocDefinition(log) {
  const answers = log.unresolved.flatMap((item, index) => [
    { text: `${index + 1}. ${item.question}`, bold: true, fontSize: 9, margin: [0, 8, 0, 2] },
    { text: item.answer, fontSize: 9, margin: [0, 0, 0, 4] },
  ]);

  const warnings =
    log.warnings.length === 0
      ? [{ text: "None raised.", fontSize: 9, italics: true }]
      : log.warnings.map((w) => ({ text: `- ${w}`, fontSize: 9, margin: [0, 0, 0, 3] }));

  return {
    pageSize: "LETTER",
    pageMargins: [48, 48, 48, 48],
    defaultStyle: { font: "Helvetica" },
    content: [
      { text: `${log.courseCode} Week ${log.week}: ${log.toolTitle}`, fontSize: 15, bold: true },
      { text: "Assumption Log", fontSize: 11, margin: [0, 2, 0, 8] },
      { text: `Decision owed: ${log.decision}`, fontSize: 9, italics: true, margin: [0, 0, 0, 10] },
      { text: "Computed", fontSize: 12, bold: true, margin: [0, 6, 0, 4] },
      { table: { widths: [180, "*"], body: linesToRows(log.computed) }, layout: "lightHorizontalLines" },
      { text: "Assumptions I supplied", fontSize: 12, bold: true, margin: [0, 12, 0, 4] },
      { table: { widths: [180, "*"], body: linesToRows(log.assumptions) }, layout: "lightHorizontalLines" },
      { text: "Judgments the tool refused to make", fontSize: 12, bold: true, margin: [0, 12, 0, 0] },
      ...answers,
      { text: "Warnings", fontSize: 12, bold: true, margin: [0, 12, 0, 4] },
      ...warnings,
      {
        text: `Generated ${log.generatedAt}. This tool computed arithmetic only. Every recommendation in the attached memo is the student's own.`,
        fontSize: 7,
        italics: true,
        margin: [0, 18, 0, 0],
      },
    ],
  };
}

/**
 * Render the PDF to a Buffer.
 *
 * @param {import("./assumption-log.js").AssumptionLog} log
 * @returns {Promise<Buffer>}
 */
export async function renderAssumptionLogPdf(log) {
  const printer = new PdfPrinter(FONTS);
  const doc = printer.createPdfKitDocument(buildDocDefinition(log));
  /** @type {Buffer[]} */
  const chunks = [];
  return new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (error) => reject(error instanceof Error ? error : new Error(String(error))));
    doc.end();
  });
}
