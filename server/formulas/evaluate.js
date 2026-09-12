/**
 * An evaluator for the subset of Excel this application writes.
 *
 * Why it exists: the workbook ships with a cached value in every formula cell
 * so the file reads correctly before Excel recalculates, and the test suite
 * uses the same evaluator to prove that what the workbook computes equals what
 * the application computes. A formula nobody has evaluated is a claim, not a
 * calculation.
 *
 * The supported subset is deliberately small, and the specifications are
 * written to stay inside it: arithmetic, comparison, parentheses, string
 * literals, cell references, and the functions listed in FUNCTIONS below.
 * Parsing is a shunting-yard pass followed by a stack evaluation, both
 * iterative, because a recursive parser has a stack depth nobody has measured.
 *
 * @typedef {number | string | boolean} CellValue
 * @typedef {{ type: string, text: string, args?: number }} Token
 */

/** Thrown when a formula cannot be parsed or evaluated. */
export class FormulaError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "FormulaError";
  }
}

/** Arity of every function the subset allows. */
const FUNCTIONS = Object.freeze({
  ABS: 1,
  CEILING: 2,
  IF: 3,
  MAX: 2,
  MIN: 2,
  ROUND: 2,
});

/** Binding power of each operator. Higher binds tighter. */
const PRECEDENCE = Object.freeze({
  "=": 1, "<>": 1, "<": 1, "<=": 1, ">": 1, ">=": 1,
  "+": 2, "-": 2,
  "*": 3, "/": 3,
  "^": 4,
  "u-": 5,
});

const OPERATOR_CHARS = "+-*/^=<>";

/**
 * Read a quoted string literal starting at `start`.
 *
 * @param {string} text
 * @param {number} start
 * @returns {{ value: string, next: number }}
 */
function readString(text, start) {
  let index = start + 1;
  let value = "";
  while (index < text.length) {
    if (text[index] === '"' && text[index + 1] === '"') {
      value += '"';
      index += 2;
      continue;
    }
    if (text[index] === '"') {
      return { value, next: index + 1 };
    }
    value += text[index];
    index += 1;
  }
  throw new FormulaError(`Unterminated string in formula: ${text}`);
}

/**
 * Read a number literal starting at `start`.
 *
 * @param {string} text
 * @param {number} start
 * @returns {{ value: number, next: number }}
 */
function readNumber(text, start) {
  let index = start;
  while (index < text.length && /[0-9.]/.test(text[index])) {
    index += 1;
  }
  const slice = text.slice(start, index);
  const parsed = Number(slice);
  if (!Number.isFinite(parsed)) {
    throw new FormulaError(`Not a number: ${slice}`);
  }
  return { value: parsed, next: index };
}

/**
 * Read a name: a function call, a cell reference, or a sheet-qualified
 * reference such as Rates!$C$7.
 *
 * @param {string} text
 * @param {number} start
 * @returns {{ name: string, next: number }}
 */
function readName(text, start) {
  let index = start;
  while (index < text.length && /[A-Za-z0-9_$!.]/.test(text[index])) {
    index += 1;
  }
  return { name: text.slice(start, index), next: index };
}

/**
 * Split a formula into tokens.
 *
 * @param {string} formula
 * @returns {Token[]}
 */
export function tokenize(formula) {
  const tokens = [];
  let index = 0;
  while (index < formula.length) {
    const char = formula[index];
    if (char === " ") {
      index += 1;
    } else if (char === '"') {
      const read = readString(formula, index);
      tokens.push({ type: "string", text: read.value });
      index = read.next;
    } else if (/[0-9]/.test(char)) {
      const read = readNumber(formula, index);
      tokens.push({ type: "number", text: String(read.value) });
      index = read.next;
    } else if (char === "(" || char === ")" || char === ",") {
      tokens.push({ type: char, text: char });
      index += 1;
    } else if (OPERATOR_CHARS.includes(char)) {
      const pair = formula.slice(index, index + 2);
      const two = pair === "<=" || pair === ">=" || pair === "<>";
      tokens.push({ type: "operator", text: two ? pair : char });
      index += two ? 2 : 1;
    } else if (/[A-Za-z$]/.test(char)) {
      const read = readName(formula, index);
      const isCall = formula[read.next] === "(";
      tokens.push({ type: isCall ? "function" : "reference", text: read.name });
      index = read.next;
    } else {
      throw new FormulaError(`Unexpected character "${char}" in formula: ${formula}`);
    }
  }
  return tokens;
}

