/** Gift EV breakdown as horizontal bar chart, sorted by Gem EV (descending). */
import type { ReactNode } from "react";
import { assetUrl } from "../../lib/assets";
import { Tooltip } from "../../components/Tooltip";

const WIKI = "https://static.wikitide.net/shminerwiki";

const SUSHI_ICON = `${WIKI}/6/6d/Sushi.png`;
const FISH_TICK_ICON = `${WIKI}/8/8d/5x_Fish_Tick_Chance.png`;

/* Basic: yellow/amber shades (like Stats Contributions Stars). Rare: blue shades (like Super Stars). */
const BASIC_ENTRIES = [
  { key: "gems_20_40" as const, label: "Basic Gems Roll Type 1", color: "#fff59d", qtyUnit: "gems", icon: assetUrl("sprites/common/gem.png") },
  { key: "gems_30_65" as const, label: "Basic Gems Roll Type 2", color: "#ffeb3b", qtyUnit: "gems", icon: assetUrl("sprites/common/gem.png") },
  { key: "skill_shards" as const, label: "Skill Shards", color: "#ffc107", qtyUnit: "shards", icon: assetUrl("sprites/common/skill_shard.png") },
  { key: "item_chests" as const, label: "Item Chests", color: "#ffa726", qtyUnit: "chests", icon: `${WIKI}/a/a8/Item_Chest.png` },
  { key: "chaos_totem" as const, label: "Chaos Totem", color: "#f57f17", qtyUnit: "totems", icon: `${WIKI}/a/a6/Chaos_Totem.png` },
  { key: "charge_magnet" as const, label: "Charge Magnet", color: "#ff8f00", qtyUnit: "magnets", icon: `${WIKI}/f/fc/Charge_Magnet.png` },
  { key: "fishing_tick" as const, label: "5× Fishing Tick Chance", color: "#ffb74d", qtyUnit: "min", icon: `${WIKI}/8/8d/5x_Fish_Tick_Chance.png` },
] as const;

