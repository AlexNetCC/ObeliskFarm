import type { EvBreakdown, EvBreakdownEntry, TotalEv } from "../../lib/gemev/freebieEv";

type SegmentKey = "base" | "jackpot" | "refresh_base" | "refresh_jackpot";

const COLORS: Record<SegmentKey, string> = {
  base: "#2E86AB",
  jackpot: "#A23B72",
  refresh_base: "#F18F01",
  refresh_jackpot: "#C73E1D",
};

function sumEntry(e: EvBreakdownEntry): number {
  return e.base + e.jackpot + e.refresh_base + e.refresh_jackpot;
}

function pct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return (part / total) * 100.0;
}

function fmt1(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(1);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function LegendSwatch(props: { kind: SegmentKey }) {
  const { kind } = props;
  const W = 18;
  const H = 12;
  const id = `sw_${kind}_${Math.random().toString(16).slice(2)}`;
  const fill =
    kind === "base"
      ? COLORS.base
      : kind === "jackpot"
        ? `url(#${id})`
        : kind === "refresh_base"
          ? `url(#${id})`
          : `url(#${id})`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <defs>
        {kind === "jackpot" ? (
          <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill={COLORS.jackpot} opacity={0.85} />
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.55)" strokeWidth="3" />
          </pattern>
        ) : null}
        {kind === "refresh_base" ? (
          <pattern id={id} width="10" height="10" patternUnits="userSpaceOnUse">
            <rect width="10" height="10" fill={COLORS.refresh_base} opacity={0.85} />
            <circle cx="3" cy="3" r="1.4" fill="rgba(255,255,255,0.65)" />
            <circle cx="8" cy="7" r="1.4" fill="rgba(255,255,255,0.65)" />
          </pattern>
        ) : null}
        {kind === "refresh_jackpot" ? (
          <pattern id={id} width="10" height="10" patternUnits="userSpaceOnUse">
            <rect width="10" height="10" fill={COLORS.refresh_jackpot} opacity={0.85} />
            <path d="M0 0 L10 10 M10 0 L0 10" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" />
          </pattern>
        ) : null}
      </defs>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="2" fill={kind === "base" ? COLORS.base : fill} stroke="rgba(15,23,42,0.35)" />
    </svg>
  );
}

