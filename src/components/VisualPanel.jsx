/**
 * Renders the chart specifications a tool returns, as inline SVG.
 *
 * Nothing here decides anything. A chart shows the same figures the results
 * table shows, in a shape a student can read at a glance and point at during
 * a Live Defense. Every chart also has a table view underneath it, so the
 * numbers are never gated behind colour perception.
 *
 * Palette: categorical slots 1 to 6 of the validated default, which clears
 * the colour-vision-deficiency and normal-vision separation gates on the
 * adjacent pairlist. Three slots sit below 3:1 contrast on white, so every
 * mark carries a visible direct label rather than relying on hue alone.
 */

const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const INK = "#16181d";
const MUTED = "#5d636e";
const GRID = "#d8dbe0";
const SURFACE = "#ffffff";
const BAR_HEIGHT = 22;
const ROW_GAP = 14;
const LABEL_WIDTH = 168;
const CHART_WIDTH = 640;

/**
 * Pick a series colour by index, never cycling past the defined slots.
 *
 * @param {number} index
 * @returns {string}
 */
function seriesColor(index) {
  return SERIES[index % SERIES.length] ?? SERIES[0];
}

/**
 * The largest value in a point list, floored at a positive number so a chart
 * of all zeroes still renders instead of dividing by zero.
 *
 * @param {{ value: number }[]} points
 * @returns {number}
 */
function peak(points) {
  return Math.max(1e-9, ...points.map((p) => Math.abs(Number(p.value) || 0)));
}

/**
 * A horizontal bar chart. One colour per category, value labelled at the tip.
 *
 * @param {{ points: Record<string, unknown>[] }} props
 * @returns {JSX.Element}
 */
