/**
 * Renders the input fields for whichever tool is selected. Field definitions
 * come from the server catalog, so adding a tool adds a form for free.
 */

/**
 * Render one field.
 *
 * @param {{ field: Record<string, unknown>, value: string, onChange: (key: string, value: string) => void }} props
 * @returns {JSX.Element}
 */
function Field({ field, value, onChange }) {
  const key = String(field.key);
  const label = String(field.label);
  const unit = typeof field.unit === "string" ? field.unit : "";
  const help = typeof field.help === "string" ? field.help : "";
  const options = Array.isArray(field.options) ? field.options : [];

  return (
    <label className="field" htmlFor={key}>
      <span className="field-label">
        {label}
        {unit === "" ? null : <em className="field-unit">{unit}</em>}
      </span>
      {options.length > 0 ? (
        <select id={key} value={value} onChange={(event) => onChange(key, event.target.value)}>
          {options.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={key}
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          step="any"
          value={value}
          onChange={(event) => onChange(key, event.target.value)}
        />
      )}
      {help === "" ? null : <small className="field-help">{help}</small>}
    </label>
  );
}

/**
 * Render the whole input form.
 *
 * @param {{
 *   fields: Record<string, unknown>[],
 *   values: Record<string, string>,
 *   onChange: (key: string, value: string) => void,
 *   onRun: () => void,
 *   busy: boolean
 * }} props
 * @returns {JSX.Element}
 */
export default function AssumptionForm({ fields, values, onChange, onRun, busy }) {
  return (
    <section className="panel">
      <h2>Inputs</h2>
      <p className="note">
        Every figure here is an assumption you are making. All of them are reproduced in the export,
        attributed to you.
      </p>
      <div className="grid">
        {fields.map((field) => (
          <Field
            key={String(field.key)}
            field={field}
            value={values[String(field.key)] ?? ""}
            onChange={onChange}
          />
        ))}
      </div>
      <button type="button" className="primary" onClick={onRun} disabled={busy}>
        {busy ? "Computing" : "Compute"}
      </button>
    </section>
  );
}
