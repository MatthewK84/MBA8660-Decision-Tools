/**
 * Renders the input fields for whichever tool is selected. Field definitions
 * come from the server catalog, so adding a tool adds a form for free.
 *
 * Two things here exist to make the arithmetic explorable rather than
 * one-shot. Numeric fields with declared bounds get a slider beside the box,
 * so a student can drag an assumption and watch the cost move. Presets fill
 * the whole form from a seeded case organization, so the first run takes one
 * click instead of twelve guesses.
 */

/**
 * True when a field declares the bounds a slider needs.
 *
 * @param {Record<string, unknown>} field
 * @returns {boolean}
 */
function hasRange(field) {
  return field.type === "number" && typeof field.min === "number" && typeof field.max === "number";
}

/**
 * The numeric input, paired with a slider when the field declares bounds.
 *
 * @param {{ field: Record<string, unknown>, value: string, onChange: (key: string, value: string) => void }} props
 * @returns {JSX.Element}
 */
function NumberInput({ field, value, onChange }) {
  const key = String(field.key);
  const step = typeof field.step === "number" ? field.step : "any";

  return (
    <div className="number-input">
      <input
        id={key}
        type="number"
        step={step}
        min={typeof field.min === "number" ? field.min : undefined}
        max={typeof field.max === "number" ? field.max : undefined}
        value={value}
        onChange={(event) => onChange(key, event.target.value)}
      />
      {hasRange(field) ? (
        <input
          className="slider"
          type="range"
          aria-label={`${String(field.label)} slider`}
          min={Number(field.min)}
          max={Number(field.max)}
          step={step === "any" ? 1 : step}
          value={value === "" ? String(field.min) : value}
          onChange={(event) => onChange(key, event.target.value)}
        />
      ) : null}
    </div>
  );
}

/**
 * Render one field.
 *
 * @param {{ field: Record<string, unknown>, value: string, onChange: (key: string, value: string) => void }} props
 * @returns {JSX.Element}
 */
function Field({ field, value, onChange }) {
  const key = String(field.key);
  const unit = typeof field.unit === "string" ? field.unit : "";
  const help = typeof field.help === "string" ? field.help : "";
  const options = Array.isArray(field.options) ? field.options : [];

  return (
    <label className="field" htmlFor={key}>
      <span className="field-label">
        {String(field.label)}
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
      ) : null}
      {options.length === 0 && field.type === "number" ? (
        <NumberInput field={field} value={value} onChange={onChange} />
      ) : null}
      {options.length === 0 && field.type !== "number" ? (
        <input
          id={key}
          type={field.type === "date" ? "date" : "text"}
          value={value}
          onChange={(event) => onChange(key, event.target.value)}
        />
      ) : null}
      {help === "" ? null : <small className="field-help">{help}</small>}
    </label>
  );
}

/**
 * The row of preset buttons above the form.
 *
 * @param {{ presets: Record<string, unknown>[], onApply: (values: Record<string, unknown>) => void }} props
 * @returns {JSX.Element | null}
 */
function Presets({ presets, onApply }) {
  if (!Array.isArray(presets) || presets.length === 0) {
    return null;
  }
  return (
    <div className="presets">
      <span className="presets-label">Start from a case organization</span>
      <div className="presets-row">
        {presets.map((p) => (
          <button
            key={String(p.name)}
            type="button"
            className="preset"
            title={String(p.note)}
            onClick={() => onApply(p.values ?? {})}
          >
            {String(p.name)}
          </button>
        ))}
      </div>
      <small className="field-help">
        A preset fills the form so you can see the arithmetic move immediately. Every figure is still
        yours to change, and every figure you leave alone is still an assumption you are making.
      </small>
    </div>
  );
}

/**
 * Render the whole input form.
 *
 * @param {{
 *   fields: Record<string, unknown>[],
 *   presets: Record<string, unknown>[],
 *   values: Record<string, string>,
 *   onChange: (key: string, value: string) => void,
 *   onApplyPreset: (values: Record<string, unknown>) => void,
 *   onRun: () => void,
 *   busy: boolean
 * }} props
 * @returns {JSX.Element}
 */
export default function AssumptionForm({ fields, presets, values, onChange, onApplyPreset, onRun, busy }) {
  return (
    <section className="panel">
      <h2>Inputs</h2>
      <p className="note">
        Every figure here is an assumption you are making. All of them are reproduced in the export,
        attributed to you.
      </p>
      <Presets presets={presets} onApply={onApplyPreset} />
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
