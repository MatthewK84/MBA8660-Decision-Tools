/**
 * Tool routes. Stateless by design: the request carries every input, the
 * response carries every result, and nothing is written to disk or database.
 */

import { Router } from "express";
import { buildAssumptionLog } from "../assumption-log.js";
import { recordUsage } from "../repository/reference.js";
import { renderAssumptionLogPdf } from "../pdf.js";
import { InputError } from "../tools/kit.js";
import { buildDecisionWorkbook, defaultSeeds, withSuppliedValues } from "../workbook.js";
import { catalogSummary, findTool } from "../tools/catalog.js";
import { resolveTerms } from "../glossary.js";

/**
 * Extract a plain object body, rejecting anything else.
 *
 * @param {unknown} body
 * @returns {Record<string, unknown>}
 */
function readBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new InputError("Request body must be a JSON object.");
  }
  return /** @type {Record<string, unknown>} */ (body);
}

/**
 * Map a thrown value to an HTTP status and message.
 *
 * @param {unknown} error
 * @returns {{ status: number, message: string }}
 */
function toHttpError(error) {
  if (error instanceof InputError) {
    return { status: 400, message: error.message };
  }
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  return { status: 500, message };
}

/**
 * Turn a picker label into a file name fragment: "Module 1" to "module-1",
 * "Week 7" to "week-7". Keeps the exported PDF recognisable in a downloads
 * folder six weeks later, which is the only thing this has to achieve.
 *
 * @param {string} label
 * @returns {string}
 */
function fileSlug(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Compute, validate the student's written answers, and stream a PDF.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("../config.js").Config} config
 * @param {import("pg").Pool | null} pool
 * @returns {Promise<void>}
 */
async function exportPdf(req, res, config, pool) {
  try {
    const tool = findTool(req.params.slug);
    if (tool === undefined) {
      res.status(404).json({ error: "No such tool." });
      return;
    }
    const body = readBody(req.body);
    const now = new Date();
    const result = tool.run(body, now);
    const meta = {
      courseCode: config.courseCode,
      label: tool.label,
      toolTitle: tool.title,
      decision: tool.decision,
      terms: resolveTerms(tool.terms),
    };
    const log = buildAssumptionLog(meta, result, body.answers, now);
    const pdf = await renderAssumptionLogPdf(log);
    countUsage(pool, tool.slug, "export");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileSlug(tool.label)}-assumption-log.pdf"`);
    res.send(pdf);
  } catch (error) {
    const { status, message } = toHttpError(error);
    res.status(status).json({ error: message });
  }
}

/** Media type of an Office Open XML workbook. */
const WORKBOOK_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** File name every workbook download arrives under. */
const WORKBOOK_NAME = "mba8660-decision-tools.xlsx";

/**
 * Stream the companion workbook.
 *
 * Every sheet opens on a seeded case organization, so the file is complete
 * before a student types anything. When the request names a tool and carries
 * that week's inputs, that week opens on the student's own figures instead,
 * and the formulas are the same either way.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("pg").Pool | null} pool
 * @param {string} slug
 * @returns {void}
 */
function sendWorkbook(req, res, pool, slug) {
  try {
    const now = new Date();
    const seeds = defaultSeeds(now);
    const merged = slug === "" ? seeds : withSuppliedValues(seeds, slug, readBody(req.body));
    const bytes = buildDecisionWorkbook(merged, now);
    if (slug !== "") {
      countUsage(pool, slug, "export");
    }
    res.setHeader("Content-Type", WORKBOOK_TYPE);
    res.setHeader("Content-Disposition", `attachment; filename="${WORKBOOK_NAME}"`);
    res.send(bytes);
  } catch (error) {
    const { status, message } = toHttpError(error);
    res.status(status).json({ error: message });
  }
}

/**
 * Increment a usage counter, ignoring failures.
 *
 * Telemetry must never break a student mid-memo, and it must never see the
 * request body. Only the tool slug and the date cross this boundary.
 *
 * @param {import("pg").Pool | null} pool
 * @param {string} toolSlug
 * @param {"run" | "export"} kind
 * @returns {void}
 */
function countUsage(pool, toolSlug, kind) {
  if (pool === null) {
    return;
  }
  recordUsage(pool, toolSlug, kind, new Date()).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Usage counter failed for ${toolSlug}: ${message}`);
  });
}

/**
 * Build the tools router.
 *
 * @param {import("../config.js").Config} config
 * @param {import("pg").Pool | null} pool
 * @returns {import("express").Router}
 */
export function buildToolsRouter(config, pool) {
  const router = Router();

  router.get("/tools", (_req, res) => {
    res.json({ courseCode: config.courseCode, tools: catalogSummary() });
  });

  router.post("/tools/:slug/run", (req, res) => {
    try {
      const tool = findTool(req.params.slug);
      if (tool === undefined) {
        res.status(404).json({ error: "No such tool." });
        return;
      }
      const body = readBody(req.body);
      const result = tool.run(body, new Date());
      countUsage(pool, tool.slug, "run");
      res.json({ slug: tool.slug, week: tool.week, label: tool.label, title: tool.title, result });
    } catch (error) {
      const { status, message } = toHttpError(error);
      res.status(status).json({ error: message });
    }
  });

  router.post("/tools/:slug/export.pdf", (req, res) => {
    void exportPdf(req, res, config, pool);
  });

  router.get("/workbook.xlsx", (req, res) => {
    sendWorkbook(req, res, pool, "");
  });

  router.post("/tools/:slug/workbook.xlsx", (req, res) => {
    const tool = findTool(req.params.slug);
    if (tool === undefined) {
      res.status(404).json({ error: "No such tool." });
      return;
    }
    sendWorkbook(req, res, pool, tool.slug);
  });

  return router;
}
