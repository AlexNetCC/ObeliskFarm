import { useEffect, useMemo, useRef, useState } from "react";
import "./drone.css";
import { Tooltip } from "../../components/Tooltip";
import { Collapsible } from "../../components/Collapsible";
import { assetUrl } from "../../lib/assets";
import { loadJson, saveJson } from "../../lib/storage";

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
  suffix?: string;
  tooltip?: { title: string; lines: string[] };
}) {
  const { label, value, onChange, min, max, step = 1, suffix, tooltip } = props;
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
      <div className="droneStepperWrap">
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
          {value}
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
      </div>
    </div>
  );
}

function computeUptime(
  intervalSec: number,
  durationSec: number,
  numBuffs: number,
): number {
  if (intervalSec <= 0 || numBuffs <= 0) return 0;
  const cycleSec = intervalSec * numBuffs;
  return (durationSec / cycleSec) * 100;
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

  const gameSpeedMult = clamp(state.gameSpeedMultiplier, 1, 10);
  const suitLevel = clamp(Math.round(state.elixirSuitLevel), 0, 20);
  const intervalSecBase = Math.max(1, ELIXIR_BASE_INTERVAL_SEC - suitLevel * ELIXIR_SUIT_SEC_PER_LEVEL);
  const intervalSec = intervalSecBase / gameSpeedMult;
  const baseDurationSec = GAME_SPEED_2X_BUFF_DURATION_SEC / gameSpeedMult;
  const numBuffs = state.fishingUnlocked ? ELIXIR_NUM_BUFFS_WITH_FISHING : ELIXIR_NUM_BUFFS_WITHOUT_FISHING;
  const fueledBuffDurationPct = ELIXIR_FUEL_BUFF_BASE_PCT + state.elixirGradeLevel * ELIXIR_FUEL_BUFF_PCT_PER_GRADE;
  const fueledDurationSec = state.fueled
    ? baseDurationSec * (1 + fueledBuffDurationPct / 100)
    : baseDurationSec;
  const fuelDurationFromGradeSec = ELIXIR_FUEL_DURATION_BASE_SEC + state.elixirGradeLevel * ELIXIR_FUEL_DURATION_SEC_PER_GRADE;
  // Coal Fuel Duration and Gasoline Guzzler are multiplicative: e.g. 1.19 × 1.2
  const fuelDurationGameSec =
    fuelDurationFromGradeSec *
    (1 + state.fuelDurationUpgradeLevel / 100) *
    (state.gasolineGuzzler ? 1 + GASOLINE_GUZZLER_FUEL_DURATION_PCT / 100 : 1);
  const fuelDurationSecReal = fuelDurationGameSec / gameSpeedMult;

  const uptimeUnfueledPct = computeUptime(intervalSec, baseDurationSec, numBuffs);
  const uptimeFueledPct = computeUptime(intervalSec, fueledDurationSec, numBuffs);
  const has100IfGuaranteed = baseDurationSec >= intervalSec;
  const has100FueledIfGuaranteed = fueledDurationSec >= intervalSec;

  return (
    <div className="droneGrid">
      <Collapsible id="drone-elixir" title="Elixir Drone" defaultExpanded={true}>
        <div className={`droneGameSpeedToggle ${gameSpeedMult > 1 ? "droneGameSpeedToggleOn" : ""}`}>
          <NumInput
            label="Game speed"
            value={state.gameSpeedMultiplier}
            onChange={(n) => update({ gameSpeedMultiplier: n })}
            min={1}
            max={10}
            step={0.1}
            suffix="×"
            decimals={1}
            tooltip={{
              title: "Game speed",
              lines: [
                "Current game speed multiplier (e.g. 2 = 2×, 2.1 = 2.1×).",
                "Time between buffs and fuel duration in real time = game time ÷ this value.",
              ],
            }}
          />
          <p className="droneHint" style={{ marginTop: 6, marginBottom: 0 }}>
            When &gt; 1×: time between buffs and fuel duration in real time = game time ÷ speed.
          </p>
        </div>

        <div className="droneSection">
          <div className="droneSectionTitle">Settings</div>

          <Stepper
            label="Elixir Suit level"
            value={state.elixirSuitLevel}
            onChange={(n) => update({ elixirSuitLevel: n })}
            min={0}
            max={20}
            step={1}
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

          <div className="droneRow">
            <span className="droneLabel">2× Game Speed duration</span>
            <span className="droneStepperValue">
              {gameSpeedMult > 1
                ? (GAME_SPEED_2X_BUFF_DURATION_SEC / gameSpeedMult).toFixed(0) + " s (real)"
                : "120 s (2 min)"}
            </span>
          </div>

          <div className="droneCheckboxRow">
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
          <div className="droneSectionTitle">Fuel duration (Elixir drone)</div>
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
            suffix=""
            tooltip={{
              title: "Fuel Save Chance",
              lines: ["Coal Upgrade: Fuel Save Chance +1% per level, max 20."],
            }}
          />
        </div>

        <div className="droneSection droneResult">
          <div className="droneSectionTitle">Results</div>
          <div className="droneResultLine">
            <span>Effective 2× Game Speed duration</span>
            <span className="droneResultValue">
              {(state.fueled ? fueledDurationSec : baseDurationSec).toFixed(1)} s
            </span>
          </div>
          <div className="droneResultLine">
            <span>Average 2× Game Speed uptime</span>
            <span className={`droneResultValue ${(state.fueled ? uptimeFueledPct : uptimeUnfueledPct) >= 100 ? "good" : ""}`}>
              {(state.fueled ? uptimeFueledPct : uptimeUnfueledPct).toFixed(1)}%
            </span>
          </div>
          <div className="droneHint">
            {has100IfGuaranteed
              ? "If 2× Game Speed were guaranteed every trigger, you would have 100% uptime (duration ≥ interval)."
              : "For 100% uptime with guaranteed 2× Game Speed: reduce interval to ≤ " +
                baseDurationSec.toFixed(0) +
                " s or extend duration to ≥ " +
                intervalSec.toFixed(0) +
                " s."}
            {state.fueled && !has100IfGuaranteed && has100FueledIfGuaranteed && (
              " With current fueled duration, 100% uptime would be possible if 2× Game Speed were guaranteed."
            )}
          </div>
        </div>

        <div className="droneSection droneFuelCost">
          <div className="droneFuelCostLine">
            <img src={assetUrl("sprites/common/gem.png")} alt="" className="droneFuelCostIcon" aria-hidden />
            <span>5 gems per fuel</span>
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
