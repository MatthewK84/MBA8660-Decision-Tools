/**
 * Thin API client. Every call resolves to a discriminated result so callers
 * never need try/catch around fetch and no promise is left floating.
 *
 * @typedef {{ ok: true, data: unknown } | { ok: false, error: string }} ApiResult
 */

/**
 * Read an error message out of a failed response.
 *
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readError(response) {
  try {
    const payload = await response.json();
    if (payload !== null && typeof payload === "object" && "error" in payload) {
      return String(payload.error);
    }
    return `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

/**
 * Fetch the tool catalog.
 *
 * @returns {Promise<ApiResult>}
 */
export async function fetchCatalog() {
  try {
    const response = await fetch("/api/tools");
    if (!response.ok) {
      return { ok: false, error: await readError(response) };
    }
    return { ok: true, data: await response.json() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error." };
  }
}

/**
 * Run a tool.
 *
 * @param {string} slug
 * @param {Record<string, unknown>} input
 * @returns {Promise<ApiResult>}
 */
export async function runTool(slug, input) {
  try {
    const response = await fetch(`/api/tools/${slug}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      return { ok: false, error: await readError(response) };
    }
    return { ok: true, data: await response.json() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error." };
  }
}

/**
 * Export the assumption log as a PDF and trigger a download.
 *
 * @param {string} slug
 * @param {string} label
 * @param {Record<string, unknown>} payload
 * @returns {Promise<ApiResult>}
 */
export async function exportPdf(slug, label, payload) {
  try {
    const response = await fetch(`/api/tools/${slug}/export.pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, error: await readError(response) };
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-assumption-log.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error." };
  }
}

/**
 * Download the companion workbook, with this week's sheet seeded from the
 * values on screen.
 *
 * @param {string} slug
 * @param {Record<string, unknown>} values
 * @returns {Promise<ApiResult>}
 */
export async function downloadWorkbook(slug, values) {
  try {
    const response = await fetch(`/api/tools/${slug}/workbook.xlsx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      return { ok: false, error: await readError(response) };
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mba8660-decision-tools.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error." };
  }
}
