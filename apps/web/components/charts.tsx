'use client';

/* Tiny dependency-free SVG charts (keeps the bundle small and the UI fast). */

export function Donut({ data, size = 150, label, sub }: { data: { label: string; value: number; color: string }[]; size?: number; label: string; sub: string }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={`${label} ${sub}`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
        {data.map((d) => {
          const len = (d.value / total) * c;
          const el = (
            <circle key={d.label} cx="70" cy="70" r={r} fill="none" stroke={d.color} strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)">
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
          );
          acc += len;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" className="fill-[var(--ink)]" style={{ fontSize: 24, fontWeight: 700 }}>{label}</text>
        <text x="70" y="88" textAnchor="middle" className="fill-[var(--muted)]" style={{ fontSize: 11 }}>{sub}</text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            <span className="text-muted">{d.label}</span>
            <span className="ml-auto pl-4 font-semibold tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Columns({ data, height = 160, color = 'var(--brand)' }: { data: { label: string; value: number }[]; height?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height / 2}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Column chart">
      {data.map((d, i) => {
        const h = (d.value / max) * (height / 2 - 12);
        return (
          <g key={i}>
            <rect x={i * w + w * 0.2} y={height / 2 - 10 - h} width={w * 0.6} height={Math.max(h, 0.6)} rx="1" fill={color} opacity={d.value ? 1 : 0.25}>
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

export function ColumnLabels({ labels }: { labels: string[] }) {
  return (
    <div className="mt-1 flex text-[10px] text-muted">
      {labels.map((l, i) => (
        <span key={i} className="flex-1 text-center">{l}</span>
      ))}
    </div>
  );
}

export function Burndown({ points, total }: { points: { day: string; ideal: number; actual: number | null }[]; total: number }) {
  const W = 520;
  const H = 200;
  const pad = { l: 28, r: 22, t: 10, b: 22 };
  const max = Math.max(1, total);
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ideal = points.map((p, i) => `${x(i)},${y(p.ideal)}`).join(' ');
  const act = points.filter((p) => p.actual !== null);
  const actual = act.map((p, i) => `${x(i)},${y(p.actual!)}`).join(' ');
  const ticks = [0, Math.round(max / 2), max];
  const step = Math.ceil(points.length / 7);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Sprint burndown chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="3 3" />
          <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" style={{ fontSize: 10 }} className="fill-[var(--muted)]">{t}</text>
        </g>
      ))}
      {points.map((p, i) =>
        i % step === 0 ? (
          <text key={p.day} x={x(i)} y={H - 6} textAnchor="middle" style={{ fontSize: 10 }} className="fill-[var(--muted)]">{p.day}</text>
        ) : null,
      )}
      <polyline points={ideal} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7" />
      {act.length > 0 && (
        <>
          <polygon points={`${x(0)},${y(0)} ${actual} ${x(act.length - 1)},${y(0)}`} fill="var(--brand)" opacity="0.08" />
          <polyline points={actual} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx={x(act.length - 1)} cy={y(act[act.length - 1].actual!)} r="4" fill="var(--brand)" />
        </>
      )}
    </svg>
  );
}
