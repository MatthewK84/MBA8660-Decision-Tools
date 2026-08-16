/**
 * Tool session state, split into small hooks so no function exceeds the size
 * limit. Nothing here persists past a page refresh, by design.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { exportPdf, fetchCatalog, runTool } from "./api.js";

/**
 * Extract the tool list from an unknown catalog payload.
 *
 * @param {unknown} data
 * @returns {Record<string, unknown>[]}
 */
function readTools(data) {
  if (data === null || typeof data !== "object" || !("tools" in data)) {
    return [];
  }
  const { tools } = /** @type {{ tools: unknown }} */ (data);
  return Array.isArray(tools) ? tools : [];
}

/**
 * Extract the result object from an unknown run payload.
 *
 * @param {unknown} data
 * @returns {{ computed: { label: string, value: string }[], assumptions: { label: string, value: string }[], unresolved: string[], warnings: string[] } | null}
 */
function readResult(data) {
  if (data === null || typeof data !== "object" || !("result" in data)) {
    return null;
  }
  const { result } = /** @type {{ result: unknown }} */ (data);
  if (result === null || typeof result !== "object") {
    return null;
  }
  return /** @type {{ computed: { label: string, value: string }[], assumptions: { label: string, value: string }[], unresolved: string[], warnings: string[] }} */ (
    result
  );
}

/**
 * Load the catalog once and track the selected slug.
 *
 * @param {(message: string) => void} onError
 * @returns {{ tools: Record<string, unknown>[], slug: string, setSlug: (next: string) => void }}
 */
function useCatalog(onError) {
  const [tools, setTools] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [slug, setSlug] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const outcome = await fetchCatalog();
      if (cancelled) {
        return;
      }
      if (!outcome.ok) {
        onError(outcome.error);
        return;
      }
      const list = readTools(outcome.data);
      setTools(list);
      const first = list[0];
      if (first !== undefined) {
        setSlug(String(first.slug));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [onError]);

  return { tools, slug, setSlug };
}

/**
 * Input values and the student's written answers.
 *
 * @returns {Record<string, unknown>}
 */
function useDraft() {
  const [values, setValues] = useState(/** @type {Record<string, string>} */ ({}));
  const [answers, setAnswers] = useState(/** @type {string[]} */ ([]));

  const changeValue = useCallback((key, value) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  }, []);

  const changeAnswer = useCallback((index, value) => {
    setAnswers((previous) => {
      const next = [...previous];
      next[index] = value;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setValues({});
    setAnswers([]);
  }, []);

  return { values, answers, setAnswers, changeValue, changeAnswer, reset };
}

/**
 * The compute and export actions.
 *
 * @param {{ slug: string, week: number, values: Record<string, string>, answers: string[], setAnswers: (next: string[]) => void }} args
 * @returns {Record<string, unknown>}
 */
function useActions(args) {
  const [result, setResult] = useState(/** @type {ReturnType<typeof readResult>} */ (null));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { slug, week, values, answers, setAnswers } = args;

  const compute = useCallback(async () => {
    setBusy(true);
    setError("");
    const outcome = await runTool(slug, values);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
      setResult(null);
      return;
    }
    const parsed = readResult(outcome.data);
    setResult(parsed);
    setAnswers(parsed === null ? [] : parsed.unresolved.map(() => ""));
  }, [slug, values, setAnswers]);

  const download = useCallback(async () => {
    setBusy(true);
    setError("");
    const outcome = await exportPdf(slug, week, { ...values, answers });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
    }
  }, [slug, week, values, answers]);

  return { result, setResult, error, setError, busy, compute, download };
}

/**
 * Compose the full session.
 *
 * @returns {Record<string, unknown>}
 */
export function useToolSession() {
  const draft = useDraft();
  const [bootError, setBootError] = useState("");
  const { tools, slug, setSlug } = useCatalog(setBootError);

  const active = useMemo(() => tools.find((tool) => String(tool.slug) === slug), [tools, slug]);
  const fields = useMemo(
    () => (active !== undefined && Array.isArray(active.fields) ? active.fields : []),
    [active]
  );
  const week = active === undefined ? 0 : Number(active.week);

  const actions = useActions({ slug, week, values: draft.values, answers: draft.answers, setAnswers: draft.setAnswers });
  const { setResult, setError } = actions;

  const selectTool = useCallback(
    (next) => {
      setSlug(next);
      draft.reset();
      setResult(null);
      setError("");
      setBootError("");
    },
    [setSlug, draft, setResult, setError]
  );

  const changeValue = useCallback(
    (key, value) => {
      draft.changeValue(key, value);
      setResult(null);
    },
    [draft, setResult]
  );

  return {
    tools,
    slug,
    active,
    fields,
    values: draft.values,
    answers: draft.answers,
    result: actions.result,
    error: bootError === "" ? actions.error : bootError,
    busy: actions.busy,
    selectTool,
    changeValue,
    changeAnswer: draft.changeAnswer,
    compute: actions.compute,
    download: actions.download,
  };
}
