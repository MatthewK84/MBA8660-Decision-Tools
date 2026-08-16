/**
 * Application entry point.
 *
 * Boot order matters and is deliberate:
 *   1. read configuration
 *   2. connect to Postgres with backoff, if configured
 *   3. run additive migrations
 *   4. run the privacy guard against the live schema
 *   5. only then start listening
 *
 * Step 4 exists so a schema that could hold student work stops the process
 * instead of quietly serving traffic.
 */

import express from "express";
import { join } from "node:path";
import { readEnv } from "./config.js";
import { connectWithRetry, createPool } from "./db.js";
import { runMigrations } from "./migrate.js";
import { assertNoStudentColumns } from "./privacy-guard.js";
import { buildReferenceRouter } from "./routes/reference.js";
import { buildToolsRouter } from "./routes/tools.js";

/**
 * Construct the Express application.
 *
 * @param {import("./config.js").Config} config
 * @param {import("pg").Pool | null} pool
 * @returns {import("express").Express}
 */
export function buildApp(config, pool) {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, database: pool === null ? "absent" : "connected", storesStudentWork: false });
  });
  app.use("/api", buildToolsRouter(config, pool));
  app.use("/api", buildReferenceRouter(pool));
  app.use(express.static(config.distDir));
  app.get("*", (_req, res) => {
    res.sendFile(join(config.distDir, "index.html"));
  });
  return app;
}

/**
 * Prepare the database, or return null when none is configured.
 *
 * @param {import("./config.js").Config} config
 * @returns {Promise<import("pg").Pool | null>}
 */
export async function prepareDatabase(config) {
  const pool = createPool(config);
  if (pool === null) {
    console.log("No DATABASE_URL. Running stateless. Reference endpoints will report 503.");
    return null;
  }
  await connectWithRetry(pool, (message) => {
    console.log(message);
  });
  const applied = await runMigrations(pool);
  console.log(`Applied ${String(applied)} idempotent migration statements.`);
  await assertNoStudentColumns(pool);
  console.log("Privacy guard passed. No column in this schema can hold student work.");
  return pool;
}

/**
 * Start the server.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const config = readEnv(process.env);
  const pool = await prepareDatabase(config);
  const app = buildApp(config, pool);
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`${config.courseCode} decision tools listening on ${String(config.port)}`);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Startup failed: ${message}`);
  process.exit(1);
});
