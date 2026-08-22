/**
 * The glossary for one week.
 *
 * Every term a student needs to read this week's output, defined four ways:
 * plainly, precisely, in what it costs, and in how it is commonly got wrong.
 * The fourth is the one that shows up in a Live Defense.
 */

/**
 * One term, collapsed by default so the panel stays scannable.
 *
 * @param {{ term: Record<string, unknown> }} props
 * @returns {JSX.Element}
 */
function TermEntry({ term }) {
  return (
    <details className="term">
      <summary>
        <strong>{String(term.term)}</strong>
        <span className="term-plain">{String(term.plain)}</span>
      </summary>
      <dl className="term-body">
        <dt>Precisely</dt>
        <dd>{String(term.precise)}</dd>
        <dt>What it costs</dt>
        <dd>{String(term.cost)}</dd>
        <dt>How it is got wrong</dt>
        <dd>{String(term.trap)}</dd>
      </dl>
    </details>
  );
}

/**
 * Render this week's glossary.
 *
 * @param {{ terms: Record<string, unknown>[], explainer: string }} props
 * @returns {JSX.Element | null}
 */
export default function GlossaryPanel({ terms, explainer }) {
  if (!Array.isArray(terms) || terms.length === 0) {
    return null;
  }
  return (
    <section className="panel glossary">
      <h2>What this week is about</h2>
      <p className="explainer">{explainer}</p>
      <h3>Every term used here, defined</h3>
      <p className="note">
        Open any term for the precise definition, what it costs, and the mistake people make with it.
        You are expected to use these words correctly in the memo.
      </p>
      {terms.map((term) => (
        <TermEntry key={String(term.term)} term={term} />
      ))}
    </section>
  );
}
