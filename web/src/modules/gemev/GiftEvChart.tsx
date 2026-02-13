/** Gift EV breakdown as horizontal bar chart, sorted by Gem EV (descending). */
import type { ReactNode } from "react";
import { assetUrl } from "../../lib/assets";
import { Tooltip } from "../../components/Tooltip";

const WIKI = "https://static.wikitide.net/shminerwiki";

const SUSHI_ICON = `${WIKI}/6/6d/Sushi.png`;

const BASIC_ENTRIES = [
  { key: "gems_20_40" as const, label: "Basic Gems Roll Type 1", color: "#2E86AB", qtyUnit: "gems", icon: assetUrl("sprites/common/gem.png") },
  { key: "gems_30_65" as const, label: "Basic Gems Roll Type 2", color: "#2E86AB", qtyUnit: "gems", icon: assetUrl("sprites/common/gem.png") },
  { key: "skill_shards" as const, label: "Skill Shards", color: "#5C6BC0", qtyUnit: "shards", icon: assetUrl("sprites/common/skill_shard.png") },
  { key: "item_chests" as const, label: "Item Chests", color: "#78909C", qtyUnit: "chests", icon: `${WIKI}/a/a8/Item_Chest.png` },
  { key: "chaos_totem" as const, label: "Chaos Totem", color: "#7B1FA2", qtyUnit: "totems", icon: `${WIKI}/a/a6/Chaos_Totem.png` },
  { key: "charge_magnet" as const, label: "Charge Magnet", color: "#00897B", qtyUnit: "magnets", icon: `${WIKI}/f/fc/Charge_Magnet.png` },
  { key: "fishing_tick" as const, label: "5× Fishing Tick Chance", color: "#0288D1", qtyUnit: "min", icon: `${WIKI}/8/87/Triple_Fish_Tick_Chance.png` },
] as const;

