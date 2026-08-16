/**
 * Displays computed arithmetic, echoed assumptions, and any warnings.
 * Deliberately contains no recommendation surface of any kind.
 */

/**
 * Render a labelled list of lines.
 *
 * @param {{ title: string, lines: { label: string, value: string }[] }} props
 * @returns {JSX.Element | null}
 */
function LineTable({ title, lines }) {
  if (lines.length === 0) {
    return null;
  }
  return (
    <div className="lines">
      <h3>{title}</h3>
      <dl>
        {lines.map((entry) => (
          <div className="line" key={`${entry.label}:${entry.value}`}>
            <dt>{entry.label}</dt>
            <dd>{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Render the result panel.
 *
 * @param {{ result: { computed: { label: string, value: string }[], assumptions: { label: string, value: string }[], warnings: string[] } }} props
 * @returns {JSX.Element}
 */
export default function ResultPanel({ result }) {
  return (
    <section className="panel">
      <h2>Computed</h2>
      <LineTable title="Results" lines={result.computed} />
      <LineTable title="Assumptions you supplied" lines={result.assumptions} />
      {result.warnings.length === 0 ? null : (
        <div className="warnings">
          <h3>Warnings</h3>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="note">
        This is arithmetic. It is not a recommendation, and it will not become one no matter how long
        you look at it.
      </p>
    </section>
  );
}
