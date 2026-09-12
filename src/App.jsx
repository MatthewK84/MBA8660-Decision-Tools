/**
 * Root component. Renders the tool picker and wires the session hook to the
 * panels. All state is in memory. Nothing persists, client or server.
 */

import AssumptionForm from "./components/AssumptionForm.jsx";
import FormulaPanel from "./components/FormulaPanel.jsx";
import GlossaryPanel from "./components/GlossaryPanel.jsx";
import ResultPanel from "./components/ResultPanel.jsx";
import UnresolvedPanel from "./components/UnresolvedPanel.jsx";
import VisualPanel from "./components/VisualPanel.jsx";
import { useToolSession } from "./useToolSession.js";

/**
 * The masthead and week picker.
 *
 * @param {{ session: Record<string, unknown> }} props
 * @returns {JSX.Element}
 */
function Masthead({ session }) {
  const tools = Array.isArray(session.tools) ? session.tools : [];
  const active = session.active;
  return (
    <header>
      <h1>MBA 8660 Decision Tools</h1>
      <p>
        These tools compute. They do not recommend. Every price is a published list rate with the
        date it was retrieved. Nothing you type here is stored on the server, so export your
        assumption log and attach it to your Canvas submission.
      </p>
      <label className="field" htmlFor="tool-picker">
        <span className="field-label">Week</span>
        <select
          id="tool-picker"
          value={String(session.slug)}
          onChange={(event) => session.selectTool(event.target.value)}
        >
          {tools.map((tool) => (
            <option key={String(tool.slug)} value={String(tool.slug)}>
              {`Week ${String(tool.week)}: ${String(tool.title)}`}
            </option>
          ))}
        </select>
      </label>
      {active === undefined ? null : <p className="decision">{String(active.decision)}</p>}
    </header>
  );
}

export default function App() {
  const session = useToolSession();
  const { result } = session;

  return (
    <main>
      <Masthead session={session} />

      {session.error === "" ? null : <p className="error">{session.error}</p>}

      <GlossaryPanel terms={session.terms} explainer={session.explainer} />

      <FormulaPanel
        equations={session.equations}
        unmodelled={session.unmodelled}
        sheetName={session.sheetName}
        onDownload={() => void session.downloadSheet()}
        busy={session.busy}
      />

      <AssumptionForm
        fields={session.fields}
        presets={session.presets}
        values={session.values}
        onChange={session.changeValue}
        onApplyPreset={session.applyPreset}
        onRun={() => void session.compute()}
        busy={session.busy}
      />

      {result === null ? null : (
        <>
          <ResultPanel result={result} />
          <VisualPanel visuals={result.visuals} />
          <UnresolvedPanel
            questions={result.unresolved}
            answers={session.answers}
            onAnswer={session.changeAnswer}
            onExport={() => void session.download()}
            busy={session.busy}
          />
        </>
      )}
    </main>
  );
}
