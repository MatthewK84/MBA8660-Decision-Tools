/**
 * Central configuration. Every environment variable the server reads is
 * declared here so deployment requirements stay visible in one file.
 *
 * @typedef {{
 *   port: number,
 *   distDir: string,
 *   courseCode: string,
 *   databaseUrl: string,
 *   databaseSsl: boolean,
 *   poolSize: number
 * }} Config
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_POOL_SIZE = 5;

/**
 * Parse a positive integer from the environment, falling back to a default.
 *
 * @param {string | undefined} raw
 * @param {number} fallback
 * @param {string} label
 * @returns {number}
 */
function positiveInt(raw, fallback, label) {
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer, received "${raw}".`);
  }
  return parsed;
}

/**
 * Read and validate the environment.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {Config}
 */
export function readEnv(env) {
  const databaseUrl = env.DATABASE_URL ?? "";
  return {
    port: positiveInt(env.PORT, 3000, "PORT"),
    distDir: join(ROOT, "dist"),
    courseCode: env.COURSE_CODE ?? "MBA 8660",
    databaseUrl,
    databaseSsl: (env.DATABASE_SSL ?? "").toLowerCase() === "true" || databaseUrl.includes("proxy.rlwy.net"),
    poolSize: positiveInt(env.DB_POOL_SIZE, DEFAULT_POOL_SIZE, "DB_POOL_SIZE"),
  };
}
