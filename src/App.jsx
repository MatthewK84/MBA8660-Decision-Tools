/**
 * Root component. Renders the tool picker and wires the session hook to the
 * three panels. All state is in memory. Nothing persists, client or server.
 */

import AssumptionForm from "./components/AssumptionForm.jsx";
import ResultPanel from "./components/ResultPanel.jsx";
import UnresolvedPanel from "./components/UnresolvedPanel.jsx";
import { useToolSession } from "./useToolSession.js";

export default function App() {
  const session = useToolSession();
  const { active, result } = session;

  return (
    <main>
      <header>
        <h1>MBA 8660 Decision Tools</h1>
        <p>
          These tools compute. They do not recommend. Nothing you type here is stored on the server,
          so export your assumption log and attach it to your Canvas submission.
        </p>
        <label className="field" htmlFor="tool-picker">
          <span className="field-label">Week</span>
          <select
            id="tool-picker"
            value={session.slug}
            onChange={(event) => session.selectTool(event.target.value)}
          >
            {session.tools.map((tool) => (
              <option key={String(tool.slug)} value={String(tool.slug)}>
                {`Week ${String(tool.week)}: ${String(tool.title)}`}
              </option>
            ))}
          </select>
        </label>
        {active === undefined ? null : <p className="decision">{String(active.decision)}</p>}
      </header>

      {session.error === "" ? null : <p className="error">{session.error}</p>}

      <AssumptionForm
        fields={session.fields}
        values={session.values}
        onChange={session.changeValue}
        onRun={() => void session.compute()}
        busy={session.busy}
      />

      {result === null ? null : (
        <>
          <ResultPanel result={result} />
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
