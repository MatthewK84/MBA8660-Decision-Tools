/**
 * Writes the companion workbook to disk.
 *
 * The application generates this file on demand, so this script exists for the
 * copy that ships with the repository: run it after changing a tool, a rate,
 * or a formula specification, and commit the result alongside the change.
 *
 * Usage: npm run workbook [-- path/to/file.xlsx]
 */

import { writeFileSync } from "node:fs";
import { buildDecisionWorkbook, defaultSeeds } from "../server/workbook.js";

/** Where the workbook lands when no path is given. */
const DEFAULT_PATH = "docs/mba8660-decision-tools.xlsx";

const target = process.argv[2] ?? DEFAULT_PATH;
const now = new Date();
const bytes = buildDecisionWorkbook(defaultSeeds(now), now);

writeFileSync(target, bytes);
process.stdout.write(`Wrote ${bytes.length.toLocaleString("en-US")} bytes to ${target}\n`);
