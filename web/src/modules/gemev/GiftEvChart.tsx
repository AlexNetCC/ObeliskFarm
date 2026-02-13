/** Gift EV breakdown as horizontal bar chart, sorted by Gem EV (descending). */
import { assetUrl } from "../../lib/assets";
import { Tooltip } from "../../components/Tooltip";

const WIKI = "https://static.wikitide.net/shminerwiki";

const GIFT_BREAKDOWN_GEM_ENTRIES = [
  { key: "gems_20_40" as const, label: "Basic Gems Roll Type 1", color: "#2E86AB", qtyUnit: "gems", icon: assetUrl("sprites/common/gem.png") },
  { key: "gems_30_65" as const, label: "Basic Gems Roll Type 2", color: "#2E86AB", qtyUnit: "gems", icon: assetUrl("sprites/common/gem.png") },
  { key: "skill_shards" as const, label: "Skill Shards", color: "#5C6BC0", qtyUnit: "shards", icon: assetUrl("sprites/common/skill_shard.png") },
  { key: "item_chests" as const, label: "Item Chests", color: "#78909C", qtyUnit: "chests", icon: `${WIKI}/a/a8/Item_Chest.png` },
  { key: "chaos_totem" as const, label: "Chaos Totem", color: "#7B1FA2", qtyUnit: "totems", icon: `${WIKI}/a/a6/Chaos_Totem.png` },
  { key: "charge_magnet" as const, label: "Charge Magnet", color: "#00897B", qtyUnit: "magnets", icon: `${WIKI}/f/fc/Charge_Magnet.png` },
  { key: "fishing_tick" as const, label: "5× Fishing Tick Chance", color: "#0288D1", qtyUnit: "min", icon: `${WIKI}/8/87/Triple_Fish_Tick_Chance.png` },
  { key: "rare_gems" as const, label: "Rare Roll Gems", color: "#A23B72", qtyUnit: "gems", icon: assetUrl("sprites/common/gem.png") },
  { key: "drone_fuel" as const, label: "Drone Fuel", color: "#00838F", qtyUnit: "fuel", icon: `${WIKI}/4/44/Fuel.png` },
  { key: "skin" as const, label: "Skin or Gems", color: "#6A1B9A", qtyUnit: "gems", icon: undefined, showTooltip: true },
  { key: "recursive_gifts" as const, label: "Recursive Gifts", color: "rgba(232,168,56,0.65)", qtyUnit: "gifts", icon: `${WIKI}/2/24/Gift.png` },
] as const;

type GiftBreakdown = Record<string, number>;

function fmt1(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(1);
}

function fmtInt(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return Math.round(x).toString();
}

/** Integer tick values for axis, scaled to max (e.g. max 198 → [0, 50, 100, 150, 198]). */
function axisTicks(max: number): number[] {
  if (max <= 0 || !Number.isFinite(max)) return [0, 1];
  const step = Math.ceil(max / 4 / 10) * 10 || 1;
  const ticks: number[] = [0];
  for (let v = step; v < max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== max) ticks.push(Math.round(max));
  return ticks;
}

function pct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return (part / total) * 100.0;
}

function GiftRewardMultipliersTable(props: { obeliskMult: number; luckyMult: number; obeliskLevel: number }) {
  const { obeliskMult, luckyMult, obeliskLevel } = props;
  const combined = obeliskMult * luckyMult;

  return (
    <div
      style={{
        padding: "8px 12px",
        background: "rgba(248,250,252,0.95)",
        border: "1px solid rgba(15,23,42,0.10)",
        borderBottom: "none",
        borderRadius: "8px 8px 0 0",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(71,85,105,0.9)", marginBottom: 6 }}>
        Gift Reward Multipliers
      </div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
          <tbody>
            <tr>
              <td className="mono" style={{ padding: "2px 0", color: "rgba(71,85,105,0.95)" }}>
                Obelisk Level Multiplier: 1 + {obeliskLevel} × 0.08 = <strong>{fmt1(obeliskMult)}×</strong>
              </td>
            </tr>
            <tr>
              <td className="mono" style={{ padding: "2px 0", color: "rgba(71,85,105,0.95)" }}>
                Lucky (3× / 50× rolls): <strong>{fmt1(luckyMult)}×</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            paddingLeft: 8,
          }}
        >
          <span
            style={{
              fontSize: 22,
              lineHeight: 1,
              color: "rgba(71,85,105,0.4)",
              fontFamily: "serif",
            }}
          >
            {"}"}
          </span>
          <span className="mono giftMultiplierRainbow" style={{ fontSize: 17, fontWeight: 800 }}>
            {fmt1(combined)}×
          </span>
        </div>
      </div>
    </div>
  );
}

const SUSHI_ICON = `${WIKI}/6/6d/Sushi.png`;

