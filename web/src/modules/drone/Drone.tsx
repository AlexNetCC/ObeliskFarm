import { useEffect, useMemo, useRef, useState } from "react";
import "./drone.css";
import { Tooltip } from "../../components/Tooltip";
import { Collapsible } from "../../components/Collapsible";
import { loadJson, saveJson } from "../../lib/storage";
import { defaultGameParameters, getGameSpeedMultiplier, type GameParameters } from "../../lib/gemev/freebieEv";

const ELIXIR_BASE_INTERVAL_SEC = 360;
const ELIXIR_SUIT_SEC_PER_LEVEL = 15;
const ELIXIR_FUEL_BUFF_BASE_PCT = 60;
const ELIXIR_FUEL_BUFF_PCT_PER_GRADE = 6;
const COAL_FUEL_DURATION_MAX_LEVEL = 20;
const COAL_FUEL_SAVE_MAX_LEVEL = 20;
/** 2× Game Speed buff: 2 min base; halved in real time when 2× Game Speed is active. */
const GAME_SPEED_2X_BUFF_DURATION_SEC = 120;
const ELIXIR_NUM_BUFFS_WITH_FISHING = 10;
const ELIXIR_NUM_BUFFS_WITHOUT_FISHING = 9;
/** Elixir fuel duration from Drone Buffs table: 3:30 at grade 0, +0:10.5 per grade. Then × (1 + Coal Fuel Duration %). */
const ELIXIR_FUEL_DURATION_BASE_SEC = 210; // 3:30
const ELIXIR_FUEL_DURATION_SEC_PER_GRADE = 10.5; // +0:10.5

const GASOLINE_GUZZLER_FUEL_DURATION_PCT = 20;

const ELIXIR_BUFF_ICONS =
  "https://static.wikitide.net/shminerwiki/";
/** Base duration (game time) in seconds. realTimeOnly = duration not affected by game speed (e.g. Fishing Tick). */
const ELIXIR_BUFFS: Array<{ id: string; label: string; baseSec: number; icon: string; realTimeOnly?: boolean }> = [
  { id: "2xgs", label: "2× Game Speed", baseSec: 120, icon: `${ELIXIR_BUFF_ICONS}d/d4/Game_Speed_Multiplier.png` },
  { id: "10xbomb", label: "10× Bomb Recharge", baseSec: 60, icon: `${ELIXIR_BUFF_ICONS}b/ba/Bomb_Recharge_Speed_10x_Buff.png` },
  { id: "3xcoal", label: "3× Coal Production Speed", baseSec: 240, icon: `${ELIXIR_BUFF_ICONS}7/71/3x_Coal_Production_Speed_Buff.png` },
  { id: "2xore", label: "2× Ore", baseSec: 180, icon: `${ELIXIR_BUFF_ICONS}2/2c/2x_Ore_Income_Buff.png` },
  { id: "3xvein", label: "3× Vein Spawn Rate", baseSec: 180, icon: `${ELIXIR_BUFF_ICONS}9/91/3x_Vein_Spawn_Rate_Buff.png` },
  { id: "autocatch", label: "100% Star Autocatch", baseSec: 300, icon: `${ELIXIR_BUFF_ICONS}8/88/Auto-Catch_Chance.png` },
  { id: "2xstar", label: "2× Star Spawn Rate", baseSec: 180, icon: `${ELIXIR_BUFF_ICONS}5/5b/2x_Spawn_Rate_Buff.png` },
  { id: "3xp", label: "3× Experience", baseSec: 240, icon: `${ELIXIR_BUFF_ICONS}2/27/3x_Experience_Buff.png` },
  { id: "3xsuper", label: "3× Super Star Spawn Rate", baseSec: 180, icon: `${ELIXIR_BUFF_ICONS}7/72/Triple_Super_Star_Chance_Buff.png` },
  { id: "3xfishing", label: "3× Fishing Tick Speed", baseSec: 120, icon: `${ELIXIR_BUFF_ICONS}8/87/Triple_Fish_Tick_Chance.png`, realTimeOnly: true },
];

function formatMinSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Heatmap color by relative duration: 0% = cool (blue), 100% = hot (red). */
function heatmapColor(pct: number): string {
  const t = Math.max(0, Math.min(1, pct / 100));
  const hue = 220 * (1 - t);
  return `hsl(${hue}, 70%, 45%)`;
}

type ElixirState = {
  gameSpeedMultiplier: number;
  elixirSuitLevel: number;
  elixirGradeLevel: number;
  fishingUnlocked: boolean;
  fueled: boolean;
  gasolineGuzzler: boolean;
  fuelDurationUpgradeLevel: number;
  fuelSaveChanceUpgradeLevel: number;
};

const STORAGE_KEY = "obeliskfarm:web:drone_elixir_save.json:v2";
const STORAGE_KEY_V1 = "obeliskfarm:web:drone_elixir_save.json:v1";
const GEMEV_STORAGE_KEY = "obeliskfarm:web:gemev_save.json:v1";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

const DEFAULT: ElixirState = {
  gameSpeedMultiplier: 1,
  elixirSuitLevel: 8,
  elixirGradeLevel: 0,
  fishingUnlocked: true,
  fueled: false,
  gasolineGuzzler: true,
  fuelDurationUpgradeLevel: 19,
  fuelSaveChanceUpgradeLevel: 0,
};

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

function NumInput(props: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  decimals?: number;
  tooltip?: { title: string; lines: string[] };
}) {
  const { label, value, onChange, min = 0, max = 1e6, step = 1, suffix, decimals = 2, tooltip } = props;
  const isEditingRef = useRef(false);
  const [raw, setRaw] = useState<string>(() => (Number.isFinite(value) ? String(value) : ""));

  useEffect(() => {
    if (isEditingRef.current) return;
    setRaw(Number.isFinite(value) ? value.toFixed(decimals).replace(/\.?0+$/, "") : "");
  }, [value, decimals]);

  function commit() {
    const n = parseNumber(raw);
    const next = clamp(n, min, max);
    onChange(next);
    isEditingRef.current = false;
    setRaw(Number.isFinite(next) ? next.toFixed(decimals).replace(/\.?0+$/, "") : "");
  }

  const labelNode = tooltip ? (
    <span className="droneLabel">
      {label}{" "}
      <Tooltip content={{ title: tooltip.title, lines: tooltip.lines }} />
    </span>
  ) : (
    <span className="droneLabel">{label}</span>
  );

  return (
    <div className="droneRow">
      {labelNode}
      <div className="droneInputWrap">
        <input
          className="droneInput"
          type="text"
          inputMode="decimal"
          value={raw}
          onChange={(e) => {
            isEditingRef.current = true;
            setRaw(e.target.value);
          }}
          onBlur={() => commit()}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        {suffix ? <span className="droneSuffix">{suffix}</span> : null}
      </div>
    </div>
  );
}

