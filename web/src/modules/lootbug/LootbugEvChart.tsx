/** Lootbug EV breakdown: gains and costs per spawn (1 activation), similar to Gift EV Chart. */

export type LootbugEvChartRow = {
  key: string;
  label: string;
  value: number;
  icon?: string;
};

export type LootbugEvBreakdown = {
  gains: LootbugEvChartRow[];
  costs: LootbugEvChartRow[];
  totalGains: number;
  totalCosts: number;
  net: number;
  spawnsPerHour: number;
  expectedClaimsPerSpawn: number;
};

function fmt1(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(1);
}

function pct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return (Math.abs(part) / total) * 100.0;
}

const GAIN_COLOR = "#2E86AB";
const COST_COLOR = "rgba(180, 80, 70, 0.9)";
const NET_POSITIVE = "rgba(60, 120, 80, 0.9)";
const NET_NEGATIVE = "rgba(180, 70, 60, 0.9)";

function ChartSection(props: {
  title: string;
  rows: LootbugEvChartRow[];
  total: number;
  totalForPct: number;
  barColor: string;
  valueSign: "+" | "-";
  padL: number;
  padR: number;
  padT: number;
  plotW: number;
  rowH: number;
  barH: number;
  scaleX: number;
  W: number;
  iconX: number;
  labelPad: number;
  textFill: string;
  labelFill: string;
  barStroke: string;
}) {
  const { title, rows, total, totalForPct, barColor, valueSign, padL, padR, padT, plotW, rowH, barH, scaleX, W, iconX, labelPad, textFill, labelFill, barStroke } = props;
  const nRows = Math.max(rows.length, 1);
  const plotH = nRows * rowH;
  const barPad = (rowH - barH) / 2;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: labelFill, marginBottom: 4 }}>{title}</div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${padT + plotH + 8}`}
        style={{ display: "block", background: "rgba(248,250,252,0.6)", borderRadius: 8, border: "1px solid rgba(15,23,42,0.10)" }}
        role="img"
        aria-label={`${title} bar chart`}
      >
        {rows.length === 0 ? (
          <text x={padL + plotW / 2} y={padT + plotH / 2} textAnchor="middle" fontSize={12} fill={textFill}>No data</text>
        ) : (
          rows.map((row, i) => {
            const y0 = padT + i * rowH + barPad;
            const barW = Math.max(0, row.value * scaleX);
            const barEndX = padL + barW;
            const pctVal = totalForPct > 0 ? pct(row.value, totalForPct) : 0;
            const labelY = y0 + barH / 2 + 4;
            const valueText = valueSign === "+" ? `+${fmt1(row.value)}` : `−${fmt1(row.value)}`;
            return (
              <g key={row.key}>
                <rect x={padL} y={y0} width={barW} height={barH} fill={barColor} stroke={barStroke} strokeWidth={0.8} rx={2} />
                <text x={labelPad + 4} y={labelY} textAnchor="start" fontSize={12} fontWeight={700} fill={labelFill}>{row.label}</text>
                {row.icon ? <image href={row.icon} x={iconX} y={y0} width={14} height={14} /> : null}
                <text x={barEndX + 10} y={labelY} textAnchor="start" fontSize={12} fontWeight={800} fill={textFill} fontFamily="var(--mono)">
                  {valueText} Gems ({pctVal.toFixed(1)}%)
                </text>
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}

export function LootbugEvChart(props: { breakdown: LootbugEvBreakdown }) {
  const { breakdown } = props;
  const { gains, costs, totalGains, totalCosts, net, spawnsPerHour, expectedClaimsPerSpawn } = breakdown;

  const allValues = [...gains.map((r) => r.value), ...costs.map((r) => Math.abs(r.value)), Math.abs(net)];
  const maxVal = Math.max(1, ...allValues);
  const W = 720;
  const padL = 200;
  const padR = 180;
  const padT = 20;
  const rowH = 26;
  const barH = 16;
  const plotW = W - padL - padR;
  const scaleX = maxVal > 0 ? plotW / maxVal : plotW;
  const iconX = padL - 8 - 14 - 4;
  const labelPad = 8;
  const textFill = "rgba(71,85,105,0.9)";
  const labelFill = "rgba(15,23,42,0.85)";
  const barStroke = "rgba(15,23,42,0.35)";
  const totalForPct = totalGains + totalCosts;

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ fontSize: 12, color: "rgba(71,85,105,0.75)", marginBottom: 6 }}>
        Per spawn ({fmt1(expectedClaimsPerSpawn)} claims expected). Spawns/h: {fmt1(spawnsPerHour)}.
      </div>
      <div style={{ fontSize: 11, color: "rgba(71,85,105,0.7)", marginBottom: 8 }}>
        Included: triple chance (1 or 3 claims per spawn), golden chance, gem cost reduction, loot multiplier. Spawn rate does not change per-spawn values.
        Gains are value before cost (cost to Buy each buff is listed in Costs below). 10× is Lootbug’s share of total 10× Bomb Recharge gem EV.
      </div>
      <ChartSection
        title="Gains (per spawn)"
        rows={gains}
        total={totalGains}
        totalForPct={totalForPct}
        barColor={GAIN_COLOR}
        valueSign="+"
        padL={padL}
        padR={padR}
        padT={padT}
        plotW={plotW}
        rowH={rowH}
        barH={barH}
        scaleX={scaleX}
        W={W}
        iconX={iconX}
        labelPad={labelPad}
        textFill={textFill}
        labelFill={labelFill}
        barStroke={barStroke}
      />
      <ChartSection
        title="Costs (per spawn, when you Buy gem buffs)"
        rows={costs}
        total={totalCosts}
        totalForPct={totalForPct}
        barColor={COST_COLOR}
        valueSign="-"
        padL={padL}
        padR={padR}
        padT={padT}
        plotW={plotW}
        rowH={rowH}
        barH={barH}
        scaleX={scaleX}
        W={W}
        iconX={iconX}
        labelPad={labelPad}
        textFill={textFill}
        labelFill={labelFill}
        barStroke={barStroke}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 10px",
          background: net >= 0 ? "rgba(60,120,80,0.12)" : "rgba(180,70,60,0.1)",
          border: `1px solid ${net >= 0 ? "rgba(60,120,80,0.35)" : "rgba(180,70,60,0.3)"}`,
          borderRadius: 8,
          marginTop: 8,
        }}
      >
        <span style={{ fontWeight: 800, color: labelFill }}>Net per spawn</span>
        <span className="mono" style={{ fontWeight: 800, fontSize: 14, color: net >= 0 ? NET_POSITIVE : NET_NEGATIVE }}>
          {net >= 0 ? "+" : ""}{fmt1(net)} Gems
        </span>
      </div>
    </div>
  );
}
