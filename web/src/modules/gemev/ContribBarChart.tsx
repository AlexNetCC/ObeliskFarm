import type { EvBreakdown, EvBreakdownEntry, TotalEv } from "../../lib/gemev/freebieEv";
import { assetUrl } from "../../lib/assets";

type SegmentKey = "base" | "jackpot" | "refresh_base" | "refresh_jackpot" | "gift";

const COLORS: Record<SegmentKey, string> = {
  base: "#2E86AB",
  jackpot: "#A23B72",
  refresh_base: "#F18F01",
  refresh_jackpot: "#C73E1D",
  gift: "rgba(232,168,56,0.45)",
};

/** Gem Bomb bar: light gray hatched segment for 10× Bomb Recharge impact (limited uptime). */
const GEM_BOMB_10X_BG = "rgba(0,0,0,0.06)";
const GEM_BOMB_10X_HATCH = "rgba(0,0,0,0.08)";
/** Chaos Totem segment: slightly darker hatch to distinguish from 10×. */
const CHAOS_TOTEM_BG = "rgba(0,0,0,0.05)";
const CHAOS_TOTEM_HATCH = "rgba(0,0,0,0.10)";
/** Charge Magnet segment (from Item Chests). */
const CHARGE_MAGNET_BG = "rgba(0,0,0,0.04)";
const CHARGE_MAGNET_HATCH = "rgba(0,0,0,0.09)";

const BOMB_RECHARGE_10X_ICON = "https://static.wikitide.net/shminerwiki/b/ba/Bomb_Recharge_Speed_10x_Buff.png";
const CHAOS_TOTEM_ICON = "https://static.wikitide.net/shminerwiki/a/a6/Chaos_Totem.png";
const CHARGE_MAGNET_ICON = "https://static.wikitide.net/shminerwiki/f/fc/Charge_Magnet.png";
const GIFT_ICON = "https://static.wikitide.net/shminerwiki/2/24/Gift.png";
const SEGMENT_ICON_SIZE = 12;
/** Min bar width (px) to draw icon inside bar; below this we draw line from bar center to icon. */
const SEGMENT_ICON_MIN_BAR = SEGMENT_ICON_SIZE + 4;
/** When bar too small: line from bar center to icon goes up-right by this many px (x and y). */
const SEGMENT_ICON_LINE_OFFSET = 20;


