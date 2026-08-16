/**
 * Reference data routes. Every endpoint here is read-only from the student's
 * point of view and serves instructor-authored content only.
 */

import { Router } from "express";
import { listPrices, listScenarios, listSources, summariseUsage } from "../repository/reference.js";

/**
 * Wrap a handler so a missing database returns a clear 503 rather than a
 * stack trace, and so no promise is left floating.
 *
 * @param {import("pg").Pool | null} pool
 * @param {(pool: import("pg").Pool, req: import("express").Request) => Promise<unknown>} handler
 * @returns {import("express").RequestHandler}
 */
function guarded(pool, handler) {
  return (req, res) => {
    if (pool === null) {
      res.status(503).json({ error: "Reference data is unavailable. This deployment runs without a database." });
      return;
    }
    handler(pool, req)
      .then((payload) => {
        res.json(payload);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Reference query failed.";
        res.status(500).json({ error: message });
      });
  };
}

/**
 * Build the reference router.
 *
 * @param {import("pg").Pool | null} pool
 * @returns {import("express").Router}
 */
export function buildReferenceRouter(pool) {
  const router = Router();

  router.get("/scenarios", guarded(pool, async (db) => ({ scenarios: await listScenarios(db) })));

  router.get("/prices", guarded(pool, async (db) => ({ prices: await listPrices(db) })));

  router.get("/sources/:week", guarded(pool, async (db, req) => {
    const week = Number.parseInt(req.params.week, 10);
    if (!Number.isFinite(week) || week < 1 || week > 15) {
      throw new Error("Week must be an integer between 1 and 15.");
    }
    return { week, sources: await listSources(db, week) };
  }));

  router.get("/usage", guarded(pool, async (db) => ({ usage: await summariseUsage(db) })));

  return router;
}
