/**
 * The panel that carries the pedagogical weight. Each question is a judgment
 * the tool refuses to make. Export stays locked until all are answered.
 */

const MIN_ANSWER_LENGTH = 40;

/**
 * Render the unresolved questions and the export control.
 *
 * @param {{
 *   questions: string[],
 *   answers: string[],
 *   onAnswer: (index: number, value: string) => void,
 *   onExport: () => void,
 *   busy: boolean
 * }} props
 * @returns {JSX.Element}
 */
export default function UnresolvedPanel({ questions, answers, onAnswer, onExport, busy }) {
  const unanswered = questions.filter((_question, index) => (answers[index] ?? "").trim().length < MIN_ANSWER_LENGTH);
  const ready = unanswered.length === 0;

  return (
    <section className="panel unresolved">
      <h2>Judgments this tool refuses to make</h2>
      <p className="note">
        The tool did the multiplication. These are yours. Answer each one in writing before you
        export, because this is the part you will defend live.
      </p>
      {questions.map((question, index) => (
        <label className="field" key={question} htmlFor={`answer-${String(index)}`}>
          <span className="field-label">{`${String(index + 1)}. ${question}`}</span>
          <textarea
            id={`answer-${String(index)}`}
            rows={3}
            value={answers[index] ?? ""}
            onChange={(event) => onAnswer(index, event.target.value)}
          />
          <small className="field-help">
            {(answers[index] ?? "").trim().length} of {MIN_ANSWER_LENGTH} characters minimum
          </small>
        </label>
      ))}
      <button type="button" className="primary" onClick={onExport} disabled={!ready || busy}>
        {ready ? "Export assumption log as PDF" : `Answer ${String(unanswered.length)} more to unlock export`}
      </button>
    </section>
  );
}