export function GiftEvChart(props: { breakdown: GiftBreakdown }) {
  const { breakdown } = props;
  const total = breakdown.total ?? 0;
  const sushiFish = Number(breakdown.sushi_fish ?? 0);
  const qty = (breakdown as GiftBreakdown & { _qty?: Record<string, number> })._qty ?? {};
  const sushiQty = Number(qty.sushi_fish ?? 0);
  const rows = GIFT_BREAKDOWN_GEM_ENTRIES.map((e) => ({
    ...e,
    value: Number(breakdown[e.key] ?? 0),
    qtyVal: Number(qty[e.key] ?? 0),
  }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  const maxVal = Math.max(1, ...rows.map((r) => r.value));
  const ticks = axisTicks(maxVal);
  const W = 900;
  const iconColW = 24;
  const labelPad = 8;
  const padL = 185 + iconColW;
  const padR = 260;
  const padT = 16;
  const padB = 36;
  const plotW = W - padL - padR;
  const rowH = 28;
  const barH = 18;
  const barPad = (rowH - barH) / 2;
  const nRows = Math.max(rows.length, 1);
  const plotH = nRows * rowH;
  const H = padT + plotH + padB;
  const scaleX = maxVal > 0 ? plotW / maxVal : plotW;

  const gemIconUrl = assetUrl("sprites/common/gem.png");
  const mult = (breakdown as GiftBreakdown & { _multipliers?: { obeliskMult: number; luckyMult: number; obeliskLevel: number } })._multipliers;

  const skinRowIdx = rows.findIndex((r) => r.key === "skin");
  const tooltipX = labelPad + 4 + 18;

  return (
    <div style={{ position: "relative", width: "100%", minWidth: 0, overflowX: "auto" }}>
    {mult ? (
      <GiftRewardMultipliersTable
        obeliskMult={mult.obeliskMult}
        luckyMult={mult.luckyMult}
        obeliskLevel={mult.obeliskLevel}
      />
    ) : null}
    <div style={{ position: "relative", display: "inline-block", minWidth: W }}>
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
      aria-label="Gift EV breakdown bar chart"
    >
      {/* Grid lines */}
      {ticks.map((v) => {
        const x = padL + (v / maxVal) * plotW;
        return (
          <g key={v}>
            <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="rgba(15,23,42,0.08)" strokeDasharray="4 4" />
            <text x={x} y={padT + plotH + 14} textAnchor="middle" fontSize={13} fill="rgba(71,85,105,0.9)" fontFamily="var(--mono)">
              {fmtInt(v)}
            </text>
          </g>
        );
      })}
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(15,23,42,0.22)" />
      <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(15,23,42,0.22)" />

      {/* X-axis label */}
      <g aria-hidden="true">
        <image href={gemIconUrl} x={W / 2 - 18} y={H - 14} width={16} height={16} />
        <text x={W / 2 - 2} y={H - 2} textAnchor="start" fontSize={13} fontWeight={800} fill="rgba(71,85,105,0.9)" fontFamily="var(--mono)">
          per Gift
        </text>
      </g>

      {rows.length === 0 && sushiFish <= 0 ? (
        <text x={padL + plotW / 2} y={padT + plotH / 2} textAnchor="middle" fontSize={15} fill="rgba(71,85,105,0.6)">
          No contributions
        </text>
      ) : (
        rows.map((row, i) => {
          const y0 = padT + i * rowH + barPad;
          const barW = Math.max(0, row.value * scaleX);
          const barEndX = padL + barW;
          const pctVal = pct(row.value, total);
          const labelY = y0 + barH / 2 + 4;

          const iconX = labelPad + 4;
          const labelX = padL - 8;
          const hasTooltip = "showTooltip" in row && row.showTooltip;

          return (
            <g key={row.key}>
              <rect
                x={padL}
                y={y0}
                width={barW}
                height={barH}
                fill={row.color}
                stroke="rgba(15,23,42,0.35)"
                strokeWidth={0.8}
                rx={2}
              />
              {row.icon ? (
                <image href={row.icon} x={iconX} y={y0} width={16} height={16} />
              ) : null}
              {hasTooltip ? (
                <text x={tooltipX + 10} y={labelY} textAnchor="middle" fontSize={13} fontWeight={700} fill="rgba(71,85,105,0.8)">
                  ?
                </text>
              ) : null}
              <text x={labelX} y={labelY} textAnchor="end" fontSize={14} fontWeight={700} fill="rgba(15,23,42,0.85)">
                {row.label}
              </text>
              <text
                x={barEndX + 12}
                y={labelY}
                textAnchor="start"
                fontSize={14}
                fontWeight={800}
                fill="rgba(71,85,105,0.9)"
                fontFamily="var(--mono)"
              >
                {fmt1(row.qtyVal)} {row.qtyUnit} · {fmt1(row.value)} Gems ({fmtInt(pctVal)}%)
              </text>
            </g>
          );
        })
      )}
    </svg>
    {skinRowIdx >= 0 ? (
      <div
        style={{
          position: "absolute",
          left: `${(tooltipX / W) * 100}%`,
          top: `${((padT + skinRowIdx * rowH + barPad - 2) / H) * 100}%`,
          width: `${(20 / W) * 100}%`,
          height: `${(20 / H) * 100}%`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "auto",
        }}
      >
        <Tooltip
          content={{
            title: "Skin (Gifts)",
            lines: [
              "This row is included in the total when you already own all skins obtainable from Gifts.",
              "If you still need skins, the actual value is higher for you.",
            ],
          }}
        />
      </div>
    ) : null}
    </div>

    {(sushiFish > 0 || sushiQty > 0) ? (
      <div
        style={{
          position: "absolute",
          top: "50%",
          right: 8,
          transform: "translateY(-50%)",
          width: 200,
          padding: "8px 10px",
          background: "rgba(255,255,255,0.98)",
          border: "1px solid rgba(15,23,42,0.12)",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
        aria-label="Sushi fish EV sub-chart"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <img src={SUSHI_ICON} alt="" width={16} height={16} style={{ display: "block" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(71,85,105,0.9)" }}>Sushi</span>
        </div>
        <span className="mono" style={{ fontSize: 14, fontWeight: 800, color: "rgba(71,85,105,0.9)" }}>
          {fmt1(sushiQty)} sushi/Gift · {fmt1(sushiFish)} fish
        </span>
      </div>
    ) : null}
    </div>
  );
}
