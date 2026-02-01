import type { EvBreakdown, EvBreakdownEntry, TotalEv } from "../../lib/gemev/freebieEv";
import { assetUrl } from "../../lib/assets";

type SegmentKey = "base" | "jackpot" | "refresh_base" | "refresh_jackpot";

const COLORS: Record<SegmentKey, string> = {
  base: "#2E86AB",
  jackpot: "#A23B72",
  refresh_base: "#F18F01",
  refresh_jackpot: "#C73E1D",
};

/** Gem Bomb bar: light gray hatched segment for 10× Bomb Recharge impact (limited uptime). */
const GEM_BOMB_10X_BG = "rgba(0,0,0,0.06)";
const GEM_BOMB_10X_HATCH = "rgba(0,0,0,0.08)";
/** Chaos Totem segment: slightly darker hatch to distinguish from 10×. */
const CHAOS_TOTEM_BG = "rgba(0,0,0,0.05)";
const CHAOS_TOTEM_HATCH = "rgba(0,0,0,0.10)";


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

export function ContribBarChart(props: { ev: TotalEv; breakdown: EvBreakdown; lootbugNetGemsPerHour?: number; droneFuelGemsPerHour?: number; gemBomb10xImpact?: number; chaosTotemImpact?: number }) {
  const { ev, breakdown, lootbugNetGemsPerHour, droneFuelGemsPerHour, gemBomb10xImpact, chaosTotemImpact } = props;

  /** Founder Bomb bar hidden (FOUNDER_BOMB_VISIBLE in GemEv). */
  const categoriesBase = [
    "Gems (Base)",
    "Stonks EV",
    "Skill Shards",
    "Founder Supply Drop",
    "Gem Bomb",
  ] as const;
  const hasLootbug = typeof lootbugNetGemsPerHour === "number";
  const hasDroneFuel = typeof droneFuelGemsPerHour === "number";
  const categories = [
    ...categoriesBase,
    ...(hasLootbug ? ["Lootbug Gems (raw)"] as const : []),
    ...(hasDroneFuel ? ["Drone Fuel"] as const : []),
  ] as const;

  const normalKeys = ["gems_base", "stonks_ev", "skill_shards_ev"] as const;
  const founderSpeed = breakdown.founder_speed_boost;
  const founderGems = breakdown.founder_gems;
  const gemBomb = breakdown.gem_bomb_gems;

  const valuesTopBase: number[] = [
    ev.gems_base,
    ev.stonks_ev,
    ev.skill_shards_ev,
    ev.founder_speed_boost + ev.founder_gems,
    ev.gem_bomb_gems,
  ];
  const valuesTop = [
    ...valuesTopBase,
    ...(hasLootbug ? [lootbugNetGemsPerHour!] : []),
    ...(hasDroneFuel ? [droneFuelGemsPerHour!] : []),
  ];
  const totalForPct =
    ev.total +
    (hasLootbug && typeof lootbugNetGemsPerHour === "number" ? lootbugNetGemsPerHour : 0) +
    (hasDroneFuel && typeof droneFuelGemsPerHour === "number" ? droneFuelGemsPerHour : 0);
  const pctsBase: number[] = [
    pct(ev.gems_base, ev.total),
    pct(ev.stonks_ev, ev.total),
    pct(ev.skill_shards_ev, ev.total),
    pct(ev.founder_speed_boost + ev.founder_gems, ev.total),
    pct(ev.gem_bomb_gems, ev.total),
  ];
  const pcts = [
    ...pctsBase,
    ...(hasLootbug ? [totalForPct !== 0 ? pct(lootbugNetGemsPerHour!, totalForPct) : 0] : []),
    ...(hasDroneFuel ? [totalForPct !== 0 ? pct(droneFuelGemsPerHour!, totalForPct) : 0] : []),
  ];

  const stackForIndex = (i: number): { speed: EvBreakdownEntry | null; gems: EvBreakdownEntry | null; entry: EvBreakdownEntry } => {
    if (i <= 2) return { speed: null, gems: null, entry: breakdown[normalKeys[i]!] };
    if (i === 3) return { speed: founderSpeed, gems: founderGems, entry: founderSpeed };
    return { speed: null, gems: null, entry: gemBomb };
  };

  const maxValPos = Math.max(
    1,
    ...normalKeys.map((k) => sumEntry(breakdown[k])),
    sumEntry(founderSpeed) + sumEntry(founderGems),
    sumEntry(gemBomb),
  );
  const extraMin = [hasLootbug ? lootbugNetGemsPerHour : null, hasDroneFuel ? droneFuelGemsPerHour : null].filter(
    (v): v is number => typeof v === "number",
  );
  const minVal = extraMin.length > 0 ? Math.min(0, ...extraMin) : 0;
  const maxVal =
    extraMin.length > 0 ? Math.max(maxValPos, ...valuesTop.filter((v) => v > 0), -minVal) : maxValPos;
  const range = maxVal - minVal;

  // Horizontal bar chart: categories on Y, values on X (bars left to right; origin at 0 when minVal < 0)
  // W / padR chosen so right-side value labels (barEndX + 8 + text) stay inside viewBox and are not clipped
  const W = 800;
  const nExtra = (hasLootbug ? 1 : 0) + (hasDroneFuel ? 1 : 0);
  const H = 320 + nExtra * 40;
  const padL = 140;
  const padR = 152;
  const padT = 20;
  const padB = 56;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const nRows = categories.length;
  const rowH = plotH / nRows;
  const barPad = 4;
  const barH = Math.max(12, rowH - 2 * barPad);
  const scaleX = range > 0 ? plotW / range : plotW;

  const gridLines = 5;
  const xTicks = Array.from({ length: gridLines + 1 }, (_, i) => minVal + (i / gridLines) * range);

  function xOf(v: number): number {
    return padL + (v - minVal) * scaleX;
  }

  function wOf(v: number): number {
    return Math.abs(v) * scaleX;
  }

  function fillFor(seg: SegmentKey): string {
    if (seg === "base") return COLORS.base;
    if (seg === "jackpot") return "url(#patJackpot)";
    if (seg === "refresh_base") return "url(#patRefreshBase)";
    return "url(#patRefreshJackpot)";
  }

  const gemIconUrl = assetUrl("sprites/common/gem.png");

  return (
    <>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{
          display: "block",
          background: "#ffffff",
          borderRadius: "0 0 10px 10px",
          border: "1px solid rgba(15,23,42,0.10)",
          borderTop: "none",
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
        <pattern id="pat10xBomb" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill={GEM_BOMB_10X_BG} />
          <line x1="0" y1="0" x2="0" y2="8" stroke={GEM_BOMB_10X_HATCH} strokeWidth="1.2" />
        </pattern>
        <pattern id="patChaosTotem" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <rect width="6" height="6" fill={CHAOS_TOTEM_BG} />
          <line x1="0" y1="0" x2="0" y2="6" stroke={CHAOS_TOTEM_HATCH} strokeWidth="1" />
        </pattern>
      </defs>

      {/* Grid + X labels */}
      {xTicks.map((t, i) => {
        const x = xOf(t);
        return (
          <g key={i}>
            <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="rgba(15,23,42,0.08)" strokeDasharray="4 4" />
            <text x={x} y={padT + plotH + 16} textAnchor="middle" fontSize={10} fill="rgba(71,85,105,0.9)" fontFamily="var(--mono)">
              {t.toFixed(0)}
            </text>
          </g>
        );
      })}
      {minVal < 0 && (
        <line x1={xOf(0)} y1={padT} x2={xOf(0)} y2={padT + plotH} stroke="rgba(15,23,42,0.35)" strokeWidth={1.2} />
      )}
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(15,23,42,0.22)" />
      <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(15,23,42,0.22)" />

      {/* X-axis unit: Gem/h inside plot (extra padB gives gap from axis/tick labels) */}
      <g aria-hidden="true">
        <image href={gemIconUrl} x={W / 2 - 18} y={H - 14} width={16} height={16} />
        <text x={W / 2 - 2} y={H - 2} textAnchor="start" fontSize={10} fontWeight={800} fill="rgba(71,85,105,0.9)" fontFamily="var(--mono)">/h</text>
      </g>

      {categories.map((label, i) => {
        const y0 = padT + i * rowH + barPad;
        const isLootbugRow = hasLootbug && i === 5;
        const isDroneFuelRow = hasDroneFuel && i === 5 + (hasLootbug ? 1 : 0);
        const isGemBombRow = i === 4;
        const { speed, gems, entry } = isLootbugRow || isDroneFuelRow ? { speed: null, gems: null, entry: null! } : stackForIndex(i);

        const segs: Array<{ key: SegmentKey; v: number; x: number; w: number; left: number }> = [];
        let left = 0;
        if (!isLootbugRow && !isDroneFuelRow && entry) {
          if (isGemBombRow && (typeof gemBomb10xImpact === "number" && gemBomb10xImpact > 0 || typeof chaosTotemImpact === "number" && chaosTotemImpact > 0)) {
            const basePart = Math.max(0, sumEntry(entry) - (gemBomb10xImpact ?? 0) - (chaosTotemImpact ?? 0));
            segs.push({ key: "base", v: basePart, x: xOf(0), w: wOf(basePart), left: 0 });
            // 10× and Chaos Totem parts drawn separately below
          } else {
            (["base", "jackpot", "refresh_base", "refresh_jackpot"] as const).forEach((k) => {
              const v = entry[k];
              const w = wOf(v);
              const x = xOf(left);
              segs.push({ key: k, v, x, w, left });
              left += v;
            });
          }
        }

        let founderSpeedTotal = 0;
        let founderGemsTotal = 0;
        let segsGems: Array<{ key: SegmentKey; v: number; x: number; w: number; left: number }> = [];
        if (i === 3 && speed && gems) {
          founderSpeedTotal = sumEntry(speed);
          let left2 = founderSpeedTotal;
          segsGems = (["base", "jackpot", "refresh_base", "refresh_jackpot"] as const).map((k) => {
            const v = gems[k];
            const w = wOf(v);
            const x = xOf(left2);
            const out = { key: k, v, x, w, left: left2 };
            left2 += v;
            return out;
          });
          founderGemsTotal = sumEntry(gems);
        }

        const totalBarLen = isLootbugRow
          ? (typeof lootbugNetGemsPerHour === "number" ? lootbugNetGemsPerHour : 0)
          : isDroneFuelRow
            ? (typeof droneFuelGemsPerHour === "number" ? droneFuelGemsPerHour : 0)
            : i === 3
              ? founderSpeedTotal + founderGemsTotal
              : sumEntry(entry);
        const barStartX = isLootbugRow
          ? (typeof lootbugNetGemsPerHour === "number" ? Math.min(0, lootbugNetGemsPerHour) : 0)
          : isDroneFuelRow
            ? (typeof droneFuelGemsPerHour === "number" ? Math.min(0, droneFuelGemsPerHour) : 0)
            : 0;
        const barLen =
          isLootbugRow && typeof lootbugNetGemsPerHour === "number"
            ? Math.abs(lootbugNetGemsPerHour)
            : isDroneFuelRow && typeof droneFuelGemsPerHour === "number"
              ? Math.abs(droneFuelGemsPerHour)
              : totalBarLen;
        const barEndX = xOf(
          isLootbugRow && typeof lootbugNetGemsPerHour === "number"
            ? Math.max(0, lootbugNetGemsPerHour)
            : isDroneFuelRow && typeof droneFuelGemsPerHour === "number"
              ? Math.max(0, droneFuelGemsPerHour)
              : totalBarLen,
        );
        const labelY = y0 + barH / 2 + 4;

        return (
          <g key={i}>
            <rect
              x={isLootbugRow || isDroneFuelRow ? xOf(barStartX) : xOf(0)}
              y={y0}
              width={wOf(barLen)}
              height={barH}
              fill="none"
              stroke="rgba(15,23,42,0.55)"
              strokeWidth={1}
              rx={2}
            />

            {isLootbugRow && typeof lootbugNetGemsPerHour === "number" && lootbugNetGemsPerHour !== 0 ? (
              <rect
                x={xOf(Math.min(0, lootbugNetGemsPerHour))}
                y={y0}
                width={wOf(Math.abs(lootbugNetGemsPerHour))}
                height={barH}
                fill={COLORS.base}
                stroke="rgba(15,23,42,0.45)"
                strokeWidth={0.6}
              />
            ) : null}
            {isDroneFuelRow && typeof droneFuelGemsPerHour === "number" && droneFuelGemsPerHour !== 0 ? (
              <rect
                x={xOf(Math.min(0, droneFuelGemsPerHour))}
                y={y0}
                width={wOf(Math.abs(droneFuelGemsPerHour))}
                height={barH}
                fill={COLORS.base}
                stroke="rgba(15,23,42,0.45)"
                strokeWidth={0.6}
              />
            ) : null}

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

            {isGemBombRow && typeof gemBomb10xImpact === "number" && gemBomb10xImpact > 0 ? (
              <>
                <rect
                  x={xOf(sumEntry(entry) - (gemBomb10xImpact ?? 0) - (chaosTotemImpact ?? 0))}
                  y={y0}
                  width={wOf(gemBomb10xImpact)}
                  height={barH}
                  fill="url(#pat10xBomb)"
                  stroke="rgba(15,23,42,0.45)"
                  strokeWidth={0.6}
                />
                {wOf(gemBomb10xImpact) >= 52 ? (
                  <text
                    x={xOf(sumEntry(entry) - (gemBomb10xImpact ?? 0) - (chaosTotemImpact ?? 0)) + wOf(gemBomb10xImpact) / 2}
                    y={labelY - 5}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={800}
                    fill="rgba(15,23,42,0.75)"
                    style={{ pointerEvents: "none" }}
                  >
                    <tspan x={xOf(sumEntry(entry) - (gemBomb10xImpact ?? 0) - (chaosTotemImpact ?? 0)) + wOf(gemBomb10xImpact) / 2} dy="0">10× Bomb</tspan>
                    <tspan x={xOf(sumEntry(entry) - (gemBomb10xImpact ?? 0) - (chaosTotemImpact ?? 0)) + wOf(gemBomb10xImpact) / 2} dy="10">Recharge</tspan>
                  </text>
                ) : null}
              </>
            ) : null}
            {isGemBombRow && typeof chaosTotemImpact === "number" && chaosTotemImpact > 0 ? (
              <>
                <rect
                  x={xOf(sumEntry(entry) - (chaosTotemImpact ?? 0))}
                  y={y0}
                  width={wOf(chaosTotemImpact)}
                  height={barH}
                  fill="url(#patChaosTotem)"
                  stroke="rgba(15,23,42,0.45)"
                  strokeWidth={0.6}
                />
                {wOf(chaosTotemImpact) >= 48 ? (
                  <text
                    x={xOf(sumEntry(entry) - (chaosTotemImpact ?? 0)) + wOf(chaosTotemImpact) / 2}
                    y={labelY}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={800}
                    fill="rgba(15,23,42,0.75)"
                    style={{ pointerEvents: "none" }}
                  >
                    Chaos Totem
                  </text>
                ) : null}
              </>
            ) : null}

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
                x={xOf(founderSpeedTotal / 2)}
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
    </>
  );
}

