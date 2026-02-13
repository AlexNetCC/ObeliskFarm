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
const GEM_BOMB_ICON = "sprites/event/gembomb.png";
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
  bankedFreebies: number;
  bankedLootbugs: number;
};

const DEFAULT_STATE: OvernightState = {
  sleepHours: 8,
  gemBombActive: true,
  offlineNoElixirBuff: false,
  bankedFreebies: 0,
  bankedLootbugs: 0,
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
};

function fmtContrib(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(1);
}

function OvernightContribChart(props: { contributions: OvernightContrib }) {
  const { contributions } = props;
  const rows: Array<{ label: string; value: number }> = [
    { label: "Auto-Bomber", value: contributions.autoBomber },
    { label: "Banked freebies", value: contributions.freebies },
    { label: "Founder (1 event)", value: contributions.founder },
    { label: "Banked lootbugs", value: contributions.lootbugs },
    { label: "Drone fuel", value: contributions.droneFuel },
  ];
  const allValues = [0, ...rows.map((r) => r.value)];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = Math.max(maxVal - minVal, 1);

  const W = 720;
  const padL = 140;
  const padR = 152;
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

  return (
    <div className="gemEvChartBlock">
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
          aria-label="Overnight contributions by source"
        >
          {xTicks.map((t, i) => (
            <g key={i}>
              <line x1={xOf(t)} y1={padT} x2={xOf(t)} y2={padT + plotH} stroke="rgba(15,23,42,0.08)" strokeDasharray="4 4" />
              <text x={xOf(t)} y={padT + plotH + 16} textAnchor="middle" fontSize={10} fill="rgba(71,85,105,0.9)" fontFamily="var(--mono)">
                {t.toFixed(0)}
              </text>
            </g>
          ))}
          {minVal < 0 && (
            <line x1={xOf(0)} y1={padT} x2={xOf(0)} y2={padT + plotH} stroke="rgba(15,23,42,0.35)" strokeWidth={1.2} />
          )}
          <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(15,23,42,0.22)" />
          <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(15,23,42,0.22)" />

          {rows.map((row, i) => {
            const y0 = padT + i * rowH + barPad;
            const v = row.value;
            const barStartX = v >= 0 ? 0 : v;
            const barLen = Math.abs(v);
            const barEndX = v >= 0 ? v : 0;
            const labelY = y0 + barH / 2 + 4;
            return (
              <g key={row.label}>
                <rect
                  x={xOf(barStartX)}
                  y={y0}
                  width={wOf(barLen)}
                  height={barH}
                  fill="none"
                  stroke="rgba(15,23,42,0.55)"
                  strokeWidth={1}
                  rx={2}
                />
                {v !== 0 && (
                  <rect
                    x={xOf(barStartX)}
                    y={y0}
                    width={wOf(barLen)}
                    height={barH}
                    fill={CONTRIB_BAR_FILL}
                    stroke="rgba(15,23,42,0.45)"
                    strokeWidth={0.6}
                    rx={2}
                  />
                )}
                <text x={padL - 8} y={labelY} textAnchor="end" fontSize={11} fontWeight={800} fill="rgba(15,23,42,0.85)">
                  {row.label}
                </text>
                <text
                  x={padL + plotW + 8}
                  y={labelY}
                  textAnchor="start"
                  fontSize={10}
                  fontWeight={800}
                  fill="rgba(71,85,105,0.9)"
                  fontFamily="var(--mono)"
                >
                  {fmtContrib(v)}
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
    const saved = loadJson<Partial<OvernightState>>(STORAGE_KEY);
    return { ...DEFAULT_STATE, ...saved };
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
      lootbugEvPerClaim?: number;
      lootbugEvPerSpawn?: number;
      chaosTotem100FromBombs?: boolean;
    }>(GEMEV_EXTERNAL_KEY);
    const gameSpeed = typeof ext?.game_speed_multiplier === "number" && ext.game_speed_multiplier >= 1
      ? ext.game_speed_multiplier
      : getGameSpeedMultiplier(gemEvParams);
    const drone10x = typeof ext?.droneBomb10xMinPerHour === "number" ? Math.max(0, ext.droneBomb10xMinPerHour) : 0;
    const droneFuel = typeof ext?.droneFuelGemsPerHour === "number" ? Math.max(0, ext.droneFuelGemsPerHour) : 0;
    const elixirFuel = typeof ext?.elixirFuelGemsPerHour === "number" ? Math.max(0, ext.elixirFuelGemsPerHour) : 0;
    const lootbugEv = typeof ext?.lootbugEvPerSpawn === "number"
      ? ext.lootbugEvPerSpawn
      : (typeof ext?.lootbugEvPerClaim === "number" ? ext.lootbugEvPerClaim : null);
    const chaos100 = typeof ext?.chaosTotem100FromBombs === "boolean" ? ext.chaosTotem100FromBombs : false;
    const bombsSaved = loadJson<{ params?: Partial<GameParameters> }>(BOMBS_STORAGE_KEY);
    const bombsParams = { ...defaultGameParameters(), ...(bombsSaved?.params ?? {}) } as GameParameters;
    return { gameSpeed, drone10x, droneFuel, elixirFuel, lootbugEv, chaos100, bombsParams };
  })();

  const bombsParams = external.bombsParams;

  /** When offline (screen off): no Elixir Drone buff (10× = 0) and no Elixir fuel cost. */
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

  /** Auto-Bomber Gem EV/h: same logic as Bombs module (raw Gem Bombs only, no Cherry/D20/Battery). Uses bomb params from Bombs module. */
  const autoBomberGemEvPerHour = useMemo(() => {
    if (!state.gemBombActive) return 0;
    const drone10xUptime = effectiveDrone10x / 60.0;
    const bomb10xFactor = 1.0 + 9.0 * drone10xUptime;
    const chaosUptime = external.chaos100 ? 1.0 : 0.0;
    const chaosFactor = 1.0 + chaosUptime;
    const gameSpeedBonus = getGameSpeedBonus({ ...effectiveParams, game_speed_multiplier: external.gameSpeed });
    const effGemSec = Math.max(0.01, bombsParams.gem_bomb_recharge_seconds ?? 46) / (1.0 + gameSpeedBonus) / bomb10xFactor / chaosFactor;
    const freeBombMult = 1.0 / (1.0 - Math.max(0, Math.min(0.99, bombsParams.free_bomb_chance ?? 0)));
    const gemMult = rechargeChargeMultiplier(bombsParams.gem_bomb_recharge_card_level ?? 0);
    const gemBombsRechargedPerHour = (3600 / effGemSec) * gemMult * freeBombMult;
    const intervalRealSec = AUTO_BOMBER_INTERVAL_GAME_SEC / external.gameSpeed;
    const gemBombsDroppedPerHour = intervalRealSec > 0 ? 3600 / intervalRealSec : 0;
    const effectiveGemBombsPerHour = Math.min(gemBombsDroppedPerHour, gemBombsRechargedPerHour);
    const gemChance = Math.max(0, Math.min(1, bombsParams.gem_bomb_gem_chance ?? 0)) + getGemBombGemChanceT12Bonus(effectiveParams);
    return effectiveGemBombsPerHour * gemChance;
  }, [state.gemBombActive, effectiveParams, bombsParams, effectiveDrone10x, external.gameSpeed, external.chaos100]);

  const freebieEvPerClaim = useMemo(() => getFreebieEvPerClaim(effectiveParams), [effectiveParams]);
  const founderGemsPerEvent = useMemo(() => getFounderGemsPerSingleEvent(effectiveParams), [effectiveParams]);

  const lootbugEvPerClaim = external.lootbugEv ?? 0;

  const contributions = useMemo(() => {
    const hours = Math.max(0, state.sleepHours);
    const autoBomber = state.gemBombActive ? hours * autoBomberGemEvPerHour : 0;
    const freebies = state.bankedFreebies * freebieEvPerClaim;
    const founder = founderGemsPerEvent;
    const lootbugs = state.bankedLootbugs * lootbugEvPerClaim;
    const droneFuelCost = hours * effectiveDroneFuel;
    const total = autoBomber + freebies + founder + lootbugs - droneFuelCost;
    return { autoBomber, freebies, founder, lootbugs, droneFuel: -droneFuelCost, total };
  }, [state.sleepHours, state.bankedFreebies, state.bankedLootbugs, state.gemBombActive, autoBomberGemEvPerHour, freebieEvPerClaim, founderGemsPerEvent, lootbugEvPerClaim, effectiveDroneFuel]);

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
          "Freebies and Lootbugs are not collected during sleep; only banked amounts are paid out at end of night.",
        ],
      },
      {
        heading: "Auto-Bomber",
        lines: [
          "Uses bomb params from Bombs module (recharge times, Free Bomb Chance, Gem chance, Card level). Same gains as Bombs Raw Gem Bombs.",
          "No Cherry/Battery/D20 effect. 10× Bomb Recharge: only Drone (drones run offline). Lootbug 10× does not accumulate while you sleep.",
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
          "EV per spawn (includes triple chance: 1 or 3 claims per spawn) is taken from Lootbug module.",
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
            <div className="modalWindow" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHeader">
                <div className="mono" style={{ fontWeight: 900 }}>
                  Overview chart
                </div>
                <button className="btn btnSecondary" type="button" onClick={() => setChartOpen(false)}>
                  Close
                </button>
              </div>
              <div className="modalBody">
                <OvernightContribChart contributions={contributions} />
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
              <img src={iconSrc(GEM_BOMB_ICON)} alt="" className="iconSmall" style={{ width: 20, height: 20 }} aria-hidden />
              <label className="toggle" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={state.gemBombActive}
                  onChange={(e) => setState((s) => ({ ...s, gemBombActive: e.target.checked }))}
                />
                <span>Auto-Bomber (Gem Bomb active)</span>
              </label>
              <Tooltip content={{ title: "Auto-Bomber", lines: ["When on, auto-bomber runs while you sleep and gem bomb drops are counted.", "Battery/Cherry/D20 cycle does not apply; only Gem Bomb recharge and drops.", "When off, no gem bomb contribution for the night."] }} label="?" />
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
                <span>Offline Gains = No Elixir Drone buff</span>
              </label>
              <Tooltip
                content={{
                  title: "Offline Gains",
                  lines: [
                    "When checked: fully offline (screen off). You do not get the Elixir Drone 10× Bomb Recharge buff.",
                    "You also do not spend Elixir fuel, so that cost is excluded from overnight.",
                  ],
                }}
                label="?"
              />
            </div>
            <div className="overnightRow overnightRowDouble">
              <Stepper label="Banked freebies" value={state.bankedFreebies} onChange={(v) => setState((s) => ({ ...s, bankedFreebies: Math.max(0, v) }))} step={1} min={0} max={999} decimals={0} />
              <img src={LOOTBUG_ICON} alt="" className="iconSmall" style={{ width: 18, height: 18 }} aria-hidden />
              <Stepper label="Banked lootbugs" value={state.bankedLootbugs} onChange={(v) => setState((s) => ({ ...s, bankedLootbugs: Math.max(0, v) }))} step={1} min={0} max={999} decimals={0} />
            </div>
            <div className="overnightRow overnightRowDouble">
              <div className="gemEvRow overnightEvDisplay">
                <span className="label">Freebie EV per claim</span>
                <span className="mono">{Number.isFinite(freebieEvPerClaim) ? freebieEvPerClaim.toFixed(1) : "—"}</span>
                <Tooltip content={{ title: "Freebie EV per claim", lines: ["Expected Gem EV from one freebie claim (one pop).", "Includes: base gems, Stonks, Skill Shards, Statue of Soprano gifts (when built).", "From Gem EV params. Used for banked freebies: count × EV per claim."] }} label="?" />
              </div>
              <div className="gemEvRow overnightEvDisplay">
                <span className="label">Lootbug EV per spawn</span>
                <span className="mono">{external.lootbugEv != null ? external.lootbugEv.toFixed(1) : "—"}</span>
                <Tooltip content={{ title: "Lootbug EV per spawn", lines: ["Taken from Lootbug module. Open Lootbug to update the value.", "Used for banked lootbugs: count × EV per spawn (each spawn can be triple = 3 claims).", "Triple spawn chance is included: EV per spawn = EV per claim × expected lootbugs per spawn."] }} label="?" />
              </div>
            </div>
          </div>
        </Collapsible>

        <div className="overnightReadOnlyNote">
          <span className="small">Auto-Bomber: bomb params from Bombs module. Game speed from Gem EV. Drone 10× and fuel from Drone. Freebie EV from Gem EV. Lootbug EV from Lootbug.</span>
        </div>
      </div>
    </div>
  );
}
