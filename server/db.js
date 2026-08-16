/**
 * PostgreSQL connection. The database is optional: without DATABASE_URL the
 * application runs in stateless mode and the reference endpoints report that
 * they are unavailable. Tool computation never depends on the database.
 */

import pg from "pg";

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 250;

/**
 * Sleep for a number of milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Create a pool. Returns null when no database is configured.
 *
 * @param {import("./config.js").Config} config
 * @returns {import("pg").Pool | null}
 */
export function createPool(config) {
  if (config.databaseUrl === "") {
    return null;
  }
  return new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.poolSize,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
  });
}

/**
 * Verify connectivity with bounded exponential backoff. Railway starts the
 * application before Postgres finishes accepting connections, so a crash loop
 * on first boot is the normal failure without this.
 *
 * @param {import("pg").Pool} pool
 * @param {(message: string) => void} log
 * @returns {Promise<void>}
 */
export async function connectWithRetry(pool, log) {
  let lastError = new Error("Database never became reachable.");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      log(`Database reachable on attempt ${String(attempt)}.`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const wait = BASE_DELAY_MS * 2 ** (attempt - 1);
      log(`Database attempt ${String(attempt)} failed: ${lastError.message}. Retrying in ${String(wait)} ms.`);
      await delay(wait);
    }
  }
  throw lastError;
}
