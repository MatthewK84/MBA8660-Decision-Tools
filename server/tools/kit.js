/**
 * Shared vocabulary for every decision tool.
 *
 * Design rule that governs this whole directory: a tool computes and frames.
 * It never recommends. Each tool returns `unresolved`, the list of judgments
 * the tool deliberately refuses to make, and the client blocks export until
 * the student has answered every one of them in writing.
 *
 * @typedef {{ label: string, value: string }} Line
 * @typedef {{
 *   computed: Line[],
 *   assumptions: Line[],
 *   unresolved: string[],
 *   warnings: string[]
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
 * @param {string} label
 * @param {string} value
 * @returns {Line}
 */
export function line(label, value) {
  return { label, value };
}