function sumEntry(e: EvBreakdownEntry): number {
  return e.base + e.jackpot + e.refresh_base + e.refresh_jackpot + (e.gift ?? 0);
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

type RowKind = "gems_base" | "stonks_ev" | "skill_shards_ev" | "founder" | "gem_bomb" | "lootbug_gains" | "lootbug_costs" | "drone";

export function ContribBarChart(props: {
  ev: TotalEv;
  breakdown: EvBreakdown;
  /** Lootbug gains (gross): Gems raw + 10× Bomb Recharge Gem EV + Item Chests. */
  lootbugGainsGross?: number;
  /** Lootbug Gem buff costs (positive; shown as negative bar). */
  lootbugTotalGemCostPerHour?: number;
  /** Lootbug share of 10× Gem EV (for excluding from Gem Bomb bar). */
  lootbug10xGemEvPerHour?: number;
  droneFuelGemsPerHour?: number;
  gemBomb10xImpact?: number;
  chaosTotemImpact?: number;
  chargeMagnetImpact?: number;
  /** Founder supply drop item chests (Charge Magnet + Chaos Totem value). Shown in Founder bar, excluded from Gem Bomb. */
  founderSupplyDropItemsGemValue?: number;
  /** Founder supply drop Frogspawn (1/500 × 5 per drop) → capacity Lootfrogs; recursive EV from Drone. Shown in Founder bar. */
  founderSupplyDropFrogspawnGemValue?: number;
  /** Founder supply drop Buttery Lobster (1/1500 × 5) → each fills freebie bank to cap. Shown in Founder bar. */
  founderSupplyDropButteryLobsterGemValue?: number;
  /** When true, Freebie Gems / Stonks / Skill Shards bars show base/jackpot/refresh segments. When false, solid blue. */
  showJackpotRefresh?: boolean;
  /** When false, Skill Shards row is hidden entirely. */
  skillShardsEnabled?: boolean;
}) {
  const {
    ev,
    breakdown,
    lootbugGainsGross,
    lootbugTotalGemCostPerHour,
    lootbug10xGemEvPerHour = 0,
    droneFuelGemsPerHour,
    gemBomb10xImpact,
    chaosTotemImpact,
    chargeMagnetImpact,
    founderSupplyDropItemsGemValue = 0,
    founderSupplyDropFrogspawnGemValue = 0,
    founderSupplyDropButteryLobsterGemValue = 0,
    showJackpotRefresh = true,
    skillShardsEnabled = true,
  } = props;

  const founderSpeed = breakdown.founder_speed_boost;
  const founderGems = breakdown.founder_gems;
  const gemBomb = breakdown.gem_bomb_gems;
  /** Gem Bomb bar: exclude Lootbug share of 10×; show only bomb cycle + Drone 10× + Chaos + Charge Magnet. */
  const gemBomb10xForChart = Math.max(0, (gemBomb10xImpact ?? 0) - lootbug10xGemEvPerHour);

  const hasLootbugGains = typeof lootbugGainsGross === "number";
  const hasLootbugCosts = typeof lootbugTotalGemCostPerHour === "number" && lootbugTotalGemCostPerHour > 0;
  const hasLootbug = hasLootbugGains || hasLootbugCosts;
  const hasDroneFuel = typeof droneFuelGemsPerHour === "number";
  const categoriesBase: Array<{ label: string; kind: RowKind }> = [
    { label: "Freebie Gems", kind: "gems_base" },
    { label: "Stonks EV", kind: "stonks_ev" },
    ...(skillShardsEnabled ? [{ label: "Skill Shards", kind: "skill_shards_ev" as RowKind }] : []),
    { label: "Founder Supply Drop", kind: "founder" },
    { label: "Gem Bomb", kind: "gem_bomb" },
  ];
  const categories = [
    ...categoriesBase.map((c) => c.label),
    ...(hasLootbugGains ? ["Lootbug gains"] : []),
    ...(hasLootbugCosts ? ["Lootbug Gem buff costs"] : []),
    ...(hasDroneFuel ? ["Drone Fuel"] : []),
  ] as const;
  const rowKinds: RowKind[] = [
    ...categoriesBase.map((c) => c.kind),
    ...(hasLootbugGains ? (["lootbug_gains"] as const) : []),
    ...(hasLootbugCosts ? (["lootbug_costs"] as const) : []),
    ...(hasDroneFuel ? (["drone"] as const) : []),
  ];

  const lootbugNetContribution = (lootbugGainsGross ?? 0) - (lootbugTotalGemCostPerHour ?? 0);
  const totalForPct =
    ev.total +
    (hasLootbug ? lootbugNetContribution : 0) +
    (hasDroneFuel && typeof droneFuelGemsPerHour === "number" ? droneFuelGemsPerHour : 0) +
    (chargeMagnetImpact ?? 0) +
    founderSupplyDropItemsGemValue +
    founderSupplyDropFrogspawnGemValue +
    founderSupplyDropButteryLobsterGemValue;
  const gemBombValueForDisplay = ev.gem_bomb_gems + (chargeMagnetImpact ?? 0);
  const founderValueForDisplay =
    ev.founder_speed_boost +
    ev.founder_gems +
    founderSupplyDropItemsGemValue +
    founderSupplyDropFrogspawnGemValue +
    founderSupplyDropButteryLobsterGemValue;

  const valuesTopBase: number[] = [
    ev.gems_base,
    ev.stonks_ev,
    ...(skillShardsEnabled ? [ev.skill_shards_ev] : []),
    founderValueForDisplay,
    gemBombValueForDisplay,
  ];
  const valuesTop = [
    ...valuesTopBase,
    ...(hasLootbugGains ? [lootbugGainsGross!] : []),
    ...(hasLootbugCosts ? [-lootbugTotalGemCostPerHour!] : []),
    ...(hasDroneFuel ? [droneFuelGemsPerHour!] : []),
  ];
  const pctsBase: number[] = [
    pct(ev.gems_base, totalForPct),
    pct(ev.stonks_ev, totalForPct),
    ...(skillShardsEnabled ? [pct(ev.skill_shards_ev, totalForPct)] : []),
    pct(founderValueForDisplay, totalForPct),
    pct(gemBombValueForDisplay, totalForPct),
  ];
  const pcts = [
    ...pctsBase,
    ...(hasLootbugGains ? [totalForPct !== 0 ? pct(lootbugGainsGross!, totalForPct) : 0] : []),
    ...(hasLootbugCosts ? [totalForPct !== 0 ? pct(-lootbugTotalGemCostPerHour!, totalForPct) : 0] : []),
    ...(hasDroneFuel ? [totalForPct !== 0 ? pct(droneFuelGemsPerHour!, totalForPct) : 0] : []),
  ];

  const stackForIndex = (i: number): { speed: EvBreakdownEntry | null; gems: EvBreakdownEntry | null; entry: EvBreakdownEntry | null } => {
    const kind = rowKinds[i];
    if (kind === "gems_base") return { speed: null, gems: null, entry: breakdown.gems_base };
    if (kind === "stonks_ev") return { speed: null, gems: null, entry: breakdown.stonks_ev };
    if (kind === "skill_shards_ev") return { speed: null, gems: null, entry: breakdown.skill_shards_ev };
    if (kind === "founder") return { speed: founderSpeed, gems: founderGems, entry: founderSpeed };
    if (kind === "gem_bomb") return { speed: null, gems: null, entry: gemBomb };
    return { speed: null, gems: null, entry: null };
  };

  const segmentRowKinds: RowKind[] = ["gems_base", "stonks_ev", "skill_shards_ev"];
  const isSegmentRow = (i: number): boolean => segmentRowKinds.includes(rowKinds[i]!);

  const maxValPos = Math.max(
    1,
    ...(skillShardsEnabled
      ? [sumEntry(breakdown.gems_base), sumEntry(breakdown.stonks_ev), sumEntry(breakdown.skill_shards_ev)]
      : [sumEntry(breakdown.gems_base), sumEntry(breakdown.stonks_ev)]),
    sumEntry(founderSpeed) + sumEntry(founderGems) + founderSupplyDropItemsGemValue + founderSupplyDropFrogspawnGemValue + founderSupplyDropButteryLobsterGemValue,
    sumEntry(gemBomb),
  );
  const extraMin = [
    hasLootbugGains ? lootbugGainsGross : null,
    hasLootbugCosts ? -lootbugTotalGemCostPerHour! : null,
    hasDroneFuel ? droneFuelGemsPerHour : null,
  ].filter((v): v is number => typeof v === "number");
  const gemBombLeftOverflow = (() => {
    const base = sumEntry(gemBomb);
    const x10 = gemBomb10xForChart;
    const chaos = chaosTotemImpact ?? 0;
    const overflow = base - x10 - chaos;
    return overflow < 0 ? overflow : 0;
  })();
  const allMins = [...extraMin, ...(gemBombLeftOverflow < 0 ? [gemBombLeftOverflow] : [])];
  const minVal = allMins.length > 0 ? Math.min(0, ...allMins) : 0;
  const maxVal =
    extraMin.length > 0 ? Math.max(maxValPos, ...valuesTop.filter((v) => v > 0), -minVal) : maxValPos;
  const range = maxVal - minVal;

  // Horizontal bar chart: categories on Y, values on X (bars left to right; origin at 0 when minVal < 0)
  // W / padR chosen so right-side value labels (barEndX + 8 + text) stay inside viewBox and are not clipped
  const W = 800;
  const nExtra = (hasLootbugGains ? 1 : 0) + (hasLootbugCosts ? 1 : 0) + (hasDroneFuel ? 1 : 0);
  const H = 320 + nExtra * 40;
  const padL = 140;
  const padR = 152;
  const padT = 20;
  const padB = 56;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const nRows = categories.length;
  const rowH = nRows > 0 ? plotH / nRows : 0;
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
    if (seg === "refresh_jackpot") return "url(#patRefreshJackpot)";
    return COLORS.gift;
  }

  const gemIconUrl = assetUrl("sprites/common/gem.png");

  const isGemBombRowByKind = (kind: RowKind) => kind === "gem_bomb";
  const isLootbugGainsRowByKind = (kind: RowKind) => kind === "lootbug_gains";
  const isLootbugCostsRowByKind = (kind: RowKind) => kind === "lootbug_costs";
  const isDroneFuelRowByKind = (kind: RowKind) => kind === "drone";
  const isFounderRowByKind = (kind: RowKind) => kind === "founder";

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
        <pattern id="patChargeMagnet" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
          <rect width="6" height="6" fill={CHARGE_MAGNET_BG} />
          <line x1="0" y1="0" x2="0" y2="6" stroke={CHARGE_MAGNET_HATCH} strokeWidth="1" />
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
        const kind = rowKinds[i]!;
        const y0 = padT + i * rowH + barPad;
        const isLootbugGainsRow = isLootbugGainsRowByKind(kind);
        const isLootbugCostsRow = isLootbugCostsRowByKind(kind);
        const isDroneFuelRow = isDroneFuelRowByKind(kind);
        const isGemBombRow = isGemBombRowByKind(kind);
        const isFounderRow = isFounderRowByKind(kind);
        const isLootbugOrDroneRow = isLootbugGainsRow || isLootbugCostsRow || isDroneFuelRow;
        const { speed, gems, entry } = isLootbugOrDroneRow ? { speed: null, gems: null, entry: null } : stackForIndex(i);

        const segs: Array<{ key: SegmentKey; v: number; x: number; w: number; left: number }> = [];
        let left = 0;
        let showGemBombSegments = false;
        if (!isLootbugOrDroneRow && entry) {
          if (isGemBombRow && (gemBomb10xForChart > 0 || typeof chaosTotemImpact === "number" && chaosTotemImpact > 0 || typeof chargeMagnetImpact === "number" && chargeMagnetImpact > 0)) {
            const totalBomb = sumEntry(entry);
            const basePart = Math.max(0, totalBomb - gemBomb10xForChart - (chaosTotemImpact ?? 0));
            showGemBombSegments = basePart > 0;
            segs.push({ key: "base", v: showGemBombSegments ? basePart : totalBomb, x: xOf(0), w: wOf(showGemBombSegments ? basePart : totalBomb), left: 0 });
            // 10× and Chaos drawn below only when split is valid; else full bar as blue
          } else if (isSegmentRow(i) && !showJackpotRefresh) {
            const giftVal = entry.gift ?? 0;
            const baseVal = entry.base + entry.jackpot + entry.refresh_base + entry.refresh_jackpot;
            segs.push({ key: "base", v: baseVal, x: xOf(0), w: wOf(baseVal), left: 0 });
            left = baseVal;
            if (giftVal > 0) {
              segs.push({ key: "gift", v: giftVal, x: xOf(left), w: wOf(giftVal), left });
              left += giftVal;
            }
          } else {
            const segmentKeys: Array<SegmentKey> = ["base", "jackpot", "refresh_base", "refresh_jackpot"];
            if ((entry.gift ?? 0) > 0) segmentKeys.push("gift");
            segmentKeys.forEach((k) => {
              const v = k === "gift" ? (entry.gift ?? 0) : entry[k];
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
        if (isFounderRow && speed && gems) {
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
        const founderItemsTotal = isFounderRow ? founderSupplyDropItemsGemValue : 0;
        const founderFrogspawnTotal = isFounderRow ? founderSupplyDropFrogspawnGemValue : 0;
        const founderLobsterTotal = isFounderRow ? founderSupplyDropButteryLobsterGemValue : 0;

        const totalBarLen = isLootbugGainsRow
          ? (typeof lootbugGainsGross === "number" ? lootbugGainsGross : 0)
          : isLootbugCostsRow
            ? (typeof lootbugTotalGemCostPerHour === "number" && lootbugTotalGemCostPerHour > 0 ? -lootbugTotalGemCostPerHour : 0)
            : isDroneFuelRow
              ? (typeof droneFuelGemsPerHour === "number" ? droneFuelGemsPerHour : 0)
              : isFounderRow
                  ? founderSpeedTotal + founderGemsTotal + founderItemsTotal + founderFrogspawnTotal + founderLobsterTotal
                  : isGemBombRow && entry != null
                    ? sumEntry(entry) + (chargeMagnetImpact ?? 0)
                    : entry != null
                      ? sumEntry(entry)
                      : 0;
        const barStartX = isLootbugGainsRow
          ? 0
          : isLootbugCostsRow
            ? (typeof lootbugTotalGemCostPerHour === "number" && lootbugTotalGemCostPerHour > 0 ? -lootbugTotalGemCostPerHour : 0)
            : isDroneFuelRow
              ? (typeof droneFuelGemsPerHour === "number" ? Math.min(0, droneFuelGemsPerHour) : 0)
              : 0;
        const barLen =
          isLootbugGainsRow && typeof lootbugGainsGross === "number"
            ? lootbugGainsGross
            : isLootbugCostsRow && typeof lootbugTotalGemCostPerHour === "number" && lootbugTotalGemCostPerHour > 0
              ? lootbugTotalGemCostPerHour
              : isDroneFuelRow && typeof droneFuelGemsPerHour === "number"
                ? Math.abs(droneFuelGemsPerHour)
                : totalBarLen;
        const barEndX = xOf(
          isLootbugGainsRow && typeof lootbugGainsGross === "number"
            ? lootbugGainsGross
            : isLootbugCostsRow && typeof lootbugTotalGemCostPerHour === "number" && lootbugTotalGemCostPerHour > 0
              ? -lootbugTotalGemCostPerHour
              : isDroneFuelRow && typeof droneFuelGemsPerHour === "number"
                ? Math.max(0, droneFuelGemsPerHour)
                : totalBarLen,
        );
        const labelY = y0 + barH / 2 + 4;
        /** Value text: for Lootbug costs put it right of the bar (like Drone Fuel), not at barEndX which is the left end of the negative bar. */
        const valueTextX = isLootbugCostsRow && typeof lootbugTotalGemCostPerHour === "number" && lootbugTotalGemCostPerHour > 0 ? xOf(0) + 8 : barEndX + 8;

        return (
          <g key={i}>
            <rect
              x={isLootbugOrDroneRow ? xOf(barStartX) : xOf(0)}
              y={y0}
              width={wOf(barLen)}
              height={barH}
              fill="none"
              stroke="rgba(15,23,42,0.55)"
              strokeWidth={1}
              rx={2}
            />

            {isLootbugGainsRow && typeof lootbugGainsGross === "number" && lootbugGainsGross > 0 ? (() => {
              const basePart = Math.max(0, lootbugGainsGross - (lootbug10xGemEvPerHour ?? 0));
              return (
                <>
                  <rect
                    x={xOf(0)}
                    y={y0}
                    width={wOf(basePart)}
                    height={barH}
                    fill={COLORS.base}
                    stroke="rgba(15,23,42,0.45)"
                    strokeWidth={0.6}
                  />
                  {typeof lootbug10xGemEvPerHour === "number" && lootbug10xGemEvPerHour > 0 ? (() => {
                    const segX = xOf(basePart);
                    const segW = wOf(lootbug10xGemEvPerHour);
                    const barCenterX = segX + segW / 2;
                    const barCenterY = y0 + barH / 2;
                    const iconOnBar = segW >= SEGMENT_ICON_MIN_BAR;
                    const iconCenterX = iconOnBar ? barCenterX : barCenterX + SEGMENT_ICON_LINE_OFFSET;
                    const iconCenterY = iconOnBar ? barCenterY : barCenterY - SEGMENT_ICON_LINE_OFFSET;
                    const iconX = iconCenterX - SEGMENT_ICON_SIZE / 2;
                    const iconY = iconCenterY - SEGMENT_ICON_SIZE / 2;
                    return (
                      <>
                        <rect
                          x={segX}
                          y={y0}
                          width={segW}
                          height={barH}
                          fill="url(#pat10xBomb)"
                          stroke="rgba(15,23,42,0.45)"
                          strokeWidth={0.6}
                        />
                        {iconOnBar ? null : (
                          <line x1={barCenterX} y1={barCenterY} x2={iconCenterX} y2={iconCenterY} stroke="rgba(15,23,42,0.5)" strokeWidth={1} />
                        )}
                        <image
                          href={BOMB_RECHARGE_10X_ICON}
                          x={iconX}
                          y={iconY}
                          width={SEGMENT_ICON_SIZE}
                          height={SEGMENT_ICON_SIZE}
                          preserveAspectRatio="xMidYMid meet"
                          style={{ pointerEvents: "none" }}
                          aria-hidden
                        />
                      </>
                    );
                  })() : null}
                </>
              );
            })() : null}
            {isLootbugCostsRow && typeof lootbugTotalGemCostPerHour === "number" && lootbugTotalGemCostPerHour > 0 ? (
              <rect
                x={xOf(-lootbugTotalGemCostPerHour)}
                y={y0}
                width={wOf(lootbugTotalGemCostPerHour)}
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
            {segs.map((s) =>
              s.key === "gift" && s.v > 0
                ? (() => {
                    const barCenterX = s.x + s.w / 2;
                    const barCenterY = y0 + barH / 2;
                    const iconOnBar = s.w >= SEGMENT_ICON_MIN_BAR;
                    const iconCenterX = iconOnBar ? barCenterX : barCenterX + SEGMENT_ICON_LINE_OFFSET;
                    const iconCenterY = iconOnBar ? barCenterY : barCenterY - SEGMENT_ICON_LINE_OFFSET;
                    const iconX = iconCenterX - SEGMENT_ICON_SIZE / 2;
                    const iconY = iconCenterY - SEGMENT_ICON_SIZE / 2;
                    return (
                      <g key="gift-icon">
                        {iconOnBar ? null : (
                          <line x1={barCenterX} y1={barCenterY} x2={iconCenterX} y2={iconCenterY} stroke="rgba(15,23,42,0.5)" strokeWidth={1} />
                        )}
                        <image
                          href={GIFT_ICON}
                          x={iconX}
                          y={iconY}
                          width={SEGMENT_ICON_SIZE}
                          height={SEGMENT_ICON_SIZE}
                          preserveAspectRatio="xMidYMid meet"
                          style={{ pointerEvents: "none" }}
                          aria-hidden
                        />
                      </g>
                    );
                  })()
                : null,
            )}

            {isGemBombRow && entry && showGemBombSegments && gemBomb10xForChart > 0 ? (() => {
              const segX = xOf(sumEntry(entry) - gemBomb10xForChart - (chaosTotemImpact ?? 0));
              const segW = wOf(gemBomb10xForChart);
              const barCenterX = segX + segW / 2;
              const barCenterY = y0 + barH / 2;
              const iconOnBar = segW >= SEGMENT_ICON_MIN_BAR;
              const iconCenterX = iconOnBar ? barCenterX : barCenterX + SEGMENT_ICON_LINE_OFFSET;
              const iconCenterY = iconOnBar ? barCenterY : barCenterY - SEGMENT_ICON_LINE_OFFSET;
              const iconX = iconCenterX - SEGMENT_ICON_SIZE / 2;
              const iconY = iconCenterY - SEGMENT_ICON_SIZE / 2;
              return (
                <>
                  <rect
                    x={segX}
                    y={y0}
                    width={segW}
                    height={barH}
                    fill="url(#pat10xBomb)"
                    stroke="rgba(15,23,42,0.45)"
                    strokeWidth={0.6}
                  />
                  {iconOnBar ? null : (
                    <line x1={barCenterX} y1={barCenterY} x2={iconCenterX} y2={iconCenterY} stroke="rgba(15,23,42,0.5)" strokeWidth={1} />
                  )}
                  <image
                    href={BOMB_RECHARGE_10X_ICON}
                    x={iconX}
                    y={iconY}
                    width={SEGMENT_ICON_SIZE}
                    height={SEGMENT_ICON_SIZE}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ pointerEvents: "none" }}
                    aria-hidden
                  />
                </>
              );
            })() : null}
            {isGemBombRow && entry && showGemBombSegments && typeof chaosTotemImpact === "number" && chaosTotemImpact > 0 ? (() => {
              const segX = xOf(sumEntry(entry) - (chaosTotemImpact ?? 0));
              const segW = wOf(chaosTotemImpact);
              const barCenterX = segX + segW / 2;
              const barCenterY = y0 + barH / 2;
              const iconOnBar = segW >= SEGMENT_ICON_MIN_BAR;
              const iconCenterX = iconOnBar ? barCenterX : barCenterX + SEGMENT_ICON_LINE_OFFSET;
              const iconCenterY = iconOnBar ? barCenterY : barCenterY - SEGMENT_ICON_LINE_OFFSET;
              const iconX = iconCenterX - SEGMENT_ICON_SIZE / 2;
              const iconY = iconCenterY - SEGMENT_ICON_SIZE / 2;
              return (
                <>
                  <rect
                    x={segX}
                    y={y0}
                    width={segW}
                    height={barH}
                    fill="url(#patChaosTotem)"
                    stroke="rgba(15,23,42,0.45)"
                    strokeWidth={0.6}
                  />
                  {iconOnBar ? null : (
                    <line x1={barCenterX} y1={barCenterY} x2={iconCenterX} y2={iconCenterY} stroke="rgba(15,23,42,0.5)" strokeWidth={1} />
                  )}
                  <image
                    href={CHAOS_TOTEM_ICON}
                    x={iconX}
                    y={iconY}
                    width={SEGMENT_ICON_SIZE}
                    height={SEGMENT_ICON_SIZE}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ pointerEvents: "none" }}
                    aria-hidden
                  />
                </>
              );
            })() : null}
            {isGemBombRow && entry && showGemBombSegments && typeof chargeMagnetImpact === "number" && chargeMagnetImpact > 0 ? (() => {
              const segX = xOf(sumEntry(entry));
              const segW = wOf(chargeMagnetImpact);
              const barCenterX = segX + segW / 2;
              const barCenterY = y0 + barH / 2;
              const iconOnBar = segW >= SEGMENT_ICON_MIN_BAR;
              const iconCenterX = iconOnBar ? barCenterX : barCenterX + SEGMENT_ICON_LINE_OFFSET;
              const iconCenterY = iconOnBar ? barCenterY : barCenterY - SEGMENT_ICON_LINE_OFFSET;
              const iconX = iconCenterX - SEGMENT_ICON_SIZE / 2;
              const iconY = iconCenterY - SEGMENT_ICON_SIZE / 2;
              return (
                <>
                  <rect
                    x={segX}
                    y={y0}
                    width={segW}
                    height={barH}
                    fill="url(#patChargeMagnet)"
                    stroke="rgba(15,23,42,0.45)"
                    strokeWidth={0.6}
                  />
                  {iconOnBar ? null : (
                    <line x1={barCenterX} y1={barCenterY} x2={iconCenterX} y2={iconCenterY} stroke="rgba(15,23,42,0.5)" strokeWidth={1} />
                  )}
                  <image
                    href={CHARGE_MAGNET_ICON}
                    x={iconX}
                    y={iconY}
                    width={SEGMENT_ICON_SIZE}
                    height={SEGMENT_ICON_SIZE}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ pointerEvents: "none" }}
                    aria-hidden
                  />
                </>
              );
            })() : null}

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
            {isFounderRow && founderItemsTotal > 0 ? (() => {
              const segX = xOf(founderSpeedTotal + founderGemsTotal);
              const segW = wOf(founderItemsTotal);
              const barCenterX = segX + segW / 2;
              const barCenterY = y0 + barH / 2;
              const iconOnBar = segW >= SEGMENT_ICON_MIN_BAR;
              const iconCenterX = iconOnBar ? barCenterX : barCenterX + SEGMENT_ICON_LINE_OFFSET;
              const iconCenterY = iconOnBar ? barCenterY : barCenterY - SEGMENT_ICON_LINE_OFFSET;
              const iconX = iconCenterX - SEGMENT_ICON_SIZE / 2;
              const iconY = iconCenterY - SEGMENT_ICON_SIZE / 2;
              return (
                <>
                  <rect
                    x={segX}
                    y={y0}
                    width={segW}
                    height={barH}
                    fill="url(#patChargeMagnet)"
                    stroke="rgba(15,23,42,0.45)"
                    strokeWidth={0.6}
                  />
                  {iconOnBar ? null : (
                    <line x1={barCenterX} y1={barCenterY} x2={iconCenterX} y2={iconCenterY} stroke="rgba(15,23,42,0.5)" strokeWidth={1} />
                  )}
                  <image
                    href={CHARGE_MAGNET_ICON}
                    x={iconX}
                    y={iconY}
                    width={SEGMENT_ICON_SIZE}
                    height={SEGMENT_ICON_SIZE}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ pointerEvents: "none" }}
                    aria-hidden
                  />
                </>
              );
            })() : null}
            {isFounderRow && founderFrogspawnTotal > 0 ? (
              <rect
                x={xOf(founderSpeedTotal + founderGemsTotal + founderItemsTotal)}
                y={y0}
                width={wOf(founderFrogspawnTotal)}
                height={barH}
                fill="#2e7d32"
                stroke="rgba(15,23,42,0.45)"
                strokeWidth={0.6}
                aria-hidden
              />
            ) : null}
            {isFounderRow && founderLobsterTotal > 0 ? (
              <rect
                x={xOf(founderSpeedTotal + founderGemsTotal + founderItemsTotal + founderFrogspawnTotal)}
                y={y0}
                width={wOf(founderLobsterTotal)}
                height={barH}
                fill="#ef6c00"
                stroke="rgba(15,23,42,0.45)"
                strokeWidth={0.6}
                aria-hidden
              />
            ) : null}

            {isFounderRow && founderSpeedTotal > 0 && wOf(founderSpeedTotal) >= 40 ? (
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
            <text x={valueTextX} y={labelY} textAnchor="start" fontSize={10} fontWeight={800} fill="rgba(71,85,105,0.9)" fontFamily="var(--mono)">
              {fmt1(valuesTop[i] ?? 0)} ({fmt1(pcts[i] ?? 0)}%)
            </text>
          </g>
        );
      })}
      </svg>
    </>
  );
}

