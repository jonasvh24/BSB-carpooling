// Plain SVG horizontal bar chart; no charting dependency. Labels come from i18n.
export function BarChart({ title, data, labels, total }: { title: string; data: Record<string, number>; labels?: Record<string, string>; total?: number }) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const rowH = 22;
  const labelW = 150;
  const width = 420;
  const height = entries.length * rowH + 4;
  return (
    <figure className="rounded-xl border border-border bg-surface p-3">
      <figcaption className="mb-2 text-sm font-medium">
        {title} {total != null && <span className="font-normal text-muted">(n = {total})</span>}
      </figcaption>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">—</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} className="w-full">
          {entries.map(([k, v], i) => {
            const y = i * rowH;
            const w = ((width - labelW - 40) * v) / max;
            return (
              <g key={k} transform={`translate(0 ${y})`}>
                <text x={labelW - 6} y={15} textAnchor="end" fontSize="12" fill="currentColor">
                  {labels?.[k] ?? k}
                </text>
                <rect x={labelW} y={4} width={Math.max(w, 1)} height={14} rx={3} fill="var(--accent)" />
                <text x={labelW + w + 6} y={15} fontSize="12" fill="currentColor">
                  {v}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </figure>
  );
}
