import { useEffect, useMemo, useRef, useState } from "react";
import "../gemev/gemev.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
import { loadJson, saveJson } from "../../lib/storage";
import {
  defaultGameParameters,
  getFreebieEvPerClaim,
  getFounderGemsPerSingleEvent,
  getGameSpeedBonus,
  getGemBombGemChanceT12Bonus,
  getGameSpeedMultiplier,
  type GameParameters,
} from "../../lib/gemev/freebieEv";
import { assetUrl } from "../../lib/assets";

const STORAGE_KEY = "obeliskfarm:web:overnight_save.json:v1";
const GEMEV_STORAGE_KEY = "obeliskfarm:web:gemev_save.json:v1";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";
const BOMBS_STORAGE_KEY = "obeliskfarm:web:bombs_save.json:v1";
const AUTO_BOMBER_INTERVAL_GAME_SEC = 1.25;

const GEM_ICON = "sprites/common/gem.png";
const CHERRY_BOMB_ICON = "sprites/event/cherrybomb.png";
const CHAOS_TOTEM_ICON = "https://static.wikitide.net/shminerwiki/a/a6/Chaos_Totem.png";
const LOOTBUG_ICON = "https://static.wikitide.net/shminerwiki/8/86/Lootbug_Default.png";
function iconSrc(path: string): string {
  return path.startsWith("http") ? path : assetUrl(path);
}

function OvernightChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="14" width="4" height="6" rx="1" />
      <rect x="10" y="10" width="4" height="10" rx="1" />
      <rect x="17" y="6" width="4" height="14" rx="1" />
    </svg>
  );
}

function OvernightMoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ color: "var(--text)", opacity: 0.85 }}>
      <path d="M12 3a6 6 0 0 0 6 6c0 2.2-1.2 4.1-3 5.2A6 6 0 0 1 6 12a6 6 0 0 1 6-9Z" />
    </svg>
  );
}

