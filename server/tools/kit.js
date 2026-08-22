/**
 * Shared vocabulary for every decision tool.
 *
 * Design rule that governs this whole directory: a tool computes and frames.
 * It never recommends. Each tool returns `unresolved`, the list of judgments
 * the tool deliberately refuses to make, and the client blocks export until
 * the student has answered every one of them in writing.
 *
 * @typedef {{ label: string, value: string, note: string }} Line
 * @typedef {{ label: string, value: number, group: string, display: string }} Point
 * @typedef {{
 *   kind: "bar" | "stack" | "gauge" | "timeline" | "matrix",
 *   title: string,
 *   caption: string,
 *   unit: string,
 *   points: Point[],
 *   reference: { label: string, value: number } | null
 * }} Visual
 * @typedef {{
 *   computed: Line[],
 *   assumptions: Line[],
 *   unresolved: string[],
 *   warnings: string[],
 *   visuals: Visual[]
 * }} ToolResult
 * @typedef {{ ok: true, value: number } | { ok: false, error: string }} NumberParse
 */

/** Thrown when student input fails validation. Routes map this to HTTP 400. */
export class InputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}

/**
 * Parse a finite number. Guards the Number(null) === 0 trap explicitly,
 * because a silent zero corrupts every downstream calculation.
 *
 * @param {unknown} raw
 * @param {string} label
 * @returns {number}
 */
export function requireFinite(raw, label) {
  if (raw === null || raw === undefined || raw === "") {
    throw new InputError(`${label} is required.`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new InputError(`${label} must be a number.`);
  }
  return parsed;
}

/**
 * Parse a number that must be strictly positive.
 *
 * @param {unknown} raw
 * @param {string} label
 * @returns {number}
 */
export function requirePositive(raw, label) {
  const parsed = requireFinite(raw, label);
  if (parsed <= 0) {
    throw new InputError(`${label} must be greater than zero.`);
  }
  return parsed;
}

/**
 * Parse a number inside an inclusive range.
 *
 * @param {unknown} raw
 * @param {string} label
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function requireRange(raw, label, min, max) {
  const parsed = requireFinite(raw, label);
  if (parsed < min || parsed > max) {
    throw new InputError(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

/**
 * Parse a non-empty trimmed string.
 *
 * @param {unknown} raw
 * @param {string} label
 * @returns {string}
 */
export function requireText(raw, label) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new InputError(`${label} is required.`);
  }
  return raw.trim();
}

/**
 * Parse a choice from a fixed list.
 *
 * @param {unknown} raw
 * @param {string} label
 * @param {readonly string[]} allowed
 * @returns {string}
 */