const RARE_ENTRIES = [
  { key: "rare_gems" as const, label: "Rare Roll Gems", color: "#2196f3", qtyUnit: "gems", icon: assetUrl("sprites/common/gem.png") },
  { key: "drone_fuel" as const, label: "Drone Fuel", color: "#42a5f5", qtyUnit: "fuel", icon: `${WIKI}/4/44/Fuel.png` },
  { key: "skin" as const, label: "Skin or Gems", color: "#90caf9", qtyUnit: "gems", icon: undefined, showTooltip: true },
  { key: "recursive_gifts" as const, label: "Recursive Gifts", color: "#1e88e5", qtyUnit: "gifts", icon: `${WIKI}/2/24/Gift.png` },
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

function GiftRewardMultipliersTable(props: { obeliskMult: number; luckyMult: number; obeliskLevel: number; darkTheme?: boolean }) {
  const { obeliskMult, luckyMult, obeliskLevel, darkTheme } = props;
  const combined = obeliskMult * luckyMult;
  const bg = darkTheme ? "rgba(0,0,0,0.2)" : "rgba(248,250,252,0.95)";
  const border = darkTheme ? "rgba(226,232,240,0.15)" : "rgba(15,23,42,0.10)";
  const textColor = darkTheme ? "rgba(226,232,240,0.95)" : "rgba(71,85,105,0.95)";
  const titleColor = darkTheme ? "rgba(226,232,240,0.95)" : "rgba(71,85,105,0.9)";
  const braceColor = darkTheme ? "rgba(226,232,240,0.5)" : "rgba(71,85,105,0.4)";

  return (
    <div
      style={{
        padding: "8px 12px",
        background: bg,
        border: `1px solid ${border}`,
        borderBottom: "none",
        borderRadius: "8px 8px 0 0",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: titleColor, marginBottom: 6 }}>
        Gift Reward Multipliers
      </div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
          <tbody>
            <tr>
              <td className="mono" style={{ padding: "2px 0", color: textColor }}>
                Obelisk Level Multiplier: 1 + {obeliskLevel} × 0.08 = <strong>{fmt1(obeliskMult)}×</strong>
              </td>
            </tr>
            <tr>
              <td className="mono" style={{ padding: "2px 0", color: textColor }}>
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
              color: braceColor,
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

type GiftChartRow = {
  key: string;
  label: string;
  color: string;
  qtyUnit: string;
  icon?: string;
  showTooltip?: boolean;
  value: number;
  qtyVal: number;
  qtyVal2?: number;
  qtyUnit2?: string;
};

function buildRows(
  entries: readonly { key: string; label: string; color: string; qtyUnit: string; icon?: string; showTooltip?: boolean }[],
  breakdown: GiftBreakdown
): GiftChartRow[] {
  const qty = (breakdown as GiftBreakdown & { _qty?: Record<string, number> })._qty ?? {};
  return entries
    .map((e): GiftChartRow => {
      const qtyVal2 = e.key === "fishing_tick" ? Number(qty.fishing_tick_fish ?? 0) : undefined;
      return {
        ...e,
        value: Number(breakdown[e.key] ?? 0),
        qtyVal: Number(qty[e.key] ?? 0),
        ...(qtyVal2 != null && qtyVal2 > 0 ? { qtyVal2, qtyUnit2: "fish" } : {}),
      };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
}

const CHART_DARK = {
  bg: "#2d3548",
  grid: "rgba(226, 232, 240, 0.12)",
  axis: "rgba(226, 232, 240, 0.5)",
  text: "rgba(226, 232, 240, 0.95)",
  textMuted: "rgba(226, 232, 240, 0.7)",
  barStroke: "rgba(255, 255, 255, 0.2)",
  border: "rgba(226, 232, 240, 0.15)",
};

function GiftChartSvg(props: {
  title: string;
  rows: GiftChartRow[];
  total: number;
  maxVal: number;
  subchart?: ReactNode;
  darkTheme?: boolean;
}) {
  const { title, rows, total, maxVal, subchart, darkTheme } = props;
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
  const iconX = padL - 8 - 16 - 4;
  const tooltipX = iconX + 8;
  const titleColor = darkTheme ? CHART_DARK.text : "rgba(71,85,105,0.85)";
  const subtitleColor = darkTheme ? CHART_DARK.textMuted : "rgba(71,85,105,0.65)";
  const svgBg = darkTheme ? CHART_DARK.bg : "#ffffff";
  const gridStroke = darkTheme ? CHART_DARK.grid : "rgba(15,23,42,0.08)";
  const axisStroke = darkTheme ? CHART_DARK.axis : "rgba(15,23,42,0.22)";
  const textFill = darkTheme ? CHART_DARK.text : "rgba(71,85,105,0.9)";
  const labelFill = darkTheme ? CHART_DARK.text : "rgba(15,23,42,0.85)";
  const barStroke = darkTheme ? CHART_DARK.barStroke : "rgba(15,23,42,0.35)";
  const svgBorder = darkTheme ? CHART_DARK.border : "rgba(15,23,42,0.10)";
  const noDataFill = darkTheme ? CHART_DARK.textMuted : "rgba(71,85,105,0.6)";

  return (
    <div style={{ marginTop: 8 }}>
      {title ? (
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: titleColor }}>{title}</div>
          <div style={{ fontSize: 12, color: subtitleColor, marginTop: 2 }}>Fish with your current Docks/Power setup</div>
        </div>
      ) : null}
      <div style={{ position: "relative", display: "inline-block", minWidth: W }}>
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          style={{
            display: "block",
            background: svgBg,
            borderRadius: 8,
            border: `1px solid ${svgBorder}`,
          }}
          role="img"
          aria-label={`${title} bar chart`}
        >
          {ticks.map((v) => {
            const x = padL + (v / maxVal) * plotW;
            return (
              <g key={v}>
                <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke={gridStroke} strokeDasharray="4 4" />
                <text x={x} y={padT + plotH + 14} textAnchor="middle" fontSize={13} fill={textFill} fontFamily="var(--mono)">
                  {fmtInt(v)}
                </text>
              </g>
            );
          })}
          <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={axisStroke} />
          <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke={axisStroke} />

          <g aria-hidden="true">
            <image href={gemIconUrl} x={W / 2 - 18} y={H - 14} width={16} height={16} />
            <text x={W / 2 - 2} y={H - 2} textAnchor="start" fontSize={13} fontWeight={800} fill={textFill} fontFamily="var(--mono)">
              per Gift
            </text>
          </g>

          {rows.length === 0 ? (
            <text x={padL + plotW / 2} y={padT + plotH / 2} textAnchor="middle" fontSize={15} fill={noDataFill}>
              No contributions
            </text>
          ) : (
            rows.map((row, i) => {
              const y0 = padT + i * rowH + barPad;
              const barW = Math.max(0, row.value * scaleX);
              const barEndX = padL + barW;
              const pctVal = pct(row.value, total);
              const labelY = y0 + barH / 2 + 4;
              const labelStartX = labelPad + 4;
              const hasTooltip = "showTooltip" in row && row.showTooltip;

              return (
                <g key={row.key}>
                  <rect
                    x={padL}
                    y={y0}
                    width={barW}
                    height={barH}
                    fill={row.color}
                    stroke={barStroke}
                    strokeWidth={0.8}
                    rx={2}
                  />
                  <text x={labelStartX} y={labelY} textAnchor="start" fontSize={14} fontWeight={700} fill={labelFill}>
                    {row.label}
                  </text>
                  {row.icon ? <image href={row.icon} x={iconX} y={y0} width={16} height={16} /> : null}
                  {hasTooltip ? (
                    <text x={iconX + 8} y={labelY} textAnchor="middle" fontSize={13} fontWeight={700} fill={textFill}>
                      ?
                    </text>
                  ) : null}
                  <text
                    x={barEndX + 12}
                    y={labelY}
                    textAnchor="start"
                    fontSize={14}
                    fontWeight={800}
                    fill={textFill}
                    fontFamily="var(--mono)"
                  >
                    {row.qtyVal2 != null && row.qtyVal2 > 0 && row.qtyUnit2
                      ? `${fmt1(row.qtyVal)} ${row.qtyUnit}, ${fmt1(row.qtyVal2)} ${row.qtyUnit2} · ${fmt1(row.value)} Gems (${fmtInt(pctVal)}%)`
                      : `${fmt1(row.qtyVal)} ${row.qtyUnit} · ${fmt1(row.value)} Gems (${fmtInt(pctVal)}%)`}
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

export function GiftEvChart(props: { breakdown: GiftBreakdown; darkTheme?: boolean }) {
  const { breakdown, darkTheme } = props;
  const total = breakdown.total ?? 0;
  const basicRows = buildRows(BASIC_ENTRIES, breakdown);
  const rareRows = buildRows(RARE_ENTRIES, breakdown);
  const allValues = [...basicRows, ...rareRows].map((r) => r.value);
  const maxVal = Math.max(1, ...allValues);

  const mult = (breakdown as GiftBreakdown & { _multipliers?: { obeliskMult: number; luckyMult: number; obeliskLevel: number } })._multipliers;
  const fishTextColor = darkTheme ? "rgba(226,232,240,0.9)" : "rgba(71,85,105,0.85)";
  const fishLabelColor = darkTheme ? "rgba(226,232,240,0.85)" : "rgba(71,85,105,0.8)";
  const fishValueColor = darkTheme ? "rgba(226,232,240,0.95)" : "rgba(71,85,105,0.9)";
  const fishBoxBg = darkTheme ? "rgba(0,0,0,0.2)" : "rgba(248,250,252,0.95)";
  const fishBoxBorder = darkTheme ? "rgba(226,232,240,0.15)" : "rgba(15,23,42,0.10)";

  return (
    <div style={{ position: "relative", width: "100%", minWidth: 0, overflowX: "auto" }}>
      {mult ? (
        <GiftRewardMultipliersTable
          obeliskMult={mult.obeliskMult}
          luckyMult={mult.luckyMult}
          obeliskLevel={mult.obeliskLevel}
          darkTheme={darkTheme}
        />
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
        <div className="gemEvGiftChartBlockBasic">
          <GiftChartSvg title="Basic Rewards" rows={basicRows} total={total} maxVal={maxVal} darkTheme={darkTheme} />
        </div>
        <div className="gemEvGiftChartBlockRare">
          <GiftChartSvg title="Rare Roll Rewards" rows={rareRows} total={total} maxVal={maxVal} darkTheme={darkTheme} />
        </div>
        {(() => {
          const qty = (breakdown as GiftBreakdown & { _qty?: Record<string, number> })._qty ?? {};
          const sushiFish = Number(breakdown.sushi_fish ?? 0);
          const fishingTickFish = Number(qty.fishing_tick_fish ?? 0);
          const hasSushi = sushiFish > 0 || Number(qty.sushi_fish ?? 0) > 0;
          const hasFishingTick = Number(qty.fishing_tick ?? 0) > 0 || fishingTickFish > 0;
          if (!hasSushi && !hasFishingTick) return null;
          return (
            <div className="gemEvGiftChartBlockFish">
              <div style={{ fontSize: 13, fontWeight: 700, color: fishTextColor, marginBottom: 6 }}>
                Fish gains with your current Docks/Power setup
              </div>
              {hasSushi ? (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: fishLabelColor, marginBottom: 4 }}>Sushi</div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      background: fishBoxBg,
                      border: `1px solid ${fishBoxBorder}`,
                      borderRadius: 8,
                    }}
                    aria-label="Sushi fish EV"
                  >
                    <img src={SUSHI_ICON} alt="" width={16} height={16} style={{ display: "block" }} />
                    <span className="mono" style={{ fontSize: 14, fontWeight: 800, color: fishValueColor }}>
                      {fmt1(Number(qty.sushi_fish ?? 0))} Sushi/Gift · {fmt1(sushiFish)} fish
                    </span>
                  </div>
                </div>
              ) : null}
              {hasFishingTick ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: fishLabelColor, marginBottom: 4 }}>5× Fishing Tick Chance</div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      background: fishBoxBg,
                      border: `1px solid ${fishBoxBorder}`,
                      borderRadius: 8,
                    }}
                    aria-label="5× tick buff min and fish per gift"
                  >
                    <img src={FISH_TICK_ICON} alt="" width={16} height={16} style={{ display: "block" }} />
                    <span className="mono" style={{ fontSize: 14, fontWeight: 800, color: fishValueColor }}>
                      {fmt1(Number(qty.fishing_tick ?? 0))} min/Gift{fishingTickFish > 0 ? ` · ${fmt1(fishingTickFish)} fish` : ""}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