function rechargeChargeMultiplier(cardLevel: number): number {
  const lvl = Math.max(0, Math.min(3, Math.trunc(cardLevel)));
  if (lvl === 1) return 1.5;
  if (lvl === 2) return 2.0;
  if (lvl === 3) return 3.0;
  return 1.0;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function parseNumber(raw: string): number {
  const cleaned = raw.trim().replaceAll(",", ".").replaceAll(" ", "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function Stepper(props: {
  label: React.ReactNode;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
}) {
  const { label, value, onChange, step = 1, min = 0, max = Infinity, decimals = 2 } = props;
  const isEditingRef = useRef(false);
  const formatDisplay = (v: number) => (Number.isFinite(v) ? v.toFixed(decimals) : "");
  const [raw, setRaw] = useState<string>(() => formatDisplay(value));

  useEffect(() => {
    if (isEditingRef.current) return;
    setRaw(formatDisplay(value));
  }, [value, decimals]);

  function commit() {
    const n = parseNumber(raw);
    const next = clamp(n, min, max);
    onChange(Number(next.toFixed(decimals)));
    isEditingRef.current = false;
    setRaw(formatDisplay(next));
  }

  return (
    <div className="gemEvRow">
      <div className="label">
        <span>{label}</span>
        <span className="mono">{Number.isFinite(value) ? value.toFixed(decimals) : "—"}</span>
      </div>
      <div className="gemEvStepper">
        <button type="button" className="btn btnSecondary gemEvStepBtn" onClick={() => onChange(clamp(value - step, min, max))}>−</button>
        <input
          className="input gemEvInput"
          inputMode="decimal"
          value={raw}
          onFocus={() => { isEditingRef.current = true; }}
          onChange={(e) => { isEditingRef.current = true; setRaw(e.target.value); }}
          onBlur={() => commit()}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        />
        <button type="button" className="btn gemEvStepBtn" onClick={() => onChange(clamp(value + step, min, max))}>+</button>
      </div>
    </div>
  );
}

type OvernightState = {
  sleepHours: number;
  gemBombActive: boolean;
  offlineNoElixirBuff: boolean;
};

const DEFAULT_STATE: OvernightState = {
  sleepHours: 8,
  gemBombActive: true,
  offlineNoElixirBuff: false,
};

/** Match Gem EV ContribBarChart: single fill color for bars. */
const CONTRIB_BAR_FILL = "#2E86AB";

type OvernightContrib = {
  autoBomber: number;
  freebies: number;
  founder: number;
  lootbugs: number;
  droneFuel: number;
  total: number;
  /** Frogger Gem EV+/h (when Frogger Drone ON). Shown as separate row when > 0. */
  froggerGemEv?: number;
  /** Elixir Drone fuel cost (negative). Shown when available from Drone module. */
  elixirFuel?: number;
  /** Frogger Drone fuel cost (negative). Shown when available. */
  froggerFuel?: number;
  /** Other drones fuel cost (negative). Shown when breakdown available and ≠ 0. */
  otherDroneFuel?: number;
};

function fmtContrib(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(1);
}

function pctOvernight(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return (Math.abs(part) / total) * 100.0;
}

function OvernightContribChart(props: { contributions: OvernightContrib; dark?: boolean }) {
  const { contributions, dark } = props;
  const hasDroneBreakdown = contributions.elixirFuel !== undefined || contributions.froggerFuel !== undefined || contributions.otherDroneFuel !== undefined;
  const rows: Array<{ label: string; value: number }> = [
    { label: "Auto-Bomber (Cherry Bomb)", value: contributions.autoBomber },
    { label: "Banked freebies", value: contributions.freebies },
    { label: "Founder (1 event)", value: contributions.founder },
    { label: "Banked lootbugs", value: contributions.lootbugs },
    ...(contributions.froggerGemEv != null && contributions.froggerGemEv > 0 ? [{ label: "Frogger Gem EV+/h", value: contributions.froggerGemEv }] : []),
    ...(hasDroneBreakdown
      ? [
          ...(contributions.elixirFuel != null && contributions.elixirFuel < 0 ? [{ label: "Elixir Drone (fuel)", value: contributions.elixirFuel }] : []),
          ...(contributions.froggerFuel != null && contributions.froggerFuel < 0 ? [{ label: "Frogger Drone (fuel)", value: contributions.froggerFuel }] : []),
          ...(contributions.otherDroneFuel != null && contributions.otherDroneFuel < 0 ? [{ label: "Other drones (fuel)", value: contributions.otherDroneFuel }] : []),
        ]
      : [{ label: "Drone fuel", value: contributions.droneFuel }]),
  ];
  const totalForPct = rows.reduce((s, r) => s + Math.abs(r.value), 0);
  const allValues = [0, ...rows.map((r) => r.value)];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = Math.max(maxVal - minVal, 1);

  const W = 800;
  const padL = 220;
  const padR = 160;
  const padT = 20;
  const padB = 56;
  const plotW = W - padL - padR;
  const nRows = rows.length;
  const plotH = 40 * nRows;
  const H = padT + plotH + padB;
  const rowH = plotH / nRows;
  const barPad = 4;
  const barH = Math.max(12, rowH - 2 * barPad);
  const scaleX = plotW / range;

  const gridLines = 5;
  const xTicks = Array.from({ length: gridLines + 1 }, (_, i) => minVal + (i / gridLines) * range);

  function xOf(v: number): number {
    return padL + (v - minVal) * scaleX;
  }
  function wOf(v: number): number {
    return Math.abs(v) * scaleX;
  }

  const gemIconUrl = assetUrl(GEM_ICON);

  const chartBg = dark ? "#2d3340" : "#ffffff";
  const gridStroke = dark ? "rgba(226,232,240,0.15)" : "rgba(15,23,42,0.08)";
  const axisStroke = dark ? "rgba(226,232,240,0.35)" : "rgba(15,23,42,0.22)";
  const zeroStroke = dark ? "rgba(226,232,240,0.5)" : "rgba(15,23,42,0.35)";
  const tickFill = dark ? "rgba(226,232,240,0.88)" : "rgba(71,85,105,0.9)";
  const labelFill = dark ? "rgba(226,232,240,0.95)" : "rgba(15,23,42,0.85)";
  const valueFill = dark ? "rgba(226,232,240,0.9)" : "rgba(71,85,105,0.9)";
  const barStroke = dark ? "rgba(226,232,240,0.4)" : "rgba(15,23,42,0.55)";
  const barStrokeInner = dark ? "rgba(226,232,240,0.3)" : "rgba(15,23,42,0.45)";
  const barFill = dark ? "#5ba3c9" : CONTRIB_BAR_FILL;
  const borderStyle = dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)";

  return (
    <div className="gemEvChartBlock">
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{
          display: "block",
          background: chartBg,
          borderRadius: "0 0 10px 10px",
          border: borderStyle,
          borderTop: "none",
        }}
        role="img"
        aria-label="Overnight contributions by source"
      >
        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={xOf(t)} y1={padT} x2={xOf(t)} y2={padT + plotH} stroke={gridStroke} strokeDasharray="4 4" />
            <text x={xOf(t)} y={padT + plotH + 16} textAnchor="middle" fontSize={10} fill={tickFill} fontFamily="var(--mono)">
              {t.toFixed(0)}
            </text>
          </g>
        ))}
        {minVal < 0 && (
          <line x1={xOf(0)} y1={padT} x2={xOf(0)} y2={padT + plotH} stroke={zeroStroke} strokeWidth={1.2} />
        )}
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={axisStroke} />
        <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke={axisStroke} />

        <g aria-hidden="true">
          <image href={gemIconUrl} x={W / 2 - 18} y={H - 14} width={16} height={16} />
          <text x={W / 2 - 2} y={H - 2} textAnchor="start" fontSize={10} fontWeight={800} fill={tickFill} fontFamily="var(--mono)">(total)</text>
        </g>

        {rows.map((row, i) => {
          const y0 = padT + i * rowH + barPad;
          const v = row.value;
          const barStartX = v >= 0 ? 0 : v;
          const barLen = Math.abs(v);
          const labelY = y0 + barH / 2 + 4;
          const pctVal = totalForPct > 0 ? pctOvernight(v, totalForPct) : 0;
          const valueText = `${fmtContrib(v)} (${pctVal.toFixed(1)}%)`;
          return (
            <g key={row.label}>
              <rect
                x={xOf(barStartX)}
                y={y0}
                width={wOf(barLen)}
                height={barH}
                fill="none"
                stroke={barStroke}
                strokeWidth={1}
                rx={2}
              />
              {v !== 0 && (
                <rect
                  x={xOf(barStartX)}
                  y={y0}
                  width={wOf(barLen)}
                  height={barH}
                  fill={barFill}
                  stroke={barStrokeInner}
                  strokeWidth={0.6}
                  rx={2}
                />
              )}
              <text x={padL - 8} y={labelY} textAnchor="end" fontSize={11} fontWeight={800} fill={labelFill}>
                {row.label}
              </text>
              <text
                x={padL + plotW + 8}
                y={labelY}
                textAnchor="start"
                fontSize={10}
                fontWeight={800}
                fill={valueFill}
                fontFamily="var(--mono)"
              >
                {valueText}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function OvernightGains() {
  const [state, setState] = useState<OvernightState>(() => {
    const saved = loadJson<Partial<OvernightState> & { bankedFreebies?: number; bankedLootbugs?: number }>(STORAGE_KEY);
    const { bankedFreebies: _df, bankedLootbugs: _dl, ...rest } = saved ?? {};
    return { ...DEFAULT_STATE, ...rest };
  });
  const [chartOpen, setChartOpen] = useState(false);

  useEffect(() => {
    saveJson(STORAGE_KEY, state);
  }, [state]);

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") setChartOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const gemEvParams = useMemo(() => {
    const base = defaultGameParameters();
    const saved = loadJson<{ params?: Partial<GameParameters> }>(GEMEV_STORAGE_KEY);
    return { ...base, ...(saved?.params ?? {}) } as GameParameters;
  }, []);

  /** Re-read external and bomb params every render so we always have the latest from Bombs, Drone, Lootbug. */
  const external = (() => {
    const ext = loadJson<{
      game_speed_multiplier?: number;
      droneBomb10xMinPerHour?: number;
      droneFuelGemsPerHour?: number;
      elixirFuelGemsPerHour?: number;
      froggerFuelGemsPerHour?: number;
      froggerGemEvPerHour?: number;
      lootbugEvPerClaim?: number;
      lootbugEvPerSpawn?: number;
      lootbugNetEvPerSpawn?: number;
      bankedFreebies?: number;
      bankedLootbugs?: number;
      chaosTotem100FromBombs?: boolean;
    }>(GEMEV_EXTERNAL_KEY);
    const gameSpeed = typeof ext?.game_speed_multiplier === "number" && ext.game_speed_multiplier >= 1
      ? ext.game_speed_multiplier
      : getGameSpeedMultiplier(gemEvParams);
    const drone10x = typeof ext?.droneBomb10xMinPerHour === "number" ? Math.max(0, ext.droneBomb10xMinPerHour) : 0;
    const droneFuel = typeof ext?.droneFuelGemsPerHour === "number" ? Math.max(0, ext.droneFuelGemsPerHour) : 0;
    const elixirFuel = typeof ext?.elixirFuelGemsPerHour === "number" ? Math.max(0, ext.elixirFuelGemsPerHour) : 0;
    const froggerFuel = typeof ext?.froggerFuelGemsPerHour === "number" ? Math.max(0, ext.froggerFuelGemsPerHour) : 0;
    const froggerGemEvPerHour = typeof ext?.froggerGemEvPerHour === "number" ? Math.max(0, ext.froggerGemEvPerHour) : 0;
    const lootbugEv = typeof ext?.lootbugNetEvPerSpawn === "number"
      ? ext.lootbugNetEvPerSpawn
      : (typeof ext?.lootbugEvPerSpawn === "number" ? ext.lootbugEvPerSpawn : (typeof ext?.lootbugEvPerClaim === "number" ? ext.lootbugEvPerClaim : null));
    const chaos100 = typeof ext?.chaosTotem100FromBombs === "boolean" ? ext.chaosTotem100FromBombs : false;
    const bankedFreebies = typeof ext?.bankedFreebies === "number" && ext.bankedFreebies >= 0 ? Math.min(999, ext.bankedFreebies) : 0;
    const bankedLootbugs = typeof ext?.bankedLootbugs === "number" && ext.bankedLootbugs >= 0 ? Math.min(999, ext.bankedLootbugs) : 0;
    const bombsSaved = loadJson<{ params?: Partial<GameParameters> }>(BOMBS_STORAGE_KEY);
    const bombsParams = { ...defaultGameParameters(), ...(bombsSaved?.params ?? {}) } as GameParameters;
    return { gameSpeed, drone10x, droneFuel, elixirFuel, froggerFuel, froggerGemEvPerHour, lootbugEv, bankedFreebies, bankedLootbugs, chaos100, bombsParams };
  })();

  const bombsParams = external.bombsParams;

  /** Elixir Drone buffs apply when the client is offline; included by default. Checkbox allows assuming no Elixir overnight (10× = 0, no Elixir fuel cost). */
  const effectiveDrone10x = state.offlineNoElixirBuff ? 0 : external.drone10x;
  const effectiveDroneFuel = state.offlineNoElixirBuff ? Math.max(0, external.droneFuel - external.elixirFuel) : external.droneFuel;

  const effectiveParams = useMemo(() => {
    const p: GameParameters = { ...gemEvParams };
    p.game_speed_multiplier = external.gameSpeed;
    p.bomb_recharge_10x_min_per_hour = effectiveDrone10x;
    // When 100% from Bombs, recharge params are in-game (already /2). Otherwise base; no Chaos applied here.
    p.chaos_totem_uptime = 0;
    return p;
  }, [gemEvParams, external.gameSpeed, effectiveDrone10x, external.chaos100]);

  /** Auto-Bomber Gem EV/h: Cherry Bomb overnight (not Gem Bomb). Late cycle: each Cherry detonation = 1 + 2×tripleChance gem-equivalent detonations, so Cherry yields more gems. Uses bomb params from Bombs module. */
  const autoBomberGemEvPerHour = useMemo(() => {
    if (!state.gemBombActive) return 0;
    const drone10xUptime = effectiveDrone10x / 60.0;
    const bomb10xFactor = 1.0 + 9.0 * drone10xUptime;
    const chaosUptime = external.chaos100 ? 1.0 : 0.0;
    const chaosFactor = 1.0 + chaosUptime;
    const gameSpeedBonus = getGameSpeedBonus({ ...effectiveParams, game_speed_multiplier: external.gameSpeed });
    const effCherrySec = Math.max(0.01, bombsParams.cherry_bomb_recharge_seconds ?? 48) / (1.0 + gameSpeedBonus) / bomb10xFactor / chaosFactor;
    const freeBombMult = 1.0 / (1.0 - Math.max(0, Math.min(0.99, bombsParams.free_bomb_chance ?? 0)));
    const cherryMult = rechargeChargeMultiplier(bombsParams.cherry_bomb_recharge_card_level ?? 0);
    const cherryRechargedPerHour = (3600 / effCherrySec) * cherryMult * freeBombMult;
    const intervalRealSec = AUTO_BOMBER_INTERVAL_GAME_SEC / external.gameSpeed;
    const dropsPerHour = intervalRealSec > 0 ? 3600 / intervalRealSec : 0;
    const effectiveCherryPerHour = Math.min(dropsPerHour, cherryRechargedPerHour);
    const tripleChance = Math.max(0, Math.min(1, bombsParams.cherry_bomb_triple_charge_chance ?? 0));
    const cherryEffectMult = 1.0 + 2.0 * tripleChance;
    const gemChance = Math.max(0, Math.min(1, bombsParams.gem_bomb_gem_chance ?? 0)) + getGemBombGemChanceT12Bonus(effectiveParams);
    return effectiveCherryPerHour * cherryEffectMult * gemChance;
  }, [state.gemBombActive, effectiveParams, bombsParams, effectiveDrone10x, external.gameSpeed, external.chaos100]);

  const freebieEvPerClaim = useMemo(() => getFreebieEvPerClaim(effectiveParams), [effectiveParams]);
  const founderGemsPerEvent = useMemo(() => getFounderGemsPerSingleEvent(effectiveParams), [effectiveParams]);

  const lootbugEvPerClaim = external.lootbugEv ?? 0;

  const contributions = useMemo(() => {
    const hours = Math.max(0, state.sleepHours);
    const autoBomber = state.gemBombActive ? hours * autoBomberGemEvPerHour : 0;
    const freebies = external.bankedFreebies * freebieEvPerClaim;
    const founder = founderGemsPerEvent;
    const lootbugs = external.bankedLootbugs * lootbugEvPerClaim;
    const droneFuelCost = hours * effectiveDroneFuel;
    const froggerGemEv = !state.offlineNoElixirBuff && external.froggerGemEvPerHour > 0 ? hours * external.froggerGemEvPerHour : 0;
    const elixirFuelCost = !state.offlineNoElixirBuff && external.elixirFuel > 0 ? -hours * external.elixirFuel : 0;
    const froggerFuelCost = external.froggerFuel > 0 ? -hours * external.froggerFuel : 0;
    const otherDroneFuelCost = droneFuelCost - (state.offlineNoElixirBuff ? 0 : hours * external.elixirFuel) - hours * external.froggerFuel;
    const otherDroneFuel = otherDroneFuelCost > 0 ? -otherDroneFuelCost : 0;
    const total = autoBomber + freebies + founder + lootbugs + froggerGemEv - droneFuelCost;
    return {
      autoBomber,
      freebies,
      founder,
      lootbugs,
      droneFuel: -droneFuelCost,
      froggerGemEv: froggerGemEv > 0 ? froggerGemEv : undefined,
      elixirFuel: elixirFuelCost < 0 ? elixirFuelCost : undefined,
      froggerFuel: froggerFuelCost < 0 ? froggerFuelCost : undefined,
      otherDroneFuel: otherDroneFuel < 0 ? otherDroneFuel : undefined,
      total,
    };
  }, [state.sleepHours, external.bankedFreebies, external.bankedLootbugs, state.gemBombActive, state.offlineNoElixirBuff, autoBomberGemEvPerHour, freebieEvPerClaim, founderGemsPerEvent, lootbugEvPerClaim, effectiveDroneFuel, external.froggerGemEvPerHour, external.elixirFuel, external.froggerFuel]);

  const overnightTotal = contributions.total;
  /** Ongoing gem EV per hour (rate × hours). Does not include one-time payouts. */
  const gemEvPerHourRate = (state.gemBombActive ? autoBomberGemEvPerHour : 0) - effectiveDroneFuel;
  const oneTimeTotal = contributions.freebies + contributions.founder + contributions.lootbugs;

  const overnightInfo = {
    title: "Overnight Gains",
    sections: [
      {
        heading: "Scope",
        lines: [
          "Same logic as Gem EV Calculator, but only sources that apply while you are away.",
          "Elixir Drone shoots buffs when the client is offline (e.g. 10× Bomb Recharge). So overnight gains include Elixir buffs by default.",
          "Freebies and Lootbugs are not collected during sleep; only banked amounts are paid out at end of night.",
        ],
      },
      {
        heading: "Auto-Bomber (Cherry Bomb)",
        lines: [
          "Overnight we assume Cherry Bomb is fired (not Gem Bomb). Uses bomb params from Bombs module: Cherry recharge, 3× Charges Chance, Gem chance, Card level.",
          "In the late bomb cycle each Cherry detonation counts as (1 + 2× 3× chance) gem-equivalent detonations, so Cherry yields more gems per hour than Gem Bomb for the same drop rate.",
          "10× Bomb Recharge: from Drone. Elixir Drone shoots buffs when you are offline, so 10× runs overnight. Lootbug 10× does not accumulate while you sleep.",
        ],
      },
      {
        heading: "Chaos Totem",
        lines: [
          "If Chaos Totem does not have 100% uptime, it is excluded from the calculation.",
          "You cannot open new Item Chests or extend Chaos Totem while sleeping.",
        ],
      },
      {
        heading: "Founder supply",
        lines: [
          "Not activated during sleep. One roll at start of night: 1, 2, or 3 drops (double/triple chance).",
          "If you had only 1 drop at start, that is the only founder event for the night.",
        ],
      },
      {
        heading: "Lootbugs",
        lines: [
          "Banked lootbugs are paid out at end of night. One triple spawn counts as one banked lootbug.",
          "Net EV per spawn (gains minus all costs, same as Lootbug EV breakdown chart) is taken from Lootbug. Total = banked count × net per spawn.",
        ],
      },
    ],
  };

  return (
    <div className="overnightPage">
      <div className="overnightHeader">
        <h1 className="overnightTitle">Overnight Gains</h1>
      </div>
      <div className="overnightContent gemEvGrid">
        <div className="overnightResultPanel">
          <div className="overnightResultHeader">
            <img src={assetUrl(GEM_ICON)} alt="" className="overnightResultHeaderIcon" aria-hidden />
            <span className="overnightResultHeaderTitle">Overnight Gem EV</span>
          </div>
          <div className="overnightResultBody">
            <div className="overnightResultRow">
              <span className="overnightResultLabel">
                Per hour
                <Tooltip
                  content={{
                    title: "Gem EV per hour (ongoing)",
                    lines: [
                      "Ongoing rate from Auto-Bomber and Drone fuel. Does not change with sleep duration.",
                      "Total overnight = (Per hour × Sleep hours) + One-time (end of night).",
                    ],
                  }}
                  label="?"
                />
              </span>
              <span className="mono overnightResultValue">{Number.isFinite(gemEvPerHourRate) ? gemEvPerHourRate.toFixed(1) : "—"}</span>
            </div>
            <div className="overnightResultRow">
              <span className="overnightResultLabel">One-time (end of night)</span>
              <span className="mono overnightResultValue">{Number.isFinite(oneTimeTotal) ? oneTimeTotal.toFixed(1) : "—"}</span>
            </div>
            <div className="overnightResultRow">
              <span className="overnightResultLabel">Total</span>
              <span className="mono overnightResultValue">{Number.isFinite(overnightTotal) ? overnightTotal.toFixed(1) : "—"}</span>
            </div>
          </div>
          <div className="overnightResultButtonWrap">
            <button className="btn btnSecondary" type="button" onClick={() => setChartOpen(true)}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <OvernightChartIcon />
                Overview chart
              </span>
            </button>
          </div>
        </div>

        {chartOpen ? (
          <div className="modalOverlay" onMouseDown={() => setChartOpen(false)}>
            <div className="modalWindow overnightChartModal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHeader">
                <div>
                  <div className="mono" style={{ fontWeight: 900 }}>
                    Overnight Gem EV by source
                  </div>
                  <div className="small">Total by source (gains and costs).</div>
                </div>
                <button className="btn btnSecondary" type="button" onClick={() => setChartOpen(false)}>
                  Close
                </button>
              </div>
              <div className="modalBody">
                <OvernightContribChart contributions={contributions} dark />
              </div>
            </div>
          </div>
        ) : null}

        <Collapsible
          id="overnight-input"
          title="Input"
          defaultExpanded={true}
          className="gemEvSection tierHeader1"
          headerRight={<Tooltip content={overnightInfo} label="?" />}
        >
          <div className="gemEvSectionBody overnightInputRows">
            <div className="overnightRow">
              <OvernightMoonIcon />
              <Stepper
                label="Sleep duration (hours)"
                value={state.sleepHours}
                onChange={(v) => setState((s) => ({ ...s, sleepHours: clamp(v, 0.1, 24) }))}
                step={0.5}
                min={0.1}
                max={24}
                decimals={1}
              />
            </div>
            <div className="overnightRow overnightRowSingle overnightRowBordered">
              <img src={iconSrc(CHERRY_BOMB_ICON)} alt="" className="iconSmall" style={{ width: 20, height: 20 }} aria-hidden />
              <label className="toggle" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={state.gemBombActive}
                  onChange={(e) => setState((s) => ({ ...s, gemBombActive: e.target.checked }))}
                />
                <span>Auto-Bomber (Cherry Bomb)</span>
              </label>
              <Tooltip
                content={{
                  title: "Auto-Bomber (Cherry Bomb)",
                  sections: [
                    {
                      heading: "Why Cherry",
                      lines: [
                        "Overnight we fire Cherry Bomb, not Gem Bomb. In the late bomb cycle each Cherry detonation counts as more than one gem-equivalent detonation (1 + 2× your 3× Charges Chance).",
                        "Same drop rate as Gem Bomb, so Cherry yields more gems per hour. Set Cherry recharge and 3× chance in Bombs module.",
                      ],
                    },
                    { heading: "Toggle", lines: ["When on, auto-bomber runs while you sleep and Cherry Bomb drops are counted. When off, no bomb contribution for the night."] },
                  ],
                }}
                label="?"
              />
            </div>
            <div className="overnightRow overnightRowSingle overnightRowBordered">
              <img src={CHAOS_TOTEM_ICON} alt="" className="iconSmall" style={{ width: 20, height: 20 }} aria-hidden />
              <span className="label">Chaos Totem 100% Uptime</span>
              <span className="mono small">{external.chaos100 ? "Yes" : "No"}</span>
              <Tooltip content={{ title: "Chaos Totem", lines: ["Taken from Bombs module. Change it there to affect overnight calculation.", "When off, Chaos Totem is excluded from overnight calculation."] }} label="?" />
            </div>
            <div className="overnightRow overnightRowSingle overnightRowBordered">
              <label className="toggle" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={state.offlineNoElixirBuff}
                  onChange={(e) => setState((s) => ({ ...s, offlineNoElixirBuff: e.target.checked }))}
                />
                <span>Assume no Elixir when offline</span>
              </label>
              <Tooltip
                content={{
                  title: "Elixir Drone overnight",
                  sections: [
                    {
                      heading: "Offline behavior",
                      lines: [
                        "Elixir Drone shoots buffs when the client is offline. So 10× Bomb Recharge and other Elixir buffs are active overnight and are included in the calculation by default.",
                      ],
                    },
                    {
                      heading: "Assume no Elixir",
                      lines: [
                        "Check this box only if you want to assume no Elixir overnight: 10× = 0 and Elixir fuel cost excluded.",
                      ],
                    },
                  ],
                }}
                label="?"
              />
            </div>
            <div className="overnightRow overnightRowDouble">
              <div className="gemEvRow overnightEvDisplay">
                <span className="label">Banked freebies <span className="small" style={{ opacity: 0.85 }}>(from Gem EV)</span></span>
                <span className="mono">{external.bankedFreebies}</span>
              </div>
              <img src={LOOTBUG_ICON} alt="" className="iconSmall" style={{ width: 18, height: 18 }} aria-hidden />
              <div className="gemEvRow overnightEvDisplay">
                <span className="label">Banked lootbugs <span className="small" style={{ opacity: 0.85 }}>(from Lootbug)</span></span>
                <span className="mono">{external.bankedLootbugs}</span>
              </div>
            </div>
            <div className="overnightRow overnightRowDouble">
              <div className="gemEvRow overnightEvDisplay">
                <span className="label">Freebie EV per claim</span>
                <span className="mono">{Number.isFinite(freebieEvPerClaim) ? freebieEvPerClaim.toFixed(1) : "—"}</span>
                <Tooltip content={{ title: "Freebie EV per claim", lines: ["Expected Gem EV from one freebie claim (one pop).", "Includes: base gems, Stonks, Skill Shards, Statue of Soprano gifts (when built).", "From Gem EV params. Used for banked freebies: count × EV per claim."] }} label="?" />
              </div>
              <div className="gemEvRow overnightEvDisplay">
                <span className="label">Lootbug net per spawn <span className="small" style={{ opacity: 0.85 }}>(from Lootbug)</span></span>
                <span className="mono">{external.lootbugEv != null ? external.lootbugEv.toFixed(1) : "—"}</span>
                <Tooltip
                  content={{
                    title: "Lootbug net per spawn",
                    sections: [
                      {
                        heading: "Source",
                        lines: [
                          "Value is read from the Lootbug module. Open the Lootbug tab to refresh it.",
                          "Banked lootbugs at end of night: count × net per spawn.",
                        ],
                      },
                      {
                        heading: "Formula",
                        lines: [
                          "Net = all gains (e.g. +2 Gems, +10 Cherry, 10×, Item Chests) minus all costs (gem buffs you Buy). Same value as in Lootbug EV breakdown chart.",
                          "Triple chance, golden chance, gem cost reduction, and loot multiplier are already included.",
                        ],
                      },
                    ],
                  }}
                  label="?"
                />
              </div>
            </div>
          </div>
        </Collapsible>

        <div className="overnightReadOnlyNote">
          <span className="small">Auto-Bomber: Cherry Bomb (recharge, 3× chance) from Bombs module. Game speed from Gem EV. Drone 10× and fuel from Drone (Elixir Drone shoots buffs offline). Banked freebies and freebie EV from Gem EV. Lootbug EV from Lootbug.</span>
        </div>
      </div>
    </div>
  );
}