export function requireChoice(raw, label, allowed) {
  const text = requireText(raw, label);
  if (!allowed.includes(text)) {
    throw new InputError(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return text;
}

/**
 * Parse an ISO date that is not in the future. Every price a student enters
 * carries a retrieval date, which the syllabus requires and this enforces.
 *
 * @param {unknown} raw
 * @param {string} label
 * @param {Date} now
 * @returns {string}
 */
export function requireRetrievalDate(raw, label, now) {
  const text = requireText(raw, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new InputError(`${label} must be formatted YYYY-MM-DD.`);
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new InputError(`${label} is not a real date.`);
  }
  if (parsed.getTime() > now.getTime()) {
    throw new InputError(`${label} cannot be in the future.`);
  }
  return text;
}

/**
 * Format a number as US dollars with no decimal places.
 *
 * @param {number} value
 * @returns {string}
 */
export function usd(value) {
  const rounded = Math.round(value);
  return `$${rounded.toLocaleString("en-US")}`;
}

/**
 * Format a number with a fixed number of decimals and an optional unit.
 *
 * @param {number} value
 * @param {number} decimals
 * @param {string} unit
 * @returns {string}
 */
export function num(value, decimals, unit) {
  const text = value.toFixed(decimals);
  return unit === "" ? text : `${text} ${unit}`;
}

/**
 * Build a Line.
 *
 * The third argument is the part that teaches. `note` says what the number
 * means, in words a student can reuse in a memo, and it travels into the
 * exported PDF alongside the figure. A number with no note is a number the
 * student has no way to defend.
 *
 * @param {string} label
 * @param {string} value
 * @param {string} note
 * @returns {Line}
 */
export function line(label, value, note = "") {
  return { label, value, note };
}

/* ------------------------------------------------------------------ *
 * Money and unit formatting
 * ------------------------------------------------------------------ */

/**
 * Format a dollar figure at a readable precision.
 *
 * Cost-per-query figures are fractions of a cent and cost-per-year figures are
 * millions. One formatter that rounds everything to whole dollars turns the
 * first into "$0" and hides the point, so precision scales with magnitude.
 *
 * @param {number} value
 * @returns {string}
 */
export function money(value) {
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && magnitude < 0.01) {
    return `$${value.toFixed(5)}`;
  }
  if (magnitude < 1000) {
    return `$${value.toFixed(2)}`;
  }
  return usd(value);
}

/**
 * Convert gibibytes (binary, 1,024^3 bytes) to gigabytes (decimal, 1,000^3).
 *
 * Memory is sized in GiB and storage is billed in GB. Multiplying a GiB figure
 * by a per-GB price understates the bill by about 7 percent, so every cost
 * calculation in this application converts first.
 *
 * @param {number} gib
 * @returns {number}
 */
export function gibToGb(gib) {
  return (gib * 1024 ** 3) / 1000 ** 3;
}

/**
 * Convert gibibytes to terabytes (decimal), the unit scan pricing uses.
 *
 * @param {number} gib
 * @returns {number}
 */
export function gibToTb(gib) {
  return gibToGb(gib) / 1000;
}

/* ------------------------------------------------------------------ *
 * Chart specifications
 *
 * A tool describes what should be drawn; it knows nothing about SVG, pixels,
 * or colour. Keeping the spec declarative preserves the purity invariant and
 * lets the client render the same data as a chart or as a table.
 * ------------------------------------------------------------------ */

/**
 * Build one plotted point.
 *
 * `display` is the label drawn on the mark, pre-formatted by the tool, so the
 * renderer never has to guess whether a value is dollars, hours, or GiB.
 *
 * @param {string} label
 * @param {number} value
 * @param {string} display
 * @param {string} group
 * @returns {Point}
 */
export function point(label, value, display, group = "") {
  return { label, value: Number.isFinite(value) ? value : 0, display, group };
}

/**
 * A bar chart comparing magnitudes across categories.
 *
 * @param {string} title
 * @param {string} unit
 * @param {string} caption
 * @param {Point[]} points
 * @returns {Visual}
 */
export function barChart(title, unit, caption, points) {
  return { kind: "bar", title, caption, unit, points, reference: null };
}

/**
 * A stacked bar showing how one total divides into parts.
 *
 * @param {string} title
 * @param {string} unit
 * @param {string} caption
 * @param {Point[]} points
 * @returns {Visual}
 */
export function stackChart(title, unit, caption, points) {
  return { kind: "stack", title, caption, unit, points, reference: null };
}

/**
 * A gauge showing one measured value against a ceiling it must respect.
 *
 * @param {string} title
 * @param {string} unit
 * @param {string} caption
 * @param {Point} measured
 * @param {{ label: string, value: number }} ceiling
 * @returns {Visual}
 */
export function gaugeChart(title, unit, caption, measured, ceiling) {
  return { kind: "gauge", title, caption, unit, points: [measured], reference: ceiling };
}

/**
 * A timeline of dated milestones, positioned by days from the assessment date.
 *
 * @param {string} title
 * @param {string} caption
 * @param {Point[]} points
 * @returns {Visual}
 */
export function timelineChart(title, caption, points) {
  return { kind: "timeline", title, caption, unit: "days from today", points, reference: null };
}

/**
 * A grant matrix: one row per scope, value 1 for granted and 0 for denied.
 *
 * @param {string} title
 * @param {string} caption
 * @param {Point[]} points
 * @returns {Visual}
 */
export function matrixChart(title, caption, points) {
  return { kind: "matrix", title, caption, unit: "", points, reference: null };
}