export function ContribLegend() {
  const legendItems: Array<{ label: string; key: SegmentKey }> = [
    { label: "Base", key: "base" },
    { label: "Jackpot", key: "jackpot" },
    { label: "Refresh (Base)", key: "refresh_base" },
    { label: "Refresh (Jackpot)", key: "refresh_jackpot" },
  ];

  return (
    <div className="gemEvLegend">
      <div className="mono" style={{ fontWeight: 900, marginBottom: 8 }}>
        Legend
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {legendItems.map((it) => (
          <div key={it.key} className="gemEvLegendRow">
            <LegendSwatch kind={it.key} />
            <div style={{ fontWeight: 800, color: "rgba(15,23,42,0.82)" }}>{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContribBarChart(props: { ev: TotalEv; breakdown: EvBreakdown }) {
  const { ev, breakdown } = props;

  const categories = [
    "Gems (Base)",
    "Stonks EV",
    "Skill Shards",
    "Founder Supply Drop",
    "Gem Bomb",
    "Founder Bomb",
  ] as const;

  const normalKeys = ["gems_base", "stonks_ev", "skill_shards_ev"] as const;
  const founderSpeed = breakdown.founder_speed_boost;
  const founderGems = breakdown.founder_gems;
  const gemBomb = breakdown.gem_bomb_gems;
  const founderBomb = breakdown.founder_bomb_boost;

  const valuesTop: number[] = [
    ev.gems_base,
    ev.stonks_ev,
    ev.skill_shards_ev,
    ev.founder_speed_boost + ev.founder_gems,
    ev.gem_bomb_gems,
    ev.founder_bomb_boost,
  ];
  const pcts: number[] = [
    pct(ev.gems_base, ev.total),
    pct(ev.stonks_ev, ev.total),
    pct(ev.skill_shards_ev, ev.total),
    pct(ev.founder_speed_boost + ev.founder_gems, ev.total),
    pct(ev.gem_bomb_gems, ev.total),
    pct(ev.founder_bomb_boost, ev.total),
  ];

  const stackForIndex = (i: number): { speed: EvBreakdownEntry | null; gems: EvBreakdownEntry | null; entry: EvBreakdownEntry } => {
    if (i <= 2) return { speed: null, gems: null, entry: breakdown[normalKeys[i]!] };
    if (i === 3) return { speed: founderSpeed, gems: founderGems, entry: founderSpeed };
    if (i === 4) return { speed: null, gems: null, entry: gemBomb };
    return { speed: null, gems: null, entry: founderBomb };
  };

  const maxVal = Math.max(
    1,
    ...normalKeys.map((k) => sumEntry(breakdown[k])),
    sumEntry(founderSpeed) + sumEntry(founderGems),
    sumEntry(gemBomb),
    sumEntry(founderBomb),
  );

  // Horizontal bar chart: categories on Y, values on X (bars left to right)
  const W = 720;
  const H = 320;
  const padL = 140;
  const padR = 72;
  const padT = 20;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const nRows = categories.length;
  const rowH = plotH / nRows;
  const barPad = 4;
  const barH = Math.max(12, rowH - 2 * barPad);
  const scaleX = plotW / maxVal;

  const gridLines = 5;
  const xTicks = Array.from({ length: gridLines + 1 }, (_, i) => i / gridLines);

  function xOf(v: number): number {
    return padL + v * scaleX;
  }

  function wOf(v: number): number {
    return v * scaleX;
  }

  function fillFor(seg: SegmentKey): string {
    if (seg === "base") return COLORS.base;
    if (seg === "jackpot") return "url(#patJackpot)";
    if (seg === "refresh_base") return "url(#patRefreshBase)";
    return "url(#patRefreshJackpot)";
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{
        display: "block",
        background: "#ffffff",
        borderRadius: 10,
        border: "1px solid rgba(15,23,42,0.10)",
      }}
      role="img"
      aria-label="EV contributions bar chart"
    >
      <defs>
        <pattern id="patJackpot" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill={COLORS.jackpot} opacity={0.85} />
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.55)" strokeWidth="3" />
        </pattern>
        <pattern id="patRefreshBase" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill={COLORS.refresh_base} opacity={0.85} />
          <circle cx="3" cy="3" r="1.4" fill="rgba(255,255,255,0.65)" />
          <circle cx="8" cy="7" r="1.4" fill="rgba(255,255,255,0.65)" />
        </pattern>
        <pattern id="patRefreshJackpot" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill={COLORS.refresh_jackpot} opacity={0.85} />
          <path d="M0 0 L10 10 M10 0 L0 10" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" />
        </pattern>
      </defs>

      {/* Grid + X labels */}
      {xTicks.map((t, i) => {
        const v = t * maxVal;
        const x = xOf(v);
        return (
          <g key={i}>
            <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="rgba(15,23,42,0.08)" strokeDasharray="4 4" />
            <text x={x} y={padT + plotH + 16} textAnchor="middle" fontSize={10} fill="rgba(71,85,105,0.9)" fontFamily="var(--mono)">
              {v.toFixed(0)}
            </text>
          </g>
        );
      })}

      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(15,23,42,0.22)" />
      <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(15,23,42,0.22)" />

      {categories.map((label, i) => {
        const y0 = padT + i * rowH + barPad;
        const { speed, gems, entry } = stackForIndex(i);

        const segs: Array<{ key: SegmentKey; v: number; x: number; w: number; left: number }> = [];
        let left = 0;
        (["base", "jackpot", "refresh_base", "refresh_jackpot"] as const).forEach((k) => {
          const v = entry[k];
          const w = wOf(v);
          const x = padL + left * scaleX;
          segs.push({ key: k, v, x, w, left });
          left += v;
        });

        let founderSpeedTotal = 0;
        let founderGemsTotal = 0;
        let segsGems: Array<{ key: SegmentKey; v: number; x: number; w: number; left: number }> = [];
        if (i === 3 && speed && gems) {
          founderSpeedTotal = sumEntry(speed);
          let left2 = founderSpeedTotal;
          segsGems = (["base", "jackpot", "refresh_base", "refresh_jackpot"] as const).map((k) => {
            const v = gems[k];
            const w = wOf(v);
            const x = padL + left2 * scaleX;
            const out = { key: k, v, x, w, left: left2 };
            left2 += v;
            return out;
          });
          founderGemsTotal = sumEntry(gems);
        }

        const totalBarLen = i === 3 ? founderSpeedTotal + founderGemsTotal : sumEntry(entry);
        const barEndX = padL + wOf(totalBarLen);
        const labelY = y0 + barH / 2 + 4;

        return (
          <g key={i}>
            <rect
              x={padL}
              y={y0}
              width={wOf(totalBarLen)}
              height={barH}
              fill="none"
              stroke="rgba(15,23,42,0.55)"
              strokeWidth={1}
              rx={2}
            />

            {segs.map((s) =>
              s.v > 0 ? (
                <rect
                  key={s.key}
                  x={s.x}
                  y={y0}
                  width={Math.max(0, s.w)}
                  height={barH}
                  fill={fillFor(s.key)}
                  stroke="rgba(15,23,42,0.45)"
                  strokeWidth={0.6}
                />
              ) : null,
            )}

            {segsGems.map((s) =>
              s.v > 0 ? (
                <rect
                  key={`g_${s.key}`}
                  x={s.x}
                  y={y0}
                  width={Math.max(0, s.w)}
                  height={barH}
                  fill={fillFor(s.key)}
                  stroke="rgba(15,23,42,0.45)"
                  strokeWidth={0.6}
                />
              ) : null,
            )}

            {i === 3 && founderSpeedTotal > 0 && wOf(founderSpeedTotal) >= 40 ? (
              <text
                x={padL + wOf(founderSpeedTotal / 2)}
                y={labelY}
                textAnchor="middle"
                fontSize={9}
                fontWeight={900}
                fill="rgba(15,23,42,0.9)"
                style={{ pointerEvents: "none" }}
              >
                Speed: {fmt1(ev.founder_speed_boost)}
              </text>
            ) : null}
            {i === 3 && founderGemsTotal > 0 && wOf(founderGemsTotal) >= 40 ? (
              <text
                x={padL + wOf(founderSpeedTotal + founderGemsTotal / 2)}
                y={labelY}
                textAnchor="middle"
                fontSize={9}
                fontWeight={900}
                fill="rgba(15,23,42,0.9)"
                style={{ pointerEvents: "none" }}
              >
                Gems: {fmt1(ev.founder_gems)}
              </text>
            ) : null}

            <text x={padL - 8} y={labelY} textAnchor="end" fontSize={11} fontWeight={800} fill="rgba(15,23,42,0.85)">
              {label}
            </text>
            <text x={barEndX + 8} y={labelY} textAnchor="start" fontSize={10} fontWeight={800} fill="rgba(71,85,105,0.9)" fontFamily="var(--mono)">
              {fmt1(valuesTop[i] ?? 0)} ({fmt1(pcts[i] ?? 0)}%)
            </text>
          </g>
        );
      })}
    </svg>
  );
}