function BarChart({ points }) {
  const max = peak(points);
  const plotWidth = CHART_WIDTH - LABEL_WIDTH - 90;
  const height = points.length * (BAR_HEIGHT + ROW_GAP);

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${height}`} width="100%" height={height} role="img">
      {points.map((p, i) => {
        const width = Math.max(2, (Math.abs(Number(p.value) || 0) / max) * plotWidth);
        const y = i * (BAR_HEIGHT + ROW_GAP);
        return (
          <g key={`${String(p.label)}-${String(i)}`}>
            <text x={LABEL_WIDTH - 8} y={y + BAR_HEIGHT * 0.7} textAnchor="end" fontSize="12" fill={MUTED}>
              {String(p.label)}
            </text>
            <rect x={LABEL_WIDTH} y={y} width={width} height={BAR_HEIGHT} rx="4" fill={seriesColor(i)} />
            <rect x={LABEL_WIDTH} y={y} width="4" height={BAR_HEIGHT} fill={seriesColor(i)} />
            <text x={LABEL_WIDTH + width + 8} y={y + BAR_HEIGHT * 0.7} fontSize="12" fill={INK} fontWeight="600">
              {String(p.display)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Group stacked points by their category label, preserving order.
 *
 * @param {Record<string, unknown>[]} points
 * @returns {{ label: string, parts: Record<string, unknown>[] }[]}
 */
function groupByLabel(points) {
  const order = [];
  const byLabel = new Map();
  for (const p of points) {
    const label = String(p.label);
    if (!byLabel.has(label)) {
      byLabel.set(label, []);
      order.push(label);
    }
    byLabel.get(label).push(p);
  }
  return order.map((label) => ({ label, parts: byLabel.get(label) ?? [] }));
}

/**
 * A stacked bar chart. Segments are separated by a 2px gap in the surface
 * colour rather than by a stroke, so no non-data ink is added.
 *
 * @param {{ points: Record<string, unknown>[] }} props
 * @returns {JSX.Element}
 */
function StackChart({ points }) {
  const rows = groupByLabel(points);
  const totals = rows.map((r) => r.parts.reduce((sum, p) => sum + Math.abs(Number(p.value) || 0), 0));
  const max = Math.max(1e-9, ...totals);
  const plotWidth = CHART_WIDTH - LABEL_WIDTH - 90;
  const height = rows.length * (BAR_HEIGHT + ROW_GAP);

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${height}`} width="100%" height={height} role="img">
      {rows.map((row, rowIndex) => {
        const y = rowIndex * (BAR_HEIGHT + ROW_GAP);
        let x = LABEL_WIDTH;
        return (
          <g key={row.label}>
            <text x={LABEL_WIDTH - 8} y={y + BAR_HEIGHT * 0.7} textAnchor="end" fontSize="12" fill={MUTED}>
              {row.label}
            </text>
            {row.parts.map((p, partIndex) => {
              const width = Math.max(1, (Math.abs(Number(p.value) || 0) / max) * plotWidth);
              const segmentX = x;
              x += width + 2;
              return (
                <rect
                  key={`${row.label}-${String(partIndex)}`}
                  x={segmentX}
                  y={y}
                  width={width}
                  height={BAR_HEIGHT}
                  rx="2"
                  fill={seriesColor(partIndex)}
                >
                  <title>{`${String(p.group)}: ${String(p.display)}`}</title>
                </rect>
              );
            })}
            <text x={x + 8} y={y + BAR_HEIGHT * 0.7} fontSize="12" fill={INK} fontWeight="600">
              {row.parts.map((p) => String(p.display)).join(" + ")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * A gauge: one measured value against a ceiling it must respect. The fill
 * turns red past the ceiling, because that is a different kind of fact.
 *
 * @param {{ points: Record<string, unknown>[], reference: Record<string, unknown> }} props
 * @returns {JSX.Element}
 */
function GaugeChart({ points, reference }) {
  const measured = points[0];
  const value = Math.abs(Number(measured?.value) || 0);
  const ceiling = Math.abs(Number(reference?.value) || 0);
  const scale = Math.max(value, ceiling) * 1.15;
  const plotWidth = CHART_WIDTH - 40;
  const fill = value > ceiling ? "#d03b3b" : "#2a78d6";
  const barWidth = Math.max(2, (value / scale) * plotWidth);
  const markerX = 20 + (ceiling / scale) * plotWidth;

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} 86`} width="100%" height="86" role="img">
      <rect x="20" y="22" width={plotWidth} height={BAR_HEIGHT} rx="4" fill="#eef0f3" />
      <rect x="20" y="22" width={barWidth} height={BAR_HEIGHT} rx="4" fill={fill} />
      <line x1={markerX} y1="14" x2={markerX} y2={22 + BAR_HEIGHT + 6} stroke={INK} strokeWidth="2" />
      <text x="20" y="14" fontSize="12" fill={INK} fontWeight="600">
        {String(measured?.display ?? "")}
      </text>
      <text x={markerX} y={22 + BAR_HEIGHT + 20} fontSize="11" fill={MUTED} textAnchor="middle">
        {String(reference?.label ?? "")}
      </text>
    </svg>
  );
}

/**
 * A timeline of dated milestones. Everything left of the zero line is already
 * in force; everything right of it is a deadline still being spent.
 *
 * @param {{ points: Record<string, unknown>[] }} props
 * @returns {JSX.Element}
 */
function TimelineChart({ points }) {
  const offsets = points.map((p) => Number(p.value) || 0);
  const min = Math.min(0, ...offsets);
  const max = Math.max(0, ...offsets);
  const span = Math.max(1, max - min);
  const plotWidth = CHART_WIDTH - 200;
  const height = points.length * 26 + 20;
  const zeroX = 150 + ((0 - min) / span) * plotWidth;

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${height}`} width="100%" height={height} role="img">
      <line x1={zeroX} y1="4" x2={zeroX} y2={height - 8} stroke={INK} strokeWidth="2" />
      <text x={zeroX + 4} y={height - 1} fontSize="10" fill={MUTED}>today</text>
      {points.map((p, i) => {
        const days = Number(p.value) || 0;
        const cx = 150 + ((days - min) / span) * plotWidth;
        const y = 14 + i * 26;
        const inForce = days < 0;
        return (
          <g key={String(p.label)}>
            <text x="142" y={y + 4} textAnchor="end" fontSize="11" fill={MUTED}>{String(p.label)}</text>
            <line x1={zeroX} y1={y} x2={cx} y2={y} stroke={GRID} strokeWidth="1" />
            <circle cx={cx} cy={y} r="5" fill={inForce ? "#eb6834" : "#2a78d6"} stroke={SURFACE} strokeWidth="2" />
            <text x={cx + 10} y={y + 4} fontSize="11" fill={INK}>{String(p.display)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * A grant matrix. Granted and denied are distinguished by fill, by the word
 * itself, and by a check or dash glyph, so no meaning rests on colour alone.
 *
 * @param {{ points: Record<string, unknown>[] }} props
 * @returns {JSX.Element}
 */
function MatrixChart({ points }) {
  const height = points.length * 28;
  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${height}`} width="100%" height={height} role="img">
      {points.map((p, i) => {
        const granted = Number(p.value) === 1;
        const y = i * 28;
        return (
          <g key={String(p.label)}>
            <rect x="0" y={y} width={CHART_WIDTH} height="24" rx="4" fill={granted ? "#fdeee7" : "#f2f4f6"} />
            <text x="12" y={y + 16} fontSize="12" fill={INK}>{String(p.label)}</text>
            <text x={CHART_WIDTH - 12} y={y + 16} textAnchor="end" fontSize="12" fontWeight="600" fill={granted ? "#a3232b" : MUTED}>
              {granted ? "✓ Granted" : "– Denied"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Dispatch to the right chart for a visual's kind.
 *
 * @param {{ visual: Record<string, unknown> }} props
 * @returns {JSX.Element | null}
 */
function Chart({ visual }) {
  const points = Array.isArray(visual.points) ? visual.points : [];
  if (points.length === 0) {
    return null;
  }
  if (visual.kind === "stack") {
    return <StackChart points={points} />;
  }
  if (visual.kind === "gauge") {
    return <GaugeChart points={points} reference={visual.reference ?? {}} />;
  }
  if (visual.kind === "timeline") {
    return <TimelineChart points={points} />;
  }
  if (visual.kind === "matrix") {
    return <MatrixChart points={points} />;
  }
  return <BarChart points={points} />;
}

/**
 * One figure: title, chart, caption, and a table of the same values.
 *
 * @param {{ visual: Record<string, unknown> }} props
 * @returns {JSX.Element}
 */
function Figure({ visual }) {
  const points = Array.isArray(visual.points) ? visual.points : [];
  const unit = typeof visual.unit === "string" && visual.unit !== "" ? ` (${visual.unit})` : "";

  return (
    <figure className="figure">
      <figcaption className="figure-title">
        {String(visual.title)}
        <span className="figure-unit">{unit}</span>
      </figcaption>
      <Chart visual={visual} />
      <p className="figure-caption">{String(visual.caption)}</p>
      <details className="figure-table">
        <summary>Show these values as a table</summary>
        <table>
          <tbody>
            {points.map((p, i) => (
              <tr key={`${String(p.label)}-${String(i)}`}>
                <th scope="row">{String(p.group) === "" ? String(p.label) : `${String(p.label)} — ${String(p.group)}`}</th>
                <td>{String(p.display)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/**
 * Render every figure a tool returned.
 *
 * @param {{ visuals: Record<string, unknown>[] }} props
 * @returns {JSX.Element | null}
 */
export default function VisualPanel({ visuals }) {
  if (!Array.isArray(visuals) || visuals.length === 0) {
    return null;
  }
  return (
    <section className="panel">
      <h2>Figures</h2>
      <p className="note">
        The same numbers as above, shaped so you can see the relationship instead of reading it. Each
        figure has a table view, because a chart you cannot read is not evidence.
      </p>
      {visuals.map((visual, i) => (
        <Figure key={`${String(visual.title)}-${String(i)}`} visual={visual} />
      ))}
    </section>
  );
}