/**
 * Decide whether a minus sign is unary at this point in the token stream.
 *
 * @param {Token | undefined} previous
 * @returns {boolean}
 */
function isUnaryPosition(previous) {
  if (previous === undefined) {
    return true;
  }
  return previous.type === "operator" || previous.type === "(" || previous.type === ",";
}

/**
 * Move operators off the stack while they bind at least as tightly as the one
 * arriving. Exponentiation is right associative, so it stops one step earlier.
 *
 * @param {Token[]} operators
 * @param {Token[]} out
 * @param {string} arriving
 * @returns {void}
 */
function drainOperators(operators, out, arriving) {
  const power = PRECEDENCE[arriving];
  while (operators.length > 0) {
    const top = operators[operators.length - 1];
    if (top.type !== "operator") {
      return;
    }
    const topPower = PRECEDENCE[top.text];
    const holds = arriving === "^" ? topPower > power : topPower >= power;
    if (!holds) {
      return;
    }
    out.push(/** @type {Token} */ (operators.pop()));
  }
}

/**
 * Close a parenthesis, emptying operators back to the matching open paren and
 * emitting the function call if one opened it.
 *
 * @param {Token[]} operators
 * @param {Token[]} out
 * @param {number[]} argCounts
 * @returns {void}
 */
function closeParen(operators, out, argCounts) {
  while (operators.length > 0 && operators[operators.length - 1].type !== "(") {
    out.push(/** @type {Token} */ (operators.pop()));
  }
  if (operators.length === 0) {
    throw new FormulaError("Unbalanced parentheses.");
  }
  operators.pop();
  const top = operators[operators.length - 1];
  if (top !== undefined && top.type === "function") {
    operators.pop();
    out.push({ type: "call", text: top.text, args: argCounts.pop() ?? 1 });
  }
}

/**
 * Convert tokens to reverse Polish order.
 *
 * @param {Token[]} tokens
 * @returns {Token[]}
 */
export function toRpn(tokens) {
  const out = [];
  const operators = [];
  const argCounts = [];
  let previous;

  for (const token of tokens) {
    if (token.type === "number" || token.type === "string" || token.type === "reference") {
      out.push(token);
    } else if (token.type === "function") {
      operators.push(token);
      argCounts.push(1);
    } else if (token.type === "(") {
      operators.push(token);
    } else if (token.type === ",") {
      while (operators.length > 0 && operators[operators.length - 1].type !== "(") {
        out.push(/** @type {Token} */ (operators.pop()));
      }
      argCounts.push((argCounts.pop() ?? 1) + 1);
    } else if (token.type === ")") {
      closeParen(operators, out, argCounts);
    } else {
      const unary = token.text === "-" && isUnaryPosition(previous);
      const name = unary ? "u-" : token.text;
      drainOperators(operators, out, name);
      operators.push({ type: "operator", text: name });
    }
    previous = token;
  }

  while (operators.length > 0) {
    const top = /** @type {Token} */ (operators.pop());
    if (top.type === "(") {
      throw new FormulaError("Unbalanced parentheses.");
    }
    out.push(top);
  }
  return out;
}

/**
 * Coerce a value to a number, rejecting text where arithmetic was intended.
 *
 * @param {CellValue} value
 * @returns {number}
 */
function asNumber(value) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number") {
    return value;
  }
  throw new FormulaError(`Expected a number but found the text "${value}".`);
}

