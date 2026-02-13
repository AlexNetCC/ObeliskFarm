/** Gift EV breakdown as horizontal bar chart, sorted by Gem EV (descending). */
import { assetUrl } from "../../lib/assets";

const GIFT_BREAKDOWN_GEM_ENTRIES = [
  { key: "gems_20_40" as const, label: "Gems (20-40)", color: "#2E86AB", qtyUnit: "gems" },
  { key: "gems_30_65" as const, label: "Gems (30-65)", color: "#2E86AB", qtyUnit: "gems" },
  { key: "skill_shards" as const, label: "Skill Shards", color: "#5C6BC0", qtyUnit: "shards" },
  { key: "item_chests" as const, label: "Item Chests", color: "#78909C", qtyUnit: "chests" },
  { key: "chaos_totem" as const, label: "Chaos Totem", color: "#7B1FA2", qtyUnit: "totems" },
  { key: "charge_magnet" as const, label: "Charge Magnet", color: "#00897B", qtyUnit: "magnets" },
  { key: "fishing_tick" as const, label: "5× Fishing Tick Chance", color: "#0288D1", qtyUnit: "min" },
  { key: "rare_gems" as const, label: "Rare Roll Gems", color: "#A23B72", qtyUnit: "gems" },
  { key: "drone_fuel" as const, label: "Drone Fuel", color: "#00838F", qtyUnit: "fuel" },
  { key: "skin" as const, label: "Skin (80-130 Gems)", color: "#6A1B9A", qtyUnit: "gems" },
  { key: "recursive_gifts" as const, label: "Recursive Gifts", color: "rgba(232,168,56,0.65)", qtyUnit: "gifts" },
] as const;

type GiftBreakdown = Record<string, number>;

function fmt1(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(1);
}

function pct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return (part / total) * 100.0;
}

const SUSHI_FISH_COLOR = "#FF6F00";

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
  const W = 700;
  const padL = 160;
  const padR = 90;
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

  return (
    <div style={{ position: "relative", width: "100%" }}>
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
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const v = f * maxVal;
        const x = padL + v * scaleX;
        return (
          <g key={f}>
            <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="rgba(15,23,42,0.08)" strokeDasharray="4 4" />
            <text x={x} y={padT + plotH + 14} textAnchor="middle" fontSize={10} fill="rgba(71,85,105,0.9)" fontFamily="var(--mono)">
              {fmt1(v)}
            </text>
          </g>
        );
      })}
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(15,23,42,0.22)" />
      <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(15,23,42,0.22)" />

      {/* X-axis label */}
      <g aria-hidden="true">
        <image href={gemIconUrl} x={W / 2 - 18} y={H - 14} width={16} height={16} />
        <text x={W / 2 - 2} y={H - 2} textAnchor="start" fontSize={10} fontWeight={800} fill="rgba(71,85,105,0.9)" fontFamily="var(--mono)">
          per Gift
        </text>
      </g>

      {rows.length === 0 && sushiFish <= 0 ? (
        <text x={padL + plotW / 2} y={padT + plotH / 2} textAnchor="middle" fontSize={12} fill="rgba(71,85,105,0.6)">
          No contributions
        </text>
      ) : (
        rows.map((row, i) => {
          const y0 = padT + i * rowH + barPad;
          const barW = Math.max(0, row.value * scaleX);
          const barEndX = padL + barW;
          const pctVal = pct(row.value, total);
          const labelY = y0 + barH / 2 + 4;

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
              <text x={padL - 8} y={labelY} textAnchor="end" fontSize={11} fontWeight={700} fill="rgba(15,23,42,0.85)">
                {row.label}
              </text>
              <text
                x={barEndX + 8}
                y={labelY}
                textAnchor="start"
                fontSize={10}
                fontWeight={800}
                fill="rgba(71,85,105,0.9)"
                fontFamily="var(--mono)"
              >
                {fmt1(row.qtyVal)} {row.qtyUnit}/Gift · {fmt1(row.value)} Gems ({fmt1(pctVal)}%)
              </text>
            </g>
          );
        })
      )}
    </svg>

    {(sushiFish > 0 || sushiQty > 0) ? (
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          width: 200,
          padding: "8px 10px",
          background: "rgba(255,255,255,0.98)",
          border: "1px solid rgba(15,23,42,0.12)",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
        aria-label="Sushi fish EV sub-chart"
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(71,85,105,0.9)", marginBottom: 6 }}>
          Sushi
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              flex: 1,
              height: 20,
              background: "rgba(255,111,0,0.2)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: SUSHI_FISH_COLOR,
                borderRadius: 4,
              }}
            />
          </div>
          <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: "rgba(71,85,105,0.9)", minWidth: 80 }}>
            {fmt1(sushiQty)} sushi/Gift · {fmt1(sushiFish)} fish
          </span>
        </div>
      </div>
    ) : null}
    </div>
  );
}