const RARE_ENTRIES = [
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

function buildRows(
  entries: readonly { key: string; label: string; color: string; qtyUnit: string; icon?: string; showTooltip?: boolean }[],
  breakdown: GiftBreakdown
): { key: string; label: string; color: string; qtyUnit: string; icon?: string; showTooltip?: boolean; value: number; qtyVal: number }[] {
  const qty = (breakdown as GiftBreakdown & { _qty?: Record<string, number> })._qty ?? {};
  return entries
    .map((e) => ({
      ...e,
      value: Number(breakdown[e.key] ?? 0),
      qtyVal: Number(qty[e.key] ?? 0),
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
}

function GiftChartSvg(props: {
  title: string;
  rows: { key: string; label: string; color: string; qtyUnit: string; icon?: string; showTooltip?: boolean; value: number; qtyVal: number }[];
  total: number;
  maxVal: number;
  subchart?: ReactNode;
}) {
  const { title, rows, total, maxVal, subchart } = props;
  const W = 900;
  const iconColW = 24;
  const labelPad = 8;
  const padL = 185 + iconColW;
  const padR = 260;
  const padT = 28;
  const padB = 36;
  const plotW = W - padL - padR;
  const rowH = 28;
  const barH = 18;
  const barPad = (rowH - barH) / 2;
  const nRows = Math.max(rows.length, 1);
  const plotH = nRows * rowH;
  const H = padT + plotH + padB;
  const ticks = axisTicks(maxVal);
  const scaleX = maxVal > 0 ? plotW / maxVal : plotW;
  const gemIconUrl = assetUrl("sprites/common/gem.png");
  const tooltipX = labelPad + 4 + 18;

  return (
    <div style={{ marginTop: 8 }}>
      {title ? (
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(71,85,105,0.85)" }}>{title}</div>
          <div style={{ fontSize: 12, color: "rgba(71,85,105,0.65)", marginTop: 2 }}>Gift Reward Multipliers already applied!</div>
        </div>
      ) : null}
      <div style={{ position: "relative", display: "inline-block", minWidth: W }}>
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          style={{
            display: "block",
            background: "#ffffff",
            borderRadius: 8,
            border: "1px solid rgba(15,23,42,0.10)",
          }}
          role="img"
          aria-label={`${title} bar chart`}
        >
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

          <g aria-hidden="true">
            <image href={gemIconUrl} x={W / 2 - 18} y={H - 14} width={16} height={16} />
            <text x={W / 2 - 2} y={H - 2} textAnchor="start" fontSize={13} fontWeight={800} fill="rgba(71,85,105,0.9)" fontFamily="var(--mono)">
              per Gift
            </text>
          </g>

          {rows.length === 0 ? (
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
                  {row.icon ? <image href={row.icon} x={iconX} y={y0} width={16} height={16} /> : null}
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
        {rows.some((r) => r.key === "skin") ? (
          (() => {
            const skinRowIdx = rows.findIndex((r) => r.key === "skin");
            const y0 = padT + skinRowIdx * rowH + barPad;
            return (
              <div
                style={{
                  position: "absolute",
                  left: `${(tooltipX / W) * 100}%`,
                  top: `${((y0 - 2) / H) * 100}%`,
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
            );
          })()
        ) : null}
        {subchart ?? null}
      </div>
    </div>
  );
}

export function GiftEvChart(props: { breakdown: GiftBreakdown }) {
  const { breakdown } = props;
  const total = breakdown.total ?? 0;
  const basicRows = buildRows(BASIC_ENTRIES, breakdown);
  const rareRows = buildRows(RARE_ENTRIES, breakdown);
  const allValues = [...basicRows, ...rareRows].map((r) => r.value);
  const maxVal = Math.max(1, ...allValues);

  const mult = (breakdown as GiftBreakdown & { _multipliers?: { obeliskMult: number; luckyMult: number; obeliskLevel: number } })._multipliers;

  return (
    <div style={{ position: "relative", width: "100%", minWidth: 0, overflowX: "auto" }}>
      {mult ? (
        <GiftRewardMultipliersTable
          obeliskMult={mult.obeliskMult}
          luckyMult={mult.luckyMult}
          obeliskLevel={mult.obeliskLevel}
        />
      ) : null}
      <div style={{ padding: "8px 0", border: "1px solid rgba(15,23,42,0.10)", borderTop: "none", borderRadius: "0 0 10px 10px", background: "#ffffff" }}>
        <GiftChartSvg title="Basic Rewards" rows={basicRows} total={total} maxVal={maxVal} />
        {(Number(breakdown.sushi_fish ?? 0) > 0 || Number((breakdown as GiftBreakdown & { _qty?: Record<string, number> })._qty?.sushi_fish ?? 0) > 0) ? (
          <div style={{ marginTop: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(71,85,105,0.85)" }}>Sushi</div>
            <div style={{ fontSize: 12, color: "rgba(71,85,105,0.65)", marginTop: 2, marginBottom: 6 }}>Gift Reward Multipliers already applied!</div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                background: "rgba(248,250,252,0.95)",
                border: "1px solid rgba(15,23,42,0.10)",
                borderRadius: 8,
              }}
              aria-label="Sushi fish EV"
            >
              <img src={SUSHI_ICON} alt="" width={16} height={16} style={{ display: "block" }} />
              <span className="mono" style={{ fontSize: 14, fontWeight: 800, color: "rgba(71,85,105,0.9)" }}>
                {fmt1(Number((breakdown as GiftBreakdown & { _qty?: Record<string, number> })._qty?.sushi_fish ?? 0))} sushi/Gift · {fmt1(Number(breakdown.sushi_fish ?? 0))} fish
              </span>
            </div>
          </div>
        ) : null}
        <GiftChartSvg title="Rare Roll Rewards" rows={rareRows} total={total} maxVal={maxVal} />
      </div>
    </div>
  );
}