/**
 * Apply a binary operator.
 *
 * @param {string} operator
 * @param {CellValue} left
 * @param {CellValue} right
 * @returns {CellValue}
 */
function applyBinary(operator, left, right) {
  if (operator === "=") {
    return equalValues(left, right);
  }
  if (operator === "<>") {
    return !equalValues(left, right);
  }
  const a = asNumber(left);
  const b = asNumber(right);
  if (operator === "+") return a + b;
  if (operator === "-") return a - b;
  if (operator === "*") return a * b;
  if (operator === "/") return a / b;
  if (operator === "^") return a ** b;
  if (operator === "<") return a < b;
  if (operator === "<=") return a <= b;
  if (operator === ">") return a > b;
  if (operator === ">=") return a >= b;
  throw new FormulaError(`Unknown operator "${operator}".`);
}

/**
 * Compare two values the way Excel does: text comparison ignores case.
 *
 * @param {CellValue} left
 * @param {CellValue} right
 * @returns {boolean}
 */
function equalValues(left, right) {
  if (typeof left === "string" || typeof right === "string") {
    return String(left).toLowerCase() === String(right).toLowerCase();
  }
  return asNumber(left) === asNumber(right);
}

/**
 * Round half away from zero, which is what Excel's ROUND does and what
 * JavaScript's Math.round does not.
 *
 * @param {number} value
 * @param {number} digits
 * @returns {number}
 */
function excelRound(value, digits) {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  return rounded / factor;
}

/**
 * Apply a function to its already-evaluated arguments.
 *
 * @param {string} name
 * @param {CellValue[]} args
 * @returns {CellValue}
 */
function applyFunction(name, args) {
  const expected = FUNCTIONS[name];
  if (expected === undefined) {
    throw new FormulaError(`Function ${name} is outside the supported subset.`);
  }
  if (args.length !== expected) {
    throw new FormulaError(`${name} takes ${expected} arguments, received ${args.length}.`);
  }
  if (name === "IF") {
    const condition = args[0];
    const truthy = typeof condition === "boolean" ? condition : asNumber(condition) !== 0;
    return truthy ? args[1] : args[2];
  }
  if (name === "ABS") return Math.abs(asNumber(args[0]));
  if (name === "MAX") return Math.max(asNumber(args[0]), asNumber(args[1]));
  if (name === "MIN") return Math.min(asNumber(args[0]), asNumber(args[1]));
  if (name === "ROUND") return excelRound(asNumber(args[0]), asNumber(args[1]));
  return Math.ceil(asNumber(args[0]) / asNumber(args[1])) * asNumber(args[1]);
}

/**
 * Evaluate one formula.
 *
 * @param {string} formula Excel expression, with or without a leading "=".
 * @param {(reference: string) => CellValue} lookup Resolves a cell reference.
 * @returns {CellValue}
 */
export function evaluateFormula(formula, lookup) {
  const body = formula.startsWith("=") ? formula.slice(1) : formula;
  const rpn = toRpn(tokenize(body));
  const stack = [];

  for (const token of rpn) {
    if (token.type === "number") {
      stack.push(Number(token.text));
    } else if (token.type === "string") {
      stack.push(token.text);
    } else if (token.type === "reference") {
      stack.push(lookup(token.text));
    } else if (token.type === "call") {
      const count = token.args ?? 1;
      const args = stack.splice(stack.length - count, count);
      stack.push(applyFunction(token.text, args));
    } else if (token.text === "u-") {
      stack.push(-asNumber(/** @type {CellValue} */ (stack.pop())));
    } else {
      const right = /** @type {CellValue} */ (stack.pop());
      const left = /** @type {CellValue} */ (stack.pop());
      stack.push(applyBinary(token.text, left, right));
    }
  }

  if (stack.length !== 1) {
    throw new FormulaError(`Formula did not reduce to a single value: ${formula}`);
  }
  return /** @type {CellValue} */ (stack[0]);
}