function Stepper(props: {
  label: React.ReactNode;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  stepLarge?: number;
  suffix?: string;
  tooltip?: { title: string; lines: string[] };
}) {
  const { label, value, onChange, min, max, step = 1, stepLarge, suffix, tooltip } = props;
  const labelNode = tooltip ? (
    <span className="droneLabel">
      {label}{" "}
      <Tooltip content={{ title: tooltip.title, lines: tooltip.lines }} />
    </span>
  ) : (
    <span className="droneLabel">{label}</span>
  );
  const showLarge = stepLarge != null && stepLarge > step;
  const displayValue = step === Math.round(step) ? value : Number(value.toFixed(1));
  return (
    <div className="droneRow">
      {labelNode}
      <div className="droneStepperWrap">
        {showLarge ? (
          <button
            type="button"
            className="btn btnSecondary droneStepperBtn droneStepperBtnLarge"
            onClick={() => onChange(clamp(value - stepLarge, min, max))}
            disabled={value <= min}
            aria-label={`Decrease by ${stepLarge}`}
          >
            −{stepLarge}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btnSecondary droneStepperBtn"
          onClick={() => onChange(clamp(value - step, min, max))}
          disabled={value <= min}
          aria-label="Decrease"
        >
          −
        </button>
        <span className="droneStepperValue">
          {displayValue}
          {suffix ? suffix : ""}
        </span>
        <button
          type="button"
          className="btn droneStepperBtn"
          onClick={() => onChange(clamp(value + step, min, max))}
          disabled={value >= max}
          aria-label="Increase"
        >
          +
        </button>
        {showLarge ? (
          <button
            type="button"
            className="btn droneStepperBtn droneStepperBtnLarge"
            onClick={() => onChange(clamp(value + stepLarge, min, max))}
            disabled={value >= max}
            aria-label={`Increase by ${stepLarge}`}
          >
            +{stepLarge}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function migrateFromV1(saved: Record<string, unknown>): Partial<ElixirState> {
  const out: Partial<ElixirState> = {};
  if (typeof saved.elixirSuitLevel === "number") {
    if (typeof saved.numRandomBuffs === "number") {
      out.fishingUnlocked = saved.numRandomBuffs >= ELIXIR_NUM_BUFFS_WITH_FISHING;
    }
    if (typeof saved.gameSpeedMultiplier !== "number" && typeof saved.gameSpeed2xActive === "boolean") {
      out.gameSpeedMultiplier = saved.gameSpeed2xActive ? 2 : 1;
    }
    return { ...saved, ...out } as Partial<ElixirState>;
  }
  if (typeof saved.timeBetweenBuffsSec === "number") {
    out.elixirSuitLevel = Math.round(
      (ELIXIR_BASE_INTERVAL_SEC - saved.timeBetweenBuffsSec) / ELIXIR_SUIT_SEC_PER_LEVEL,
    );
    out.elixirSuitLevel = clamp(out.elixirSuitLevel, 0, 20);
  }
  if (typeof saved.fueledBuffDurationPct === "number") {
    out.elixirGradeLevel = Math.round(
      (saved.fueledBuffDurationPct - ELIXIR_FUEL_BUFF_BASE_PCT) / ELIXIR_FUEL_BUFF_PCT_PER_GRADE,
    );
    out.elixirGradeLevel = clamp(out.elixirGradeLevel, 0, 45);
  }
  if (typeof saved.numRandomBuffs === "number") {
    out.fishingUnlocked = saved.numRandomBuffs >= ELIXIR_NUM_BUFFS_WITH_FISHING;
  }
  if (typeof saved.fuelDurationMultPct === "number") {
    out.fuelDurationUpgradeLevel = Math.round(saved.fuelDurationMultPct - 100);
    out.fuelDurationUpgradeLevel = clamp(out.fuelDurationUpgradeLevel, 0, COAL_FUEL_DURATION_MAX_LEVEL);
  }
  if (typeof saved.fuelSaveChancePct === "number") {
    out.fuelSaveChanceUpgradeLevel = Math.round(saved.fuelSaveChancePct);
    out.fuelSaveChanceUpgradeLevel = clamp(out.fuelSaveChanceUpgradeLevel, 0, COAL_FUEL_SAVE_MAX_LEVEL);
  }
  return { ...saved, ...out } as Partial<ElixirState>;
}

export function Drone() {
  const [state, setState] = useState<ElixirState>(() => {
    const saved = loadJson<Record<string, unknown>>(STORAGE_KEY)
      ?? loadJson<Record<string, unknown>>(STORAGE_KEY_V1);
    const migrated = saved ? migrateFromV1(saved) : {};
    const s = { ...DEFAULT, ...migrated } as ElixirState;
    s.gameSpeedMultiplier = clamp(s.gameSpeedMultiplier, 1, 10);
    s.fuelDurationUpgradeLevel = clamp(s.fuelDurationUpgradeLevel, 0, COAL_FUEL_DURATION_MAX_LEVEL);
    s.fuelSaveChanceUpgradeLevel = clamp(s.fuelSaveChanceUpgradeLevel, 0, COAL_FUEL_SAVE_MAX_LEVEL);
    return s;
  });

  useEffect(() => {
    saveJson(STORAGE_KEY, state);
  }, [state]);

  const update = useMemo(
    () => (patch: Partial<ElixirState>) => setState((s) => ({ ...s, ...patch })),
    [],
  );

  const gameSpeedMult = (() => {
    const base = defaultGameParameters();
    const saved = loadJson<{ params?: Partial<GameParameters> }>(GEMEV_STORAGE_KEY);
    const merged: GameParameters = { ...base, ...(saved?.params ?? {}) };
    let mult = "game_speed_multiplier" in merged ? merged.game_speed_multiplier : 1.0;
    const gameSpeedPct = (merged as { game_speed_pct?: number }).game_speed_pct;
    if (mult === 1.0 && typeof gameSpeedPct === "number" && gameSpeedPct > 0)
      mult = 1.0 + clampInt(gameSpeedPct, 0, 12) / 100.0;
    return getGameSpeedMultiplier({ ...merged, game_speed_multiplier: clamp(Number(mult), 1.0, 10.0) });
  })();
  const suitLevel = clamp(Math.round(state.elixirSuitLevel), 0, 20);
  const intervalSecBase = Math.max(1, ELIXIR_BASE_INTERVAL_SEC - suitLevel * ELIXIR_SUIT_SEC_PER_LEVEL);
  const intervalSec = intervalSecBase / gameSpeedMult;
  const numBuffs = state.fishingUnlocked ? ELIXIR_NUM_BUFFS_WITH_FISHING : ELIXIR_NUM_BUFFS_WITHOUT_FISHING;
  const fueledBuffDurationPct = ELIXIR_FUEL_BUFF_BASE_PCT + state.elixirGradeLevel * ELIXIR_FUEL_BUFF_PCT_PER_GRADE;
  const fuelDurationFromGradeSec = ELIXIR_FUEL_DURATION_BASE_SEC + state.elixirGradeLevel * ELIXIR_FUEL_DURATION_SEC_PER_GRADE;
  // Coal Fuel Duration and Gasoline Guzzler are multiplicative: e.g. 1.19 × 1.2
  const fuelDurationGameSec =
    fuelDurationFromGradeSec *
    (1 + state.fuelDurationUpgradeLevel / 100) *
    (state.gasolineGuzzler ? 1 + GASOLINE_GUZZLER_FUEL_DURATION_PCT / 100 : 1);
  const fuelDurationSecReal = fuelDurationGameSec / gameSpeedMult;

  const fuelMult = state.fueled ? 1 + fueledBuffDurationPct / 100 : 1;
  const buffDurations = useMemo(() => {
    const list = ELIXIR_BUFFS.filter((b) => b.id !== "3xfishing" || state.fishingUnlocked);
    const maxSec = Math.max(
      ...list.map((b) =>
        b.realTimeOnly ? b.baseSec * fuelMult : (b.baseSec * fuelMult) / gameSpeedMult,
      ),
      1,
    );
    return list
      .map((b) => {
        const sec = b.realTimeOnly ? b.baseSec * fuelMult : (b.baseSec * fuelMult) / gameSpeedMult;
        return { ...b, sec, pct: (sec / maxSec) * 100 };
      })
      .sort((a, b) => a.sec - b.sec);
  }, [state.fueled, state.fishingUnlocked, fueledBuffDurationPct, fuelMult, gameSpeedMult]);

  const droneBomb10xMinPerHour = useMemo(() => {
    const cycleSec = numBuffs * intervalSec;
    if (cycleSec <= 0) return 0;
    const b = buffDurations.find((x) => x.id === "10xbomb");
    if (!b) return 0;
    return Math.min(60, (b.sec / cycleSec) * 60);
  }, [numBuffs, intervalSec, buffDurations]);

  useEffect(() => {
    const ext = loadJson<{ lootbugBomb10xMinPerHour?: number; droneBomb10xMinPerHour?: number }>(GEMEV_EXTERNAL_KEY) ?? {};
    ext.droneBomb10xMinPerHour = droneBomb10xMinPerHour;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [droneBomb10xMinPerHour]);

  return (
    <div className="droneGrid">
      <div className={`droneGameSpeedToggle ${gameSpeedMult > 1 ? "droneGameSpeedToggleOn" : ""}`}>
        <div className="droneGameSpeedReadOnly">
          <span className="droneLabel">
            Game speed
            <Tooltip
              content={{
                title: "Game speed",
                sections: [
                  {
                    heading: "Source",
                    lines: [
                      "Taken from Gem EV Calculator. Same value as Stats screen.",
                      "Time between buffs and fuel duration in real time = game time ÷ game speed.",
                    ],
                  },
                  { heading: "Edit", lines: ["Change it in the Gem EV Calculator module."] },
                ],
              }}
            />
          </span>
          <span className="droneStepperValue">{gameSpeedMult.toFixed(2)}×</span>
        </div>
        <p className="droneHint" style={{ marginTop: 6, marginBottom: 0 }}>
          When &gt; 1×: time between buffs and fuel duration in real time = game time ÷ speed.
        </p>
      </div>

      <Collapsible id="drone-elixir" title="Elixir Drone" defaultExpanded={true}>
        <div className="droneSection">
          <div className="droneSectionTitle">Settings</div>

          <Stepper
            label="Elixir Suit level"
            value={state.elixirSuitLevel}
            onChange={(n) => update({ elixirSuitLevel: n })}
            min={0}
            max={20}
            step={1}
            stepLarge={5}
            tooltip={{
              title: "Elixir Suit upgrade level",
              lines: [
                "Time Between Buffs −15 s per level (base max 5; Coal/Skill Tree can raise cap).",
                "Computed time between buffs shown below.",
              ],
            }}
          />
          <div className="droneRow">
            <span className="droneLabel">→ Time between buffs</span>
            <span className="droneStepperValue">
              {intervalSec.toFixed(1)} s{gameSpeedMult > 1 ? " (real)" : ""}
            </span>
          </div>

          <div className="droneCheckboxRow">
            <img
              src="https://static.wikitide.net/shminerwiki/f/fb/Fishing_Button.png"
              alt=""
              className="droneSkillIcon"
              aria-hidden
            />
            <input
              id="elixir-fishing"
              type="checkbox"
              className="droneCheckbox"
              checked={state.fishingUnlocked}
              onChange={(e) => update({ fishingUnlocked: e.target.checked })}
            />
            <label htmlFor="elixir-fishing" className="droneLabel">
              Fishing unlocked (Ob 37)
            </label>
            <Tooltip
              content={{
                title: "Random buff count",
                lines: [
                  "With Fishing: 10 random buffs. Without (pre-Ob 37): 9 buffs (no 3× Fishing Tick Speed).",
                ],
              }}
            />
          </div>

          <div className="droneCheckboxRow">
            <img
              src="https://static.wikitide.net/shminerwiki/4/44/Fuel.png"
              alt=""
              className="droneSkillIcon"
              aria-hidden
            />
            <input
              id="elixir-fueled"
              type="checkbox"
              className="droneCheckbox"
              checked={state.fueled}
              onChange={(e) => update({ fueled: e.target.checked })}
            />
            <label htmlFor="elixir-fueled" className="droneLabel">
              Drone fueled (Elixir fuel buff extends buff duration)
            </label>
          </div>

          {state.fueled ? (
            <div className="droneSubSection">
              <div className="droneSubTitle">When fueled</div>
              <Stepper
                label="Grade level"
                value={state.elixirGradeLevel}
                onChange={(n) => update({ elixirGradeLevel: n })}
                min={0}
                max={45}
                step={1}
                stepLarge={5}
                tooltip={{
                  title: "Grade level (fuel buff)",
                  lines: [
                    "Buff duration: +60% at grade 0, +6% per grade.",
                    "Effective: +" + fueledBuffDurationPct + "% buff duration.",
                  ],
                }}
              />
              <div className="droneRow">
                <span className="droneLabel">→ Buff duration bonus</span>
                <span className="droneStepperValue">+{fueledBuffDurationPct}%</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="droneSection">
          <div className="droneSectionTitle">Fuel</div>
          <div className="droneRow">
            <span className="droneLabel">1 fuel lasts (game time)</span>
            <span className="droneStepperValue">
              {(fuelDurationGameSec / 60).toFixed(1)} min
            </span>
          </div>
          <div className="droneRow">
            <span className="droneLabel">1 fuel lasts (real time)</span>
            <span className="droneStepperValue">
              {fuelDurationSecReal >= 60
                ? Math.floor(fuelDurationSecReal / 60) + ":" + String(Math.round(fuelDurationSecReal % 60)).padStart(2, "0")
                : Math.round(fuelDurationSecReal) + " s"}
            </span>
          </div>
          <div className="droneCheckboxRow">
            <img
              src="https://static.wikitide.net/shminerwiki/c/c7/Gasoline_Guzzler.png"
              alt=""
              className="droneSkillIcon"
              aria-hidden
            />
            <input
              id="elixir-gasoline-guzzler"
              type="checkbox"
              className="droneCheckbox"
              checked={state.gasolineGuzzler}
              onChange={(e) => update({ gasolineGuzzler: e.target.checked })}
            />
            <label htmlFor="elixir-gasoline-guzzler" className="droneLabel">
              Gasoline Guzzler skill (+20% fuel duration)
            </label>
          </div>
          <p className="droneHint" style={{ marginTop: 4, marginBottom: 0 }}>
            From Drone Buffs table: 3:30 at grade 0, +0:10.5 per grade; × (1 + Coal Fuel Duration %); × 1.2 if Gasoline Guzzler. Real time = game time ÷ game speed.
          </p>
          <div className="droneSubTitle">Coal Upgrades (level with +/−)</div>
          <Stepper
            label="Fuel Duration +1% / level"
            value={state.fuelDurationUpgradeLevel}
            onChange={(n) => update({ fuelDurationUpgradeLevel: n })}
            min={0}
            max={COAL_FUEL_DURATION_MAX_LEVEL}
            step={1}
            stepLarge={5}
            suffix=""
            tooltip={{
              title: "Fuel Duration",
              lines: ["Coal Upgrade: Fuel Duration +1% per level, max 20. Effective: +" + state.fuelDurationUpgradeLevel + "%."],
            }}
          />
          <div className="droneRow">
            <span className="droneLabel">→ Fuel duration</span>
            <span className="droneStepperValue">+{state.fuelDurationUpgradeLevel}%</span>
          </div>
          <Stepper
            label="Fuel Save Chance +1% / level"
            value={state.fuelSaveChanceUpgradeLevel}
            onChange={(n) => update({ fuelSaveChanceUpgradeLevel: n })}
            min={0}
            max={COAL_FUEL_SAVE_MAX_LEVEL}
            step={1}
            stepLarge={5}
            suffix=""
            tooltip={{
              title: "Fuel Save Chance",
              lines: ["Coal Upgrade: Fuel Save Chance +1% per level, max 20."],
            }}
          />
        </div>

        <div className="droneSection">
          <div className="droneSectionTitle">Buff durations (real time)</div>
          <p className="droneHint" style={{ marginBottom: 10 }}>
            Duration depends on game speed, fueled grade (when fueled), and for 3× Fishing Tick: real time only (Ob 37).
          </p>
          {(() => {
            const totalSec = buffDurations.reduce((s, b) => s + b.sec, 0);
            const cycleSec = numBuffs * intervalSec;
            const expectedBuffsActive = numBuffs > 0 && intervalSec > 0
              ? totalSec / cycleSec
              : 0;
            const star = buffDurations.find((b) => b.id === "2xstar");
            const superStar = buffDurations.find((b) => b.id === "3xsuper");
            const pStar = cycleSec > 0 && star ? Math.min(1, star.sec / cycleSec) : 0;
            const pSuper = cycleSec > 0 && superStar ? Math.min(1, superStar.sec / cycleSec) : 0;
            const starSuperOverlapPct = (pStar * pSuper) * 100;
            return (
              <div className="droneBuffPlotSummaryBlock">
                <div className="droneBuffPlotSummary">
                  <span className="droneBuffPlotSummaryLabel">
                    Expected buffs active at once
                    <Tooltip
                      content={{
                        title: "Expected overlap",
                        lines: [
                          "With uniform random buffs every interval: average number of buffs active at any time.",
                          "Formula: sum of all buff durations ÷ (number of buffs × time between buffs).",
                        ],
                      }}
                    />
                  </span>
                  <span className="droneBuffPlotSummaryValue">{expectedBuffsActive.toFixed(2)}</span>
                </div>
                <div className="droneBuffPlotSummary">
                  <span className="droneBuffPlotSummaryLabel">
                    Star + Super Star overlap
                    <Tooltip
                      content={{
                        title: "Star & Super Star overlap",
                        lines: [
                          "Approximate probability that 2× Star Spawn Rate and 3× Super Star Spawn Rate are both active at the same time.",
                          "Uptime(Star) × Uptime(Super Star), assuming independence.",
                        ],
                      }}
                    />
                  </span>
                  <span className="droneBuffPlotSummaryValue">{starSuperOverlapPct.toFixed(2)}%</span>
                </div>
              </div>
            );
          })()}
          <div className="droneBuffPlot">
            <div className="droneBuffPlotRow droneBuffPlotHeader">
              <span className="droneBuffPlotLabel" />
              <span className="droneBuffPlotBarHeader">Duration</span>
              <span className="droneBuffPlotRightHeader">
                min/h
                <Tooltip
                  content={{
                    title: "min/h",
                    lines: [
                      "Average minutes per hour this buff is active.",
                      "Uptime × 60; max 60 min/h.",
                    ],
                  }}
                  label="?"
                />
              </span>
              <span className="droneBuffPlotRightHeader">
                Uptime
                <Tooltip
                  content={{
                    title: "Uptime",
                    lines: [
                      "Expected fraction of time this buff is active (100% = always on).",
                      "Formula: duration ÷ (number of buffs × time between buffs).",
                    ],
                  }}
                  label="?"
                />
              </span>
            </div>
            {buffDurations.map((b) => {
              const cycleSec = numBuffs * intervalSec;
              const uptimePct = cycleSec > 0 ? Math.min(100, (b.sec / cycleSec) * 100) : 0;
              const minPerHour = cycleSec > 0 ? Math.min(60, (b.sec / cycleSec) * 60) : 0;
              return (
                <div key={b.id} className="droneBuffPlotRow">
                  <span className="droneBuffPlotLabel">
                    <img src={b.icon} alt="" className="droneBuffIcon" aria-hidden />
                    {b.label}
                  </span>
                  <div className="droneBuffPlotBarWrap">
                    <span className="droneBuffPlotValue">{formatMinSec(b.sec)}</span>
                    <div className="droneBuffPlotBarBg">
                      <div
                        className="droneBuffPlotBar"
                        style={{ width: `${b.pct}%`, background: heatmapColor(b.pct) }}
                      />
                    </div>
                  </div>
                  <span className="droneBuffPlotRight">{minPerHour.toFixed(1)}</span>
                  <span className="droneBuffPlotRight">{uptimePct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
