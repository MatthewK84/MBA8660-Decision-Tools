/**
 * The equations behind this week's figures.
 *
 * Each entry gives the figure three ways: the equation in words, the same
 * equation in Excel syntax, and the cell it occupies in the companion
 * workbook. A student can read the arithmetic here, reproduce it in a
 * spreadsheet, and get the same number. A figure nobody can reproduce is a
 * figure nobody can defend in a Live Defense.
 */

/**
 * One equation, collapsed by default so the panel stays scannable.
 *
 * @param {{ equation: Record<string, unknown>, sheetName: string }} props
 * @returns {JSX.Element}
 */
function EquationEntry({ equation, sheetName }) {
  const note = String(equation.note ?? "");
  return (
    <details className="equation">
      <summary>
        <strong>{String(equation.label)}</strong>
        <span className="equation-plain">{String(equation.plain)}</span>
      </summary>
      <dl className="equation-body">
        <dt>In Excel</dt>
        <dd>
          <code>{String(equation.excel)}</code>
        </dd>
        <dt>Cell</dt>
        <dd>{`${sheetName}, cell ${String(equation.cell)}`}</dd>
        {note === "" ? null : (
          <>
            <dt>What it means</dt>
            <dd>{note}</dd>
          </>
        )}
      </dl>
    </details>
  );
}

/**
 * The figures this week prints that carry no equation, and why.
 *
 * @param {{ entries: Record<string, unknown>[] }} props
 * @returns {JSX.Element | null}
 */
function UnmodelledList({ entries }) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <details className="equation">
      <summary>
        <strong>Figures with no equation</strong>
        <span className="equation-plain">{`${entries.length} of this week's lines are words, not arithmetic`}</span>
      </summary>
      <dl className="equation-body">
        {entries.map((entry) => (
          <div key={String(entry.label)}>
            <dt>{String(entry.label)}</dt>
            <dd>{String(entry.why)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/**
 * Render this week's equations and the workbook download.
 *
 * @param {{
 *   equations: Record<string, unknown>[],
 *   unmodelled: Record<string, unknown>[],
 *   sheetName: string,
 *   onDownload: () => void,
 *   busy: boolean
 * }} props
 * @returns {JSX.Element | null}
 */
export default function FormulaPanel({ equations, unmodelled, sheetName, onDownload, busy }) {
  if (!Array.isArray(equations) || equations.length === 0) {
    return null;
  }
  return (
    <section className="panel equations">
      <h2>Equations for this week</h2>
      <p className="note">
        {`Every figure this week computes is listed below, in words and in Excel syntax, with the cell it occupies on the ${sheetName} sheet of the workbook. The workbook holds these formulas, not pasted numbers, so changing an input recalculates the sheet exactly as the application does.`}
      </p>
      <button type="button" onClick={onDownload} disabled={busy}>
        {busy ? "Preparing the workbook" : "Download the Excel workbook"}
      </button>
      <h3>{`${equations.length} equations`}</h3>
      {equations.map((equation) => (
        <EquationEntry key={String(equation.key)} equation={equation} sheetName={sheetName} />
      ))}
      <UnmodelledList entries={Array.isArray(unmodelled) ? unmodelled : []} />
    </section>
  );
}
