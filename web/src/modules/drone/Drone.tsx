import { useEffect, useMemo, useRef, useState } from "react";
import "./drone.css";
import { Tooltip } from "../../components/Tooltip";
import { Collapsible } from "../../components/Collapsible";
import { loadJson, saveJson } from "../../lib/storage";
import { calculateGemBombGemsPerHour, defaultGameParameters, getGameSpeedMultiplier, type GameParameters } from "../../lib/gemev/freebieEv";

const ELIXIR_BASE_INTERVAL_SEC = 360;
const ELIXIR_SUIT_SEC_PER_LEVEL = 15;
const ELIXIR_FUEL_BUFF_BASE_PCT = 60;
const ELIXIR_FUEL_BUFF_PCT_PER_GRADE = 6;
/** No cap: coal upgrades can go beyond former max 20. */
const COAL_UPGRADE_MAX = 9999;
/** 2× Game Speed buff: 2 min base; halved in real time when 2× Game Speed is active. */
const GAME_SPEED_2X_BUFF_DURATION_SEC = 120;
const ELIXIR_NUM_BUFFS_WITH_FISHING = 10;
const ELIXIR_NUM_BUFFS_WITHOUT_FISHING = 9;
/** Elixir fuel duration from Drone Buffs table: 3:30 at grade 0, +0:10.5 per grade. Then × (1 + Coal Fuel Duration %). */
const ELIXIR_FUEL_DURATION_BASE_SEC = 210; // 3:30
const ELIXIR_FUEL_DURATION_SEC_PER_GRADE = 10.5; // +0:10.5
/** Frogger fuel duration: 3:00 at grade 0, +0:09 per grade. */
const FROGGER_FUEL_DURATION_BASE_SEC = 180; // 3:00
const FROGGER_FUEL_DURATION_SEC_PER_GRADE = 9; // +0:09
/** Frogger Suit: fires a random bomb every 30 s base; −1.5 s per suit level. */
const FROGGER_BASE_INTERVAL_SEC = 30;
const FROGGER_SUIT_SEC_PER_LEVEL = 1.5;
/** When fueled: 5 bombs per autofire, +1 per grade (no charge consumed). */
const FROGGER_FUEL_BOMBS_BASE = 5;
const FROGGER_FUEL_BOMBS_PER_GRADE = 1;

/** Bomb Bear Drone: +30% Lootbug Spawn Rate / 4:00 at grade 0, +3% / +0:12 per grade. Max +90% / 8:00 (Polychrome). */
const BOMB_BEAR_LOOTBUG_SPAWN_PCT_BASE = 30;
const BOMB_BEAR_LOOTBUG_SPAWN_PCT_PER_GRADE = 3;
const BOMB_BEAR_LOOTBUG_SPAWN_PCT_MAX = 90;
const BOMB_BEAR_FUEL_DURATION_BASE_SEC = 240; // 4:00
const BOMB_BEAR_FUEL_DURATION_SEC_PER_GRADE = 12; // +0:12

/** Angler Drone: 2 Fishing Ticks every 1140 s (game time). Suit: Time Between Fishing Ticks −40 s (e.g. −2 s per level → 1100 s at 20). */
const ANGLER_BASE_INTERVAL_SEC = 1140;
const ANGLER_TICKS_PER_INTERVAL = 2;
const ANGLER_SUIT_SEC_PER_LEVEL = 2; // 1140 - 20*2 = 1100
/** Angler fuel duration: same pattern as Frogger (3:00 + 0:09 per grade). */
const ANGLER_FUEL_DURATION_BASE_SEC = 180;
const ANGLER_FUEL_DURATION_SEC_PER_GRADE = 9;

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

const FUEL_SAVE_CHANCE_ICON = "https://static.wikitide.net/shminerwiki/1/1a/Fuel_Save_Chance.png";
const COAL_ICON = "https://static.wikitide.net/shminerwiki/thumb/a/a7/Coal.png/30px-Coal.png";
const UPGRADES_ICON = "https://static.wikitide.net/shminerwiki/4/4b/Upgrades_Button.png";

/** Misc Fuel card tier: 0 = none (1×), 1 = Card (1.02×), 2 = Gilded (1.05×), 3 = Polychrome (1.10×). */
export type MiscFuelCardTier = 0 | 1 | 2 | 3;

const MISC_FUEL_MULT: Record<MiscFuelCardTier, number> = { 0: 1, 1: 1.02, 2: 1.05, 3: 1.1 };

type ElixirState = {
  gameSpeedMultiplier: number;
  /** Elixir Drone enabled (ON). When OFF, contributions to Gem EV/fuel are zero. */
  elixirDroneOn: boolean;
  elixirSuitLevel: number;
  elixirGradeLevel: number;
  fishingUnlocked: boolean;
  fueled: boolean;
  gasolineGuzzler: boolean;
  fuelDurationUpgradeLevel: number;
  fuelSaveChanceUpgradeLevel: number;
  /** Upgrade Fuel Save Chance (%), multiplicative with Coal Fuel Save. Decimal allowed. */
  upgradeFuelSaveChancePct: number;
  /** Misc Fuel card: Fuel Duration 1.02× / 1.05× / 1.10× (card / gild / poly). */
  miscFuelCardTier: MiscFuelCardTier;
  /** Relic: Fuel Duration +0.01% per level (multiplicative). */
  fuelDurationRelicLevel: number;
  /** Axolotl Skin: +10% fuel duration (multiplicative). */
  axolotlSkin: boolean;
  /** World 3 upgrade: Fuel Duration +0.15% per level (multiplicative). */
  fuelDurationWorld3Level: number;
  /** Frogger Drone */
  /** Frogger Drone enabled (ON). When OFF, contributions to Gem EV/fuel are zero. */
  froggerDroneOn: boolean;
  froggerSuitLevel: number;
  froggerGradeLevel: number;
  froggerFueled: boolean;
  /** Bomb Bear Drone: when fueled, +X% Lootbug Spawn Rate (multiplicative with Lootbug stats). */
  bombBearDroneOn: boolean;
  bombBearGradeLevel: number;
  bombBearFueled: boolean;
  /** Angler Drone: gives fishing ticks; when fueled, buff (extra ticks / legendary % / duration). */
  anglerDroneOn: boolean;
  anglerSuitLevel: number;
  anglerGradeLevel: number;
  anglerFueled: boolean;
};

const STORAGE_KEY = "obeliskfarm:web:drone_elixir_save.json:v4";
const STORAGE_KEY_V3 = "obeliskfarm:web:drone_elixir_save.json:v3";
const STORAGE_KEY_V2 = "obeliskfarm:web:drone_elixir_save.json:v2";
const STORAGE_KEY_V1 = "obeliskfarm:web:drone_elixir_save.json:v1";
const GEMEV_STORAGE_KEY = "obeliskfarm:web:gemev_save.json:v1";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";
const GEM_ICON = "https://static.wikitide.net/shminerwiki/a/aa/Gem.png";
/** 1 fuel = 5 gems (in-game cost). */
const GEMS_PER_FUEL = 5;

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

const DEFAULT: ElixirState = {
  gameSpeedMultiplier: 1,
  elixirDroneOn: true,
  elixirSuitLevel: 8,
  elixirGradeLevel: 0,
  fishingUnlocked: true,
  fueled: false,
  gasolineGuzzler: true,
  fuelDurationUpgradeLevel: 19,
  fuelSaveChanceUpgradeLevel: 0,
  upgradeFuelSaveChancePct: 0,
  miscFuelCardTier: 0,
  fuelDurationRelicLevel: 0,
  axolotlSkin: false,
  fuelDurationWorld3Level: 0,
  froggerDroneOn: true,
  froggerSuitLevel: 8,
  froggerGradeLevel: 0,
  froggerFueled: false,
  bombBearDroneOn: true,
  bombBearGradeLevel: 0,
  bombBearFueled: false,
  anglerDroneOn: true,
  anglerSuitLevel: 0,
  anglerGradeLevel: 0,
  anglerFueled: false,
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
  iconUrl?: string;
}) {
  const { label, value, onChange, min = 0, max = 1e6, step = 1, suffix, decimals = 2, tooltip, iconUrl } = props;
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

  const labelContent = (
    <>
      {iconUrl ? <img src={iconUrl} alt="" className="droneSkillIcon" aria-hidden /> : null}
      <span>{label}</span>
      {tooltip ? <Tooltip content={{ title: tooltip.title, lines: tooltip.lines }} /> : null}
    </>
  );
  const labelNode = (
    <span className="droneLabel" style={iconUrl ? { display: "inline-flex", alignItems: "center", gap: 8 } : undefined}>
      {labelContent}
    </span>
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
    if (typeof saved.numRandomBuffs === "number" && typeof saved.fishingUnlocked !== "boolean") {
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
  if (typeof saved.numRandomBuffs === "number" && typeof saved.fishingUnlocked !== "boolean") {
    out.fishingUnlocked = saved.numRandomBuffs >= ELIXIR_NUM_BUFFS_WITH_FISHING;
  }
  if (typeof saved.fuelDurationMultPct === "number") {
    out.fuelDurationUpgradeLevel = Math.round(saved.fuelDurationMultPct - 100);
    out.fuelDurationUpgradeLevel = clamp(out.fuelDurationUpgradeLevel, 0, COAL_UPGRADE_MAX);
  }
  if (typeof saved.fuelSaveChancePct === "number") {
    out.fuelSaveChanceUpgradeLevel = Math.round(saved.fuelSaveChancePct);
    out.fuelSaveChanceUpgradeLevel = clamp(out.fuelSaveChanceUpgradeLevel, 0, COAL_UPGRADE_MAX);
  }
  return { ...saved, ...out } as Partial<ElixirState>;
}

function migrateFromV2(migrated: Partial<ElixirState>): Partial<ElixirState> {
  return {
    ...migrated,
    bombBearDroneOn: typeof migrated.bombBearDroneOn === "boolean" ? migrated.bombBearDroneOn : DEFAULT.bombBearDroneOn,
    bombBearGradeLevel: clamp(migrated.bombBearGradeLevel ?? DEFAULT.bombBearGradeLevel, 0, 45),
    bombBearFueled: typeof migrated.bombBearFueled === "boolean" ? migrated.bombBearFueled : DEFAULT.bombBearFueled,
  };
}

function migrateFromV3(migrated: Partial<ElixirState>): Partial<ElixirState> {
  return {
    ...migrated,
    anglerDroneOn: typeof migrated.anglerDroneOn === "boolean" ? migrated.anglerDroneOn : DEFAULT.anglerDroneOn,
    anglerSuitLevel: clamp(migrated.anglerSuitLevel ?? DEFAULT.anglerSuitLevel, 0, 20),
    anglerGradeLevel: clamp(migrated.anglerGradeLevel ?? DEFAULT.anglerGradeLevel, 0, 45),
    anglerFueled: typeof migrated.anglerFueled === "boolean" ? migrated.anglerFueled : DEFAULT.anglerFueled,
  };
}

export function Drone() {
  const [state, setState] = useState<ElixirState>(() => {
    const saved = loadJson<Record<string, unknown>>(STORAGE_KEY)
      ?? loadJson<Record<string, unknown>>(STORAGE_KEY_V3)
      ?? loadJson<Record<string, unknown>>(STORAGE_KEY_V2)
      ?? loadJson<Record<string, unknown>>(STORAGE_KEY_V1);
    const migrated = saved ? migrateFromV3(migrateFromV2(migrateFromV1(saved))) : {};
    const s = { ...DEFAULT, ...migrated } as ElixirState;
    s.gameSpeedMultiplier = clamp(s.gameSpeedMultiplier, 1, 10);
    s.fuelDurationUpgradeLevel = clamp(s.fuelDurationUpgradeLevel, 0, COAL_UPGRADE_MAX);
    s.fuelSaveChanceUpgradeLevel = clamp(s.fuelSaveChanceUpgradeLevel, 0, COAL_UPGRADE_MAX);
    s.upgradeFuelSaveChancePct = clamp(s.upgradeFuelSaveChancePct ?? DEFAULT.upgradeFuelSaveChancePct, 0, 100);
    s.miscFuelCardTier = clamp(Math.round(Number(s.miscFuelCardTier ?? 0)), 0, 3) as MiscFuelCardTier;
    s.fuelDurationRelicLevel = Math.max(0, Math.trunc(Number(s.fuelDurationRelicLevel ?? 0)));
    // Restore checkboxes from saved so they persist (avoid undefined from old saves)
    s.elixirDroneOn = typeof migrated.elixirDroneOn === "boolean" ? migrated.elixirDroneOn : DEFAULT.elixirDroneOn;
    s.fishingUnlocked = typeof migrated.fishingUnlocked === "boolean" ? migrated.fishingUnlocked : DEFAULT.fishingUnlocked;
    s.fueled = typeof migrated.fueled === "boolean" ? migrated.fueled : DEFAULT.fueled;
    s.gasolineGuzzler = typeof migrated.gasolineGuzzler === "boolean" ? migrated.gasolineGuzzler : DEFAULT.gasolineGuzzler;
    s.axolotlSkin = typeof migrated.axolotlSkin === "boolean" ? migrated.axolotlSkin : DEFAULT.axolotlSkin;
    s.fuelDurationWorld3Level = Math.max(0, Math.trunc(Number(s.fuelDurationWorld3Level ?? 0)));
    s.froggerSuitLevel = clamp(s.froggerSuitLevel ?? DEFAULT.froggerSuitLevel, 0, 20);
    s.froggerGradeLevel = clamp(s.froggerGradeLevel ?? DEFAULT.froggerGradeLevel, 0, 45);
    s.froggerDroneOn = typeof migrated.froggerDroneOn === "boolean" ? migrated.froggerDroneOn : DEFAULT.froggerDroneOn;
    s.froggerFueled = typeof migrated.froggerFueled === "boolean" ? migrated.froggerFueled : DEFAULT.froggerFueled;
    s.bombBearDroneOn = typeof migrated.bombBearDroneOn === "boolean" ? migrated.bombBearDroneOn : DEFAULT.bombBearDroneOn;
    s.bombBearGradeLevel = clamp(s.bombBearGradeLevel ?? DEFAULT.bombBearGradeLevel, 0, 45);
    s.bombBearFueled = typeof migrated.bombBearFueled === "boolean" ? migrated.bombBearFueled : DEFAULT.bombBearFueled;
    s.anglerDroneOn = typeof migrated.anglerDroneOn === "boolean" ? migrated.anglerDroneOn : DEFAULT.anglerDroneOn;
    s.anglerSuitLevel = clamp(s.anglerSuitLevel ?? DEFAULT.anglerSuitLevel, 0, 20);
    s.anglerGradeLevel = clamp(s.anglerGradeLevel ?? DEFAULT.anglerGradeLevel, 0, 45);
    s.anglerFueled = typeof migrated.anglerFueled === "boolean" ? migrated.anglerFueled : DEFAULT.anglerFueled;
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
  const fuelDurationWorld3Mult = 1 + state.fuelDurationWorld3Level * 0.15 / 100;
  const fuelDurationRelicMult = 1 + state.fuelDurationRelicLevel * 0.01 / 100;
  // Coal, World 3, Gasoline, Axolotl, Cards, Relics: multiplicative. Round once at the end.
  const fuelDurationGameSec = Math.round(
    fuelDurationFromGradeSec *
    (1 + state.fuelDurationUpgradeLevel / 100) *
    fuelDurationWorld3Mult *
    (state.gasolineGuzzler ? 1 + GASOLINE_GUZZLER_FUEL_DURATION_PCT / 100 : 1) *
    (state.axolotlSkin ? 1.1 : 1) *
    MISC_FUEL_MULT[state.miscFuelCardTier] *
    fuelDurationRelicMult,
  );
  const fuelDurationSecReal = fuelDurationGameSec / gameSpeedMult;
  const fuelDurationMultiplier =
    (1 + state.fuelDurationUpgradeLevel / 100) *
    fuelDurationWorld3Mult *
    (state.gasolineGuzzler ? 1 + GASOLINE_GUZZLER_FUEL_DURATION_PCT / 100 : 1) *
    (state.axolotlSkin ? 1.1 : 1) *
    MISC_FUEL_MULT[state.miscFuelCardTier] *
    fuelDurationRelicMult;

  /** Frogger fuel duration: 3 min base + 9 s per grade (shared upgrades). Round once at the end. */
  const froggerFuelDurationFromGradeSec =
    FROGGER_FUEL_DURATION_BASE_SEC + state.froggerGradeLevel * FROGGER_FUEL_DURATION_SEC_PER_GRADE;
  const froggerFuelDurationGameSec = Math.round(
    froggerFuelDurationFromGradeSec *
    (1 + state.fuelDurationUpgradeLevel / 100) *
    fuelDurationWorld3Mult *
    (state.gasolineGuzzler ? 1 + GASOLINE_GUZZLER_FUEL_DURATION_PCT / 100 : 1) *
    (state.axolotlSkin ? 1.1 : 1) *
    MISC_FUEL_MULT[state.miscFuelCardTier] *
    fuelDurationRelicMult,
  );
  const froggerFuelDurationSecReal = froggerFuelDurationGameSec / gameSpeedMult;

  /** Bomb Bear fuel duration: 4:00 base + 0:12 per grade (shared fuel duration multiplier). */
  const bombBearFuelDurationFromGradeSec =
    BOMB_BEAR_FUEL_DURATION_BASE_SEC + state.bombBearGradeLevel * BOMB_BEAR_FUEL_DURATION_SEC_PER_GRADE;
  const bombBearFuelDurationGameSec = Math.round(
    bombBearFuelDurationFromGradeSec *
    (1 + state.fuelDurationUpgradeLevel / 100) *
    fuelDurationWorld3Mult *
    (state.gasolineGuzzler ? 1 + GASOLINE_GUZZLER_FUEL_DURATION_PCT / 100 : 1) *
    (state.axolotlSkin ? 1.1 : 1) *
    MISC_FUEL_MULT[state.miscFuelCardTier] *
    fuelDurationRelicMult,
  );
  const bombBearFuelDurationSecReal = bombBearFuelDurationGameSec / gameSpeedMult;

  /** Angler: interval (game time) = 1140 − suit×2 s; real time = interval / game speed. Ticks per hour = 2 × 3600 / (interval/gameSpeed) = 7200×gameSpeed/interval. */
  const anglerIntervalSecGame = Math.max(1, ANGLER_BASE_INTERVAL_SEC - state.anglerSuitLevel * ANGLER_SUIT_SEC_PER_LEVEL);
  const anglerIntervalSecReal = anglerIntervalSecGame / gameSpeedMult;
  const anglerTicksPerHour = (ANGLER_TICKS_PER_INTERVAL * 3600) / anglerIntervalSecReal;

  /** Angler fuel duration: 3:00 base + 0:09 per grade (shared multipliers). */
  const anglerFuelDurationFromGradeSec = ANGLER_FUEL_DURATION_BASE_SEC + state.anglerGradeLevel * ANGLER_FUEL_DURATION_SEC_PER_GRADE;
  const anglerFuelDurationGameSec = Math.round(
    anglerFuelDurationFromGradeSec *
    (1 + state.fuelDurationUpgradeLevel / 100) *
    fuelDurationWorld3Mult *
    (state.gasolineGuzzler ? 1 + GASOLINE_GUZZLER_FUEL_DURATION_PCT / 100 : 1) *
    (state.axolotlSkin ? 1.1 : 1) *
    MISC_FUEL_MULT[state.miscFuelCardTier] *
    fuelDurationRelicMult,
  );
  const anglerFuelDurationSecReal = anglerFuelDurationGameSec / gameSpeedMult;

  /** Bomb Bear Lootbug spawn rate multiplier when ON and fueled: 1 + min(90%, 30% + 3%×grade). Applied multiplicatively in Lootbug. */
  const bombBearLootbugSpawnRateMult = useMemo(() => {
    if (!state.bombBearDroneOn || !state.bombBearFueled) return 1;
    const pct = Math.min(
      BOMB_BEAR_LOOTBUG_SPAWN_PCT_MAX,
      BOMB_BEAR_LOOTBUG_SPAWN_PCT_BASE + state.bombBearGradeLevel * BOMB_BEAR_LOOTBUG_SPAWN_PCT_PER_GRADE,
    );
    return 1 + pct / 100;
  }, [state.bombBearDroneOn, state.bombBearFueled, state.bombBearGradeLevel]);

  const froggerFuelGemsPerHour = useMemo(() => {
    if (!state.froggerFueled || froggerFuelDurationSecReal <= 0) return 0;
    const fuelsPerHour = 3600 / froggerFuelDurationSecReal;
    const coal = state.fuelSaveChanceUpgradeLevel / 100;
    const upgrade = state.upgradeFuelSaveChancePct / 100;
    const saveChance = 1 - (1 - coal) * (1 - upgrade);
    return fuelsPerHour * (1 - saveChance) * GEMS_PER_FUEL;
  }, [froggerFuelDurationSecReal, state.froggerFueled, state.fuelSaveChanceUpgradeLevel, state.upgradeFuelSaveChancePct]);

  /** Bomb Bear fuel cost (100% fueled): same formula as Frogger. */
  const bombBearFuelGemsPerHour = useMemo(() => {
    if (!state.bombBearFueled || bombBearFuelDurationSecReal <= 0) return 0;
    const fuelsPerHour = 3600 / bombBearFuelDurationSecReal;
    const coal = state.fuelSaveChanceUpgradeLevel / 100;
    const upgrade = state.upgradeFuelSaveChancePct / 100;
    const saveChance = 1 - (1 - coal) * (1 - upgrade);
    return fuelsPerHour * (1 - saveChance) * GEMS_PER_FUEL;
  }, [bombBearFuelDurationSecReal, state.bombBearFueled, state.fuelSaveChanceUpgradeLevel, state.upgradeFuelSaveChancePct]);

  /** Angler fuel cost (100% fueled): same formula. */
  const anglerFuelGemsPerHour = useMemo(() => {
    if (!state.anglerFueled || anglerFuelDurationSecReal <= 0) return 0;
    const fuelsPerHour = 3600 / anglerFuelDurationSecReal;
    const coal = state.fuelSaveChanceUpgradeLevel / 100;
    const upgrade = state.upgradeFuelSaveChancePct / 100;
    const saveChance = 1 - (1 - coal) * (1 - upgrade);
    return fuelsPerHour * (1 - saveChance) * GEMS_PER_FUEL;
  }, [anglerFuelDurationSecReal, state.anglerFueled, state.fuelSaveChanceUpgradeLevel, state.upgradeFuelSaveChancePct]);

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

  /** Frogger: 30 s base (game time), −1.5 s per suit level. Real time = game time ÷ game speed. When fueled: 5 + grade bombs per autofire (no charge consumed). */
  const froggerBombIntervalSecGame = Math.max(0.1, FROGGER_BASE_INTERVAL_SEC - state.froggerSuitLevel * FROGGER_SUIT_SEC_PER_LEVEL);
  const froggerBombIntervalSecReal = froggerBombIntervalSecGame / gameSpeedMult;
  const froggerBombsPerAutofire = state.froggerFueled
    ? FROGGER_FUEL_BOMBS_BASE + state.froggerGradeLevel * FROGGER_FUEL_BOMBS_PER_GRADE
    : 1;

  /** Frogger Gem EV+/h: one bomb every X s (without fuel); with fuel, (5 + grade) of same random type per interval. Uses Gem EV bomb cycle (marginal value per detonation). */
  const { froggerGemEvPerHour, totalBombTypesFromGemEv } = useMemo(() => {
    const baseParams = defaultGameParameters();
    const saved = loadJson<{ params?: Partial<GameParameters> }>(GEMEV_STORAGE_KEY);
    const ext = loadJson<{
      lootbugBomb10xMinPerHour?: number;
      chaosTotemUptimePct?: number;
    }>(GEMEV_EXTERNAL_KEY) ?? {};
    const params: GameParameters = { ...baseParams, ...(saved?.params ?? {}) };
    const includeFounder = params.include_founder_bomb_in_total ?? params.founder_enabled;
    const hasVeinmorph = "has_veinmorph_bomb" in params ? params.has_veinmorph_bomb : true;
    const hasMegabomb = "has_megabomb" in params ? params.has_megabomb : false;
    params.total_bomb_types = 10 + (includeFounder ? 1 : 0) + (hasVeinmorph ? 1 : 0) + (hasMegabomb ? 1 : 0);
    params.bomb_recharge_10x_min_per_hour = (ext.lootbugBomb10xMinPerHour ?? 0) + droneBomb10xMinPerHour;
    params.chaos_totem_uptime = ((ext.chaosTotemUptimePct ?? 0) / 100);
    const totalBombTypes = Math.max(2, Math.min(13, params.total_bomb_types));
    let baseEv: number;
    let deltaGem: number;
    let deltaCherry: number;
    let deltaBattery: number;
    let deltaD20: number;
    try {
      baseEv = calculateGemBombGemsPerHour(params, 0);
      deltaGem = calculateGemBombGemsPerHour(params, { gem: 1 }) - baseEv;
      deltaCherry = calculateGemBombGemsPerHour(params, { cherry: 1 }) - baseEv;
      deltaBattery = calculateGemBombGemsPerHour(params, { battery: 1 }) - baseEv;
      deltaD20 = calculateGemBombGemsPerHour(params, { d20: 1 }) - baseEv;
    } catch {
      return { froggerGemEvPerHour: 0, totalBombTypesFromGemEv: totalBombTypes };
    }
    const sumDeltas = deltaGem + deltaCherry + deltaBattery + deltaD20;
    const bombsPerHour = 3600 / Math.max(0.1, froggerBombIntervalSecReal);
    const bombsPerPick = froggerBombsPerAutofire;
    const froggerGemEvPerHour = bombsPerHour * (1 / totalBombTypes) * bombsPerPick * sumDeltas;
    return { froggerGemEvPerHour, totalBombTypesFromGemEv: totalBombTypes };
  }, [froggerBombIntervalSecReal, froggerBombsPerAutofire, droneBomb10xMinPerHour]);

  /** Gems/h spent on fuel for 100% fueled uptime: fuels/h × (1 − save chance) × 5 gems/fuel. Save chance = Coal and Upgrade Fuel Save combined multiplicatively. */
  const fuelGemsPerHour = useMemo(() => {
    if (fuelDurationSecReal <= 0) return 0;
    const fuelsPerHour = 3600 / fuelDurationSecReal;
    const coal = state.fuelSaveChanceUpgradeLevel / 100;
    const upgrade = state.upgradeFuelSaveChancePct / 100;
    const saveChance = 1 - (1 - coal) * (1 - upgrade);
    return fuelsPerHour * (1 - saveChance) * GEMS_PER_FUEL;
  }, [fuelDurationSecReal, state.fuelSaveChanceUpgradeLevel, state.upgradeFuelSaveChancePct]);

  useEffect(() => {
    const ext = loadJson<{ lootbugBomb10xMinPerHour?: number; droneBomb10xMinPerHour?: number; droneFuelGemsPerHour?: number; bombBearLootbugSpawnRateMult?: number }>(GEMEV_EXTERNAL_KEY) ?? {};
    ext.droneBomb10xMinPerHour = state.elixirDroneOn ? droneBomb10xMinPerHour : 0;
    const elixirFuelGems = state.elixirDroneOn && state.fueled ? fuelGemsPerHour : 0;
    const froggerFuelGems = state.froggerDroneOn && state.froggerFueled ? froggerFuelGemsPerHour : 0;
    const bombBearFuelGems = state.bombBearDroneOn && state.bombBearFueled ? bombBearFuelGemsPerHour : 0;
    const anglerFuelGems = state.anglerDroneOn && state.anglerFueled ? anglerFuelGemsPerHour : 0;
    ext.droneFuelGemsPerHour = elixirFuelGems + froggerFuelGems + bombBearFuelGems + anglerFuelGems;
    ext.bombBearLootbugSpawnRateMult = bombBearLootbugSpawnRateMult;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [droneBomb10xMinPerHour, fuelGemsPerHour, froggerFuelGemsPerHour, bombBearFuelGemsPerHour, anglerFuelGemsPerHour, bombBearLootbugSpawnRateMult, state.elixirDroneOn, state.fueled, state.froggerDroneOn, state.froggerFueled, state.bombBearDroneOn, state.bombBearFueled, state.anglerDroneOn, state.anglerFueled]);

  /** Uptime fractions (0..1) for Stargazing: 2× Star Spawn Rate and 3× Super Star Spawn Rate. When both active they multiply. */
  const { drone2xStarUptimeFraction, drone3xSuperUptimeFraction } = useMemo(() => {
    const cycleSec = numBuffs * intervalSec;
    if (cycleSec <= 0) return { drone2xStarUptimeFraction: 0, drone3xSuperUptimeFraction: 0 };
    const star = buffDurations.find((b) => b.id === "2xstar");
    const super_ = buffDurations.find((b) => b.id === "3xsuper");
    return {
      drone2xStarUptimeFraction: star ? Math.min(1, star.sec / cycleSec) : 0,
      drone3xSuperUptimeFraction: super_ ? Math.min(1, super_.sec / cycleSec) : 0,
    };
  }, [numBuffs, intervalSec, buffDurations]);

  /** 3× Fishing Tick Speed: min/h and uptime fraction (0..1) for Fishing module. Real-time cycle; when drone off or fishing not unlocked: 0. */
  const { elixir3xFishingTickSpeedMinPerHour, elixir3xFishingTickSpeedUptimeFraction } = useMemo(() => {
    if (!state.elixirDroneOn || !state.fishingUnlocked) {
      return { elixir3xFishingTickSpeedMinPerHour: 0, elixir3xFishingTickSpeedUptimeFraction: 0 };
    }
    const cycleSec = numBuffs * intervalSec;
    if (cycleSec <= 0) return { elixir3xFishingTickSpeedMinPerHour: 0, elixir3xFishingTickSpeedUptimeFraction: 0 };
    const b = buffDurations.find((x) => x.id === "3xfishing");
    if (!b) return { elixir3xFishingTickSpeedMinPerHour: 0, elixir3xFishingTickSpeedUptimeFraction: 0 };
    const uptimeFraction = Math.min(1, b.sec / cycleSec);
    const minPerHour = uptimeFraction * 60;
    return { elixir3xFishingTickSpeedMinPerHour: minPerHour, elixir3xFishingTickSpeedUptimeFraction: uptimeFraction };
  }, [state.elixirDroneOn, state.fishingUnlocked, numBuffs, intervalSec, buffDurations]);

  const STARGAZING_EXTERNAL_KEY = "obeliskfarm:web:stargazing_external.json";
  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(STARGAZING_EXTERNAL_KEY) ?? {};
    ext.drone2xStarUptimeFraction = drone2xStarUptimeFraction;
    ext.drone3xSuperUptimeFraction = drone3xSuperUptimeFraction;
    saveJson(STARGAZING_EXTERNAL_KEY, ext);
  }, [drone2xStarUptimeFraction, drone3xSuperUptimeFraction]);

  const FISHING_EXTERNAL_KEY = "obeliskfarm:web:fishing_external.json";
  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(FISHING_EXTERNAL_KEY) ?? {};
    ext.elixir3xFishingTickSpeedMinPerHour = elixir3xFishingTickSpeedMinPerHour;
    ext.elixir3xFishingTickSpeedUptimeFraction = elixir3xFishingTickSpeedUptimeFraction;
    ext.anglerTicksPerHour = state.anglerDroneOn ? anglerTicksPerHour : 0;
    saveJson(FISHING_EXTERNAL_KEY, ext);
  }, [elixir3xFishingTickSpeedMinPerHour, elixir3xFishingTickSpeedUptimeFraction, state.anglerDroneOn, anglerTicksPerHour]);

  /** Drone's share of Gem EV/h from 10× Bomb Recharge (from Gem EV module). */
  const drone10xGemEvPerHour = (() => {
    const ext = loadJson<{ gemBomb10xImpact?: number; total10xMinPerHour?: number }>(GEMEV_EXTERNAL_KEY);
    const total10x = typeof ext?.total10xMinPerHour === "number" ? ext.total10xMinPerHour : 0;
    const impact = typeof ext?.gemBomb10xImpact === "number" ? ext.gemBomb10xImpact : 0;
    if (total10x <= 0) return 0;
    return impact * (droneBomb10xMinPerHour / total10x);
  })();

  /** Fishing data for Angler subsection: read from Fishing module external. Extra fish/h per type = fishPerHour × (anglerTicksPerHour × effectiveTickSec / 3600). Recomputes when suit/grade change (anglerTicksPerHour depends on suit). */
  const anglerFishingData = useMemo(() => {
    const ext = loadJson<{
      effectiveTickSec?: number;
      fishGains?: Array<{ fishId: string; fishName: string; fishPerHour: number }>;
    }>(FISHING_EXTERNAL_KEY);
    const effectiveTickSec = typeof ext?.effectiveTickSec === "number" ? ext.effectiveTickSec : 0;
    const gains = Array.isArray(ext?.fishGains) ? ext.fishGains : [];
    const ticks = state.anglerDroneOn ? anglerTicksPerHour : 0;
    const factor = effectiveTickSec > 0 && ticks > 0 ? (ticks * effectiveTickSec) / 3600 : 0;
    const extraPerFish = gains.map((g) => ({ ...g, extraFishPerHour: g.fishPerHour * factor }));
    const totalExtraFishPerHour = extraPerFish.reduce((s, x) => s + x.extraFishPerHour, 0);
    const totalBaseFishPerHour = gains.reduce((s, g) => s + g.fishPerHour, 0);
    const extraFishPct = totalBaseFishPerHour > 0 ? (totalExtraFishPerHour / totalBaseFishPerHour) * 100 : 0;
    return { effectiveTickSec, extraPerFish, totalExtraFishPerHour, totalBaseFishPerHour, extraFishPct };
  }, [state.anglerDroneOn, state.anglerSuitLevel, state.anglerGradeLevel, anglerTicksPerHour]);

  /** Gem EV/h from Bomb Bear: when no buff (mult 1), show 0. When buff active, use live calc from Lootbug gems+net10x so it updates on every Drone change; else value from Lootbug. */
  const bombBearLootbugGemsEvPerHour = (() => {
    if (bombBearLootbugSpawnRateMult <= 1) return 0;
    const ext = loadJson<{
      bombBearLootbugGemsEvPerHour?: number;
      lootbugGemsPerHour?: number;
      lootbugNet10xGemEvPerHour?: number;
    }>(GEMEV_EXTERNAL_KEY);
    const fromLootbug = typeof ext?.bombBearLootbugGemsEvPerHour === "number" && ext.bombBearLootbugGemsEvPerHour >= 0 ? ext.bombBearLootbugGemsEvPerHour : 0;
    const gems = typeof ext?.lootbugGemsPerHour === "number" && ext.lootbugGemsPerHour >= 0 ? ext.lootbugGemsPerHour : 0;
    const net10x = typeof ext?.lootbugNet10xGemEvPerHour === "number" ? ext.lootbugNet10xGemEvPerHour : 0;
    if (gems > 0 || net10x !== 0) {
      const totalGains = gems + net10x;
      return ((bombBearLootbugSpawnRateMult - 1) / bombBearLootbugSpawnRateMult) * totalGains;
    }
    return fromLootbug;
  })();

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

      <Collapsible id="drone-fuel-save-duration" title="Fuel Save/Duration" defaultExpanded={true}>
        <div className="droneSection">
          <div className="droneUpgradesBlock" style={{ marginTop: 0 }}>
            <div className="droneBlockHeader">
              <span className="droneBlockHeaderTitle">Pets</span>
            </div>
            <div className="droneCheckboxRow">
              <img
                src="https://static.wikitide.net/shminerwiki/2/20/Axolotl_Skin.png"
                alt=""
                className="droneSkillIcon"
                aria-hidden
              />
              <input
                id="elixir-axolotl-skin"
                type="checkbox"
                className="droneCheckbox"
                checked={state.axolotlSkin}
                onChange={(e) => update({ axolotlSkin: e.target.checked })}
              />
              <label htmlFor="elixir-axolotl-skin" className="droneLabel">
                Axolotl Skin (+10% fuel duration)
              </label>
            </div>
          </div>

          <div className="droneUpgradesBlock" style={{ marginTop: 10 }}>
            <div className="droneBlockHeader">
              <span className="droneBlockHeaderTitle">Skill</span>
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
          </div>

          <div className="droneUpgradesBlock" style={{ marginTop: 10 }}>
            <div className="droneBlockHeader">
              <span className="droneBlockHeaderTitle">Cards</span>
            </div>
            <div className="droneRow" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <img
                src="https://static.wikitide.net/shminerwiki/4/44/Fuel.png"
                alt=""
                className="droneSkillIcon"
                aria-hidden
              />
              <span className="droneLabel">Misc Fuel</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {([1, 2, 3] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    className={`btn btnSecondary ${state.miscFuelCardTier === tier ? "cardBtnActive" : ""}`}
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    onClick={() => update({ miscFuelCardTier: state.miscFuelCardTier === tier ? 0 : tier })}
                  >
                    {tier === 1 ? "Card" : tier === 2 ? "Gilded" : "Poly"}
                    {state.miscFuelCardTier === tier ? " ✓" : ""}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="droneUpgradesBlock" style={{ marginTop: 10 }}>
            <div className="droneBlockHeader">
              <span className="droneBlockHeaderTitle">Relics</span>
            </div>
            <div className="droneRow" style={{ alignItems: "center", gap: 8 }}>
              <img
                src="https://static.wikitide.net/shminerwiki/6/6d/Relic_Chest.png"
                alt=""
                className="droneSkillIcon"
                aria-hidden
              />
              <label htmlFor="drone-relic-fuel-duration" className="droneLabel">
                Fuel Duration
              </label>
              <input
                id="drone-relic-fuel-duration"
                type="number"
                min={0}
                step={1}
                className="input"
                style={{ width: 72 }}
                value={state.fuelDurationRelicLevel}
                onChange={(e) =>
                  update({
                    fuelDurationRelicLevel: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                  })
                }
              />
              <span className="small" style={{ color: "var(--muted)" }}>
                +0.01% per level
              </span>
            </div>
          </div>

          <div className="droneCoalUpgradesBlock">
            <div className="droneBlockHeader">
              <img src={COAL_ICON} alt="" className="droneBlockHeaderIcon" aria-hidden />
              <span className="droneBlockHeaderTitle">Coal Upgrades</span>
            </div>
            <Stepper
              label="Fuel Save Chance +1% / level"
              value={state.fuelSaveChanceUpgradeLevel}
              onChange={(n) => update({ fuelSaveChanceUpgradeLevel: n })}
              min={0}
              max={COAL_UPGRADE_MAX}
              step={1}
              stepLarge={5}
              suffix=""
              tooltip={{
                title: "Fuel Save Chance",
                lines: [
                  "Coal Upgrade: Fuel Save Chance +1% per level (no cap).",
                  "Multiplicative with Upgrade → Fuel Save Chance below.",
                ],
              }}
            />
            <Stepper
              label="Fuel Duration +1% / level"
              value={state.fuelDurationUpgradeLevel}
              onChange={(n) => update({ fuelDurationUpgradeLevel: n })}
              min={0}
              max={COAL_UPGRADE_MAX}
              step={1}
              stepLarge={5}
              suffix=""
              tooltip={{
                title: "Fuel Duration",
                lines: [
                  "Coal Upgrade: Fuel Duration +1% per level (no cap).",
                  "Effective: +" + state.fuelDurationUpgradeLevel + "%.",
                ],
              }}
            />
          </div>

          <div className="droneUpgradesBlock">
            <div className="droneBlockHeader">
              <img src={UPGRADES_ICON} alt="" className="droneBlockHeaderIcon" aria-hidden />
              <span className="droneBlockHeaderTitle">Upgrades</span>
            </div>
            <NumInput
              label="Fuel Save Chance"
              iconUrl={FUEL_SAVE_CHANCE_ICON}
              value={state.upgradeFuelSaveChancePct}
              onChange={(n) => update({ upgradeFuelSaveChancePct: clamp(n, 0, 100) })}
              min={0}
              max={100}
              step={0.5}
              decimals={2}
              suffix="%"
              tooltip={{
                title: "Upgrade → Fuel Save Chance",
                lines: [
                  "Additional Fuel Save Chance (%), e.g. from other upgrades. Multiplicative with Coal Fuel Save Chance above.",
                ],
              }}
            />
            <NumInput
              label="Fuel Duration"
              iconUrl="https://static.wikitide.net/shminerwiki/5/50/Drone_Fuel_Duration_Multiplier.png"
              value={state.fuelDurationWorld3Level}
              onChange={(n) => update({ fuelDurationWorld3Level: Math.max(0, Math.trunc(n)) })}
              min={0}
              max={9999}
              step={1}
              decimals={0}
              suffix=" %"
              tooltip={{
                title: "Fuel Duration",
                lines: ["World 3 upgrade. +0.15% fuel duration per level. Multiplicative."],
              }}
            />
          </div>
        </div>
      </Collapsible>

      <Collapsible id="drone-elixir" title="Elixir Drone" defaultExpanded={true}>
        <div className="droneSection">
          <div className="droneCheckboxRow">
            <input
              id="elixir-drone-on"
              type="checkbox"
              className="droneCheckbox"
              checked={state.elixirDroneOn}
              onChange={(e) => update({ elixirDroneOn: e.target.checked })}
            />
            <label htmlFor="elixir-drone-on" className="droneLabel">
              Drone: {state.elixirDroneOn ? "ON" : "OFF"}
            </label>
            <Tooltip
              content={{
                title: "Elixir Drone",
                lines: ["When OFF, Elixir Drone contributions (10× Bomb Recharge share, fuel cost) are not sent to Gem EV."],
              }}
            />
          </div>
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
                  "With Fishing: 10 random buffs.",
                  "Without (pre-Ob 37): 9 buffs (no 3× Fishing Tick Speed).",
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

        {state.fueled ? (
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
            <div className="droneRow">
              <span className="droneLabel">Fuel Duration Multiplier</span>
              <span className="droneStepperValue">{fuelDurationMultiplier.toFixed(2)}×</span>
            </div>
            <div className="droneRow droneFuelGemsRow">
              <span className="droneFuelGemsLabel">
                <img src={GEM_ICON} alt="" className="droneSkillIcon" aria-hidden />
                <span className="droneLabel">
                  Fuel cost (100% uptime)
                  <Tooltip
                    content={{
                      title: "Fuel cost (100% uptime)",
                      sections: [
                        {
                          heading: "Meaning",
                          lines: [
                            "Average gems per hour spent on fuel to keep the Elixir Drone fueled 100% of the time.",
                          ],
                        },
                        {
                          heading: "Formula",
                          lines: [
                            "Fuels per hour × (1 − Fuel Save Chance) × 5 gems per fuel.",
                            "Fuel Save Chance = Coal Fuel Save and Upgrade → Fuel Save Chance combined multiplicatively.",
                          ],
                        },
                      ],
                    }}
                  />
                </span>
              </span>
              <span className="droneFuelGemsValue" aria-label={`${fuelGemsPerHour.toFixed(1)} gems per hour cost`}>
                −{fuelGemsPerHour.toFixed(1)}
              </span>
            </div>
          </div>
        ) : null}

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
                        sections: [
                          {
                            heading: "Meaning",
                            lines: [
                              "With uniform random buffs every interval: average number of buffs active at any time.",
                            ],
                          },
                          {
                            heading: "Formula",
                            lines: [
                              "Sum of all buff durations ÷ (number of buffs × time between buffs).",
                            ],
                          },
                        ],
                      }}
                    />
                  </span>
                  <span className="droneBuffPlotSummaryValue">{expectedBuffsActive.toFixed(2)}</span>
                </div>
                <div className="droneBuffPlotSummary">
                  <span className="droneBuffPlotSummaryLabel">
                    Star Spawn Rate + SS Rate overlap
                    <Tooltip
                      content={{
                        title: "Star Spawn Rate & SS Rate overlap",
                        sections: [
                          {
                            heading: "Meaning",
                            lines: [
                              "Approximate probability that 2× Star Spawn Rate and 3× Super Star Spawn Rate are both active at the same time.",
                            ],
                          },
                          {
                            heading: "Formula",
                            lines: [
                              "Uptime(Star) × Uptime(Super Star), assuming independence.",
                            ],
                          },
                        ],
                      }}
                    />
                  </span>
                  <span className="droneBuffPlotSummaryValue">{starSuperOverlapPct.toFixed(2)}%</span>
                </div>
                <div className="droneBuffPlotSummary droneBomb10xRow">
                  <span className="droneBuffPlotSummaryLabel">
                    10× Bomb Recharge (Drone) → Gem EV/h
                    <Tooltip
                      content={{
                        title: "10× Bomb Recharge (Drone) → Gem EV/h",
                        sections: [
                          {
                            heading: "Meaning",
                            lines: [
                              "Share of Gem EV per hour from the 10× Bomb Recharge buff that comes from the Elixir Drone.",
                            ],
                          },
                          {
                            heading: "Source",
                            lines: [
                              "Read from Gem EV module. Open Gem EV once so its 10× impact is saved; then this shows the Drone share.",
                            ],
                          },
                        ],
                      }}
                    />
                  </span>
                  <span className="droneBuffPlotSummaryValue droneBomb10xGemEvValue">{drone10xGemEvPerHour.toFixed(1)}</span>
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
                    sections: [
                      {
                        heading: "Meaning",
                        lines: ["Average minutes per hour this buff is active."],
                      },
                      {
                        heading: "Formula",
                        lines: ["Uptime × 60; max 60 min/h."],
                      },
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
                    sections: [
                      {
                        heading: "Meaning",
                        lines: [
                          "Expected fraction of time this buff is active (100% = always on).",
                        ],
                      },
                      {
                        heading: "Formula",
                        lines: [
                          "Duration ÷ (number of buffs × time between buffs).",
                        ],
                      },
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

      <Collapsible id="drone-frogger" title="Frogger Drone" defaultExpanded={true}>
        <div className="droneSection">
          <div className="droneCheckboxRow">
            <input
              id="frogger-drone-on"
              type="checkbox"
              className="droneCheckbox"
              checked={state.froggerDroneOn}
              onChange={(e) => update({ froggerDroneOn: e.target.checked })}
            />
            <label htmlFor="frogger-drone-on" className="droneLabel">
              Drone: {state.froggerDroneOn ? "ON" : "OFF"}
            </label>
            <Tooltip
              content={{
                title: "Frogger Drone",
                lines: ["When OFF, Frogger Drone contributions (Gem EV+/h, fuel cost) are not sent to Gem EV."],
              }}
            />
          </div>
          <div className="droneSectionTitle">Settings</div>

          <Stepper
            label="Frogger Suit level"
            value={state.froggerSuitLevel}
            onChange={(n) => update({ froggerSuitLevel: n })}
            min={0}
            max={20}
            step={1}
            stepLarge={5}
            tooltip={{
              title: "Frogger Suit upgrade level",
              lines: [
                "Time Between Autofires −1.5 s per level (base 30 s game time). Real time = game time ÷ game speed.",
                "Rolls a random bomb, even from bombs you don't have unlocked. Rerolls if you don't have that bomb unlocked or it has 0 charges. If no valid bomb is rolled after 30 rolls, it fires no bombs.",
                "Calculator: assumes charges; pool = available bomb types from Gem EV.",
              ],
            }}
          />
          <div className="droneRow">
            <span className="droneLabel">→ Time between autofires</span>
            <span className="droneStepperValue">
              {froggerBombIntervalSecReal.toFixed(1)} s{gameSpeedMult > 1 ? " (real)" : ""}
            </span>
          </div>

          <div className="droneCheckboxRow">
            <img
              src="https://static.wikitide.net/shminerwiki/4/44/Fuel.png"
              alt=""
              className="droneSkillIcon"
              aria-hidden
            />
            <input
              id="frogger-fueled"
              type="checkbox"
              className="droneCheckbox"
              checked={state.froggerFueled}
              onChange={(e) => update({ froggerFueled: e.target.checked })}
            />
            <label htmlFor="frogger-fueled" className="droneLabel">
              Drone fueled
            </label>
          </div>

          {state.froggerFueled ? (
            <div className="droneSubSection">
              <div className="droneSubTitle">When fueled</div>
              <Stepper
                label="Grade level"
                value={state.froggerGradeLevel}
                onChange={(n) => update({ froggerGradeLevel: n })}
                min={0}
                max={45}
                step={1}
                stepLarge={5}
                tooltip={{
                  title: "Grade level (fuel buff)",
                  lines: [
                    "Fuel duration: 3:00 at grade 0, +0:09 per grade.",
                    "When fueled: 5 bombs per autofire, +1 per grade (no charge consumed). Same fuel multipliers (Coal, Cards, etc.) as Elixir.",
                  ],
                }}
              />
            </div>
          ) : null}
        </div>

        {state.froggerFueled ? (
          <div className="droneSection">
            <div className="droneSectionTitle">Fuel (Frogger)</div>
            <div className="droneRow">
              <span className="droneLabel">1 fuel lasts (game time)</span>
              <span className="droneStepperValue">
                {(froggerFuelDurationGameSec / 60).toFixed(1)} min
              </span>
            </div>
            <div className="droneRow">
              <span className="droneLabel">1 fuel lasts (real time)</span>
              <span className="droneStepperValue">
                {froggerFuelDurationSecReal >= 60
                  ? Math.floor(froggerFuelDurationSecReal / 60) + ":" + String(Math.round(froggerFuelDurationSecReal % 60)).padStart(2, "0")
                  : Math.round(froggerFuelDurationSecReal) + " s"}
              </span>
            </div>
            <div className="droneRow">
              <span className="droneLabel">Fuel Duration Multiplier</span>
              <span className="droneStepperValue">{fuelDurationMultiplier.toFixed(2)}×</span>
            </div>
            <div className="droneRow droneFuelGemsRow">
              <span className="droneFuelGemsLabel">
                <img src={GEM_ICON} alt="" className="droneSkillIcon" aria-hidden />
                <span className="droneLabel">
                  Fuel cost (100% uptime)
                  <Tooltip
                    content={{
                      title: "Fuel cost (100% uptime)",
                      sections: [
                        {
                          heading: "Meaning",
                          lines: [
                            "Average gems per hour spent on fuel to keep the Frogger Drone fueled 100% of the time.",
                          ],
                        },
                        {
                          heading: "Formula",
                          lines: [
                            "Fuels per hour × (1 − Fuel Save Chance) × 5 gems per fuel.",
                            "Fuel Save Chance = Coal Fuel Save and Upgrade → Fuel Save Chance combined multiplicatively.",
                          ],
                        },
                      ],
                    }}
                  />
                </span>
              </span>
              <span className="droneFuelGemsValue" aria-label={`${froggerFuelGemsPerHour.toFixed(1)} gems per hour cost`}>
                −{froggerFuelGemsPerHour.toFixed(1)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="droneSection">
          <div className="droneSectionTitle">Bombs</div>
          <p className="droneHint" style={{ marginBottom: 10 }}>
            Rolls a random bomb every interval (from Settings), even from bombs you don't have unlocked. Rerolls if you don't have that bomb unlocked or it has 0 charges. If no valid bomb is rolled after 30 rolls, it fires no bombs. With fuel: 5 + grade bombs per autofire, no charge consumed. Calculator: assumes charges; pool = available bomb types from Gem EV (Total bomb types below).
          </p>
          <div className="droneRow">
            <span className="droneLabel">Time between autofires</span>
            <span className="droneStepperValue">
              {froggerBombIntervalSecReal.toFixed(1)} s{gameSpeedMult > 1 ? " (real)" : ""}
            </span>
          </div>
          {state.froggerFueled ? (
            <div className="droneRow">
              <span className="droneLabel">Bombs per autofire (when fueled)</span>
              <span className="droneStepperValue">{froggerBombsPerAutofire}</span>
            </div>
          ) : null}
          <div className="droneRow">
            <span className="droneLabel">
              Total bomb types (Gem EV)
              <Tooltip
                content={{
                  title: "Total bomb types (available)",
                  lines: [
                    "Available bomb types from Gem EV. Minimum 10 (base); +1 each if Founder, Veinmorph, or Megabomb is counted. Pool size for Frogger: he picks uniformly from these types.",
                    "Open Gem EV once so this count is in sync.",
                  ],
                }}
              />
            </span>
            <span className="droneStepperValue">{totalBombTypesFromGemEv}</span>
          </div>
          <div className="droneRow droneFuelGemsRow droneBomb10xRow">
            <span className="droneFuelGemsLabel">
              <img src={GEM_ICON} alt="" className="droneSkillIcon" aria-hidden />
              <span className="droneLabel">
                Frogger Gem EV+/h
                <Tooltip
                  content={{
                    title: "Frogger Gem EV+/h",
                    sections: [
                      {
                        heading: "Meaning",
                        lines: [
                          "Expected Gem EV per hour from Frogger Drone bombs. Pool = available bomb types from Gem EV; we assume charges.",
                          "Based on Gem EV bomb cycle (marginal value per gem, cherry, battery, d20 detonation). Without fuel: (3600 ÷ interval) × (1 ÷ bomb types) × 1 bomb. With fuel: same × (5 + grade) bombs per pick.",
                        ],
                      },
                      {
                        heading: "Source",
                        lines: ["Available bomb types and params from Gem EV; 10× Bomb Recharge (Lootbug + Drone) from external. Open Gem EV once to sync."],
                      },
                    ],
                  }}
                />
              </span>
            </span>
            <span className="droneFuelGemsValue droneBomb10xGemEvValue" aria-label={`${froggerGemEvPerHour.toFixed(1)} gems per hour from Frogger`}>
              +{froggerGemEvPerHour.toFixed(1)}
            </span>
          </div>
        </div>
      </Collapsible>

      <Collapsible id="drone-bomb-bear" title="Bomb Bear Drone" defaultExpanded={true}>
        <div className="droneSection">
          <p className="droneHint" style={{ marginTop: 0, marginBottom: 10 }}>
            When fueled, Bomb Bear increases Lootbug spawn rate (multiplicative with Lootbug stats). Do not enable Bomb Bear here if the Lootbug spawn rate you entered in Lootbug was already measured with Bomb Bear buff active in-game, or the bonus would be counted twice.
          </p>
          <div className="droneCheckboxRow">
            <input
              type="checkbox"
              id="bomb-bear-drone-on"
              className="droneCheckbox"
              checked={state.bombBearDroneOn}
              onChange={(e) => update({ bombBearDroneOn: e.target.checked })}
            />
            <label htmlFor="bomb-bear-drone-on" className="droneLabel">
              Drone: {state.bombBearDroneOn ? "ON" : "OFF"}
            </label>
            <Tooltip
              content={{
                title: "Bomb Bear Drone",
                sections: [
                  {
                    heading: "Effect",
                    lines: [
                      "When ON and fueled, Lootbug spawn rate in the Lootbug module is multiplied by (1 + buff %). Buff: +30% at grade 0, +3% per grade, max +90% (Polychrome).",
                    ],
                  },
                  {
                    heading: "Avoid double-counting",
                    lines: [
                      "Enter your base Lootbug spawn rate in Lootbug (without Bomb Bear). If you measured spawn rate while Bomb Bear was already active in-game, leave Bomb Bear OFF here so the bonus is not applied twice.",
                    ],
                  },
                ],
              }}
            />
          </div>
          <div className="droneSectionTitle">Settings</div>
          <div className="droneCheckboxRow">
            <img
              src="https://static.wikitide.net/shminerwiki/4/44/Fuel.png"
              alt=""
              className="droneSkillIcon"
              aria-hidden
            />
            <input
              type="checkbox"
              id="bomb-bear-fueled"
              className="droneCheckbox"
              checked={state.bombBearFueled}
              onChange={(e) => update({ bombBearFueled: e.target.checked })}
            />
            <label htmlFor="bomb-bear-fueled" className="droneLabel">
              Drone fueled
            </label>
          </div>
          {state.bombBearFueled ? (
            <div className="droneSubSection">
              <div className="droneSubTitle">When fueled</div>
              <Stepper
                label="Grade level"
                value={state.bombBearGradeLevel}
                onChange={(n) => update({ bombBearGradeLevel: n })}
                min={0}
                max={45}
                step={1}
                stepLarge={5}
                tooltip={{
                  title: "Bomb Bear grade (fuel buff)",
                  lines: [
                    "Buff: +30% Lootbug Spawn Rate at grade 0, +3% per grade, max +90% (Polychrome). Duration: 4:00 at grade 0, +0:12 per grade.",
                    "Same fuel duration multipliers (Coal, Cards, etc.) as Elixir and Frogger.",
                  ],
                }}
              />
            </div>
          ) : null}
        </div>

        {state.bombBearFueled ? (
          <div className="droneSection">
            <div className="droneSectionTitle">Fuel (Bomb Bear)</div>
            <div className="droneRow">
              <span className="droneLabel">1 fuel lasts (game time)</span>
              <span className="droneStepperValue">
                {(bombBearFuelDurationGameSec / 60).toFixed(1)} min
              </span>
            </div>
            <div className="droneRow">
              <span className="droneLabel">1 fuel lasts (real time)</span>
              <span className="droneStepperValue">
                {bombBearFuelDurationSecReal >= 60
                  ? Math.floor(bombBearFuelDurationSecReal / 60) + ":" + String(Math.round(bombBearFuelDurationSecReal % 60)).padStart(2, "0")
                  : Math.round(bombBearFuelDurationSecReal) + " s"}
              </span>
            </div>
            <div className="droneRow">
              <span className="droneLabel">Fuel Duration Multiplier</span>
              <span className="droneStepperValue">{fuelDurationMultiplier.toFixed(2)}×</span>
            </div>
            <div className="droneRow droneFuelGemsRow">
              <span className="droneFuelGemsLabel">
                <img src={GEM_ICON} alt="" className="droneSkillIcon" aria-hidden />
                <span className="droneLabel">
                  Fuel cost (100% uptime)
                  <Tooltip
                    content={{
                      title: "Fuel cost (100% uptime)",
                      sections: [
                        {
                          heading: "Meaning",
                          lines: [
                            "Average gems per hour spent on fuel to keep the Bomb Bear Drone fueled 100% of the time.",
                          ],
                        },
                        {
                          heading: "Formula",
                          lines: [
                            "Fuels per hour × (1 − Fuel Save Chance) × 5 gems per fuel.",
                            "Fuel Save Chance = Coal Fuel Save and Upgrade → Fuel Save Chance combined multiplicatively.",
                          ],
                        },
                      ],
                    }}
                  />
                </span>
              </span>
              <span className="droneFuelGemsValue" aria-label={`${bombBearFuelGemsPerHour.toFixed(1)} gems per hour cost`}>
                −{bombBearFuelGemsPerHour.toFixed(1)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="droneSection">
          <div className="droneRow">
            <span className="droneLabel">Lootbug Spawn Rate Mult</span>
            <span className="droneStepperValue">{bombBearLootbugSpawnRateMult.toFixed(2)}×</span>
          </div>
          <div className="droneRow droneFuelGemsRow droneBomb10xRow">
            <span className="droneFuelGemsLabel">
              <img src={GEM_ICON} alt="" className="droneSkillIcon" aria-hidden />
              <span className="droneLabel">
                Gem EV/h from Bomb Bear
                <Tooltip
                  content={{
                    title: "Gem EV/h from Bomb Bear",
                    sections: [
                      {
                        heading: "Meaning",
                        lines: [
                          "Extra Gem EV per hour from the increased Lootbug spawn rate when Bomb Bear is fueled: more raw gems (free buffs) and more gem buffs (e.g. 10× Bomb Recharge).",
                          "Computed in Lootbug from the improvement in Lootbug gains (Gems raw + 10× Bomb Recharge Gem EV/h). Open Lootbug once to sync.",
                        ],
                      },
                    ],
                  }}
                />
              </span>
            </span>
            <span className="droneFuelGemsValue droneBomb10xGemEvValue" aria-label={bombBearLootbugGemsEvPerHour > 0 ? `+${bombBearLootbugGemsEvPerHour.toFixed(1)} gems per hour from Bomb Bear` : "—"}>
              {bombBearLootbugGemsEvPerHour > 0 ? `+${bombBearLootbugGemsEvPerHour.toFixed(1)}` : "—"}
            </span>
          </div>
        </div>
      </Collapsible>

      <Collapsible id="drone-angler" title="Angler Drone" defaultExpanded={true}>
        <div className="droneSection">
          <p className="droneHint" style={{ marginTop: 0, marginBottom: 10 }}>
            Gives 2 Fishing Ticks every {ANGLER_BASE_INTERVAL_SEC} s (game time). Suit: Time Between Fishing Ticks −40 s. Integrates with Fishing module for ticks and extra fish.
          </p>
          <div className="droneCheckboxRow">
            <input
              id="angler-drone-on"
              type="checkbox"
              className="droneCheckbox"
              checked={state.anglerDroneOn}
              onChange={(e) => update({ anglerDroneOn: e.target.checked })}
            />
            <label htmlFor="angler-drone-on" className="droneLabel">
              Drone: {state.anglerDroneOn ? "ON" : "OFF"}
            </label>
            <Tooltip
              content={{
                title: "Angler Drone",
                lines: ["When OFF, Angler contributions (fishing ticks, fuel cost) are not sent. Open Fishing module to sync fish gains for the Fishing subsection below."],
              }}
            />
          </div>
          <div className="droneSectionTitle">Settings</div>
          <Stepper
            label="Angler Suit level"
            value={state.anglerSuitLevel}
            onChange={(n) => update({ anglerSuitLevel: n })}
            min={0}
            max={20}
            step={1}
            stepLarge={5}
            tooltip={{
              title: "Angler Suit",
              lines: ["Time Between Fishing Ticks −2 s per level (base 1140 s). Real time = game time ÷ game speed."],
            }}
          />
          <div className="droneRow">
            <span className="droneLabel">→ Interval (2 ticks every)</span>
            <span className="droneStepperValue">
              {anglerIntervalSecGame} s game{gameSpeedMult > 1 ? ` = ${anglerIntervalSecReal.toFixed(1)} s real` : ""}
            </span>
          </div>
          <div className="droneCheckboxRow">
            <img
              src="https://static.wikitide.net/shminerwiki/4/44/Fuel.png"
              alt=""
              className="droneSkillIcon"
              aria-hidden
            />
            <input
              id="angler-fueled"
              type="checkbox"
              className="droneCheckbox"
              checked={state.anglerFueled}
              onChange={(e) => update({ anglerFueled: e.target.checked })}
            />
            <label htmlFor="angler-fueled" className="droneLabel">
              Drone fueled
            </label>
          </div>
          {state.anglerFueled ? (
            <div className="droneSubSection">
              <div className="droneSubTitle">When fueled</div>
              <Stepper
                label="Grade level"
                value={state.anglerGradeLevel}
                onChange={(n) => update({ anglerGradeLevel: n })}
                min={0}
                max={45}
                step={1}
                stepLarge={5}
                tooltip={{
                  title: "Angler grade (fuel buff)",
                  lines: [
                    "Buff: 1% chance +6 ticks / +2% Legendary Fish Chance / 1:45 duration at grade 0; +6 ticks / +2% / +0:05.25 per grade. Max (Polychrome): +222 ticks / +52% / 3:09.",
                    "Fuel duration: 3:00 at grade 0, +0:09 per grade. Same fuel multipliers as other drones.",
                  ],
                }}
              />
            </div>
          ) : null}
        </div>

        {state.anglerFueled ? (
          <div className="droneSection">
            <div className="droneSectionTitle">Fuel (Angler)</div>
            <div className="droneRow">
              <span className="droneLabel">1 fuel lasts (game time)</span>
              <span className="droneStepperValue">{(anglerFuelDurationGameSec / 60).toFixed(1)} min</span>
            </div>
            <div className="droneRow">
              <span className="droneLabel">1 fuel lasts (real time)</span>
              <span className="droneStepperValue">
                {anglerFuelDurationSecReal >= 60
                  ? Math.floor(anglerFuelDurationSecReal / 60) + ":" + String(Math.round(anglerFuelDurationSecReal % 60)).padStart(2, "0")
                  : Math.round(anglerFuelDurationSecReal) + " s"}
              </span>
            </div>
            <div className="droneRow">
              <span className="droneLabel">Fuel Duration Multiplier</span>
              <span className="droneStepperValue">{fuelDurationMultiplier.toFixed(2)}×</span>
            </div>
            <div className="droneRow droneFuelGemsRow">
              <span className="droneFuelGemsLabel">
                <img src={GEM_ICON} alt="" className="droneSkillIcon" aria-hidden />
                <span className="droneLabel">
                  Fuel cost (100% uptime)
                  <Tooltip
                    content={{
                      title: "Fuel cost (100% uptime)",
                      lines: [
                        "Average gems per hour spent on fuel to keep the Angler Drone fueled 100% of the time.",
                        "Fuels per hour × (1 − Fuel Save Chance) × 5 gems per fuel.",
                      ],
                    }}
                  />
                </span>
              </span>
              <span className="droneFuelGemsValue" aria-label={`${anglerFuelGemsPerHour.toFixed(1)} gems per hour cost`}>
                −{anglerFuelGemsPerHour.toFixed(1)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="droneSection">
          <div className="droneSectionTitle">Fishing</div>
          <p className="droneHint" style={{ marginTop: 0, marginBottom: 10 }}>
            Ticks from this drone and extra fish based on your Fishing module selection (location, rod, etc.). Open Fishing to update.
          </p>
          <div className="droneRow">
            <span className="droneLabel">Fishing ticks per hour (from drone)</span>
            <span className="droneStepperValue">
              {state.anglerDroneOn ? anglerTicksPerHour.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
            </span>
          </div>
          {state.anglerDroneOn && anglerFishingData.extraPerFish.length > 0 ? (
            <>
              <div className="droneRow">
                <span className="droneLabel">Total extra fish/h (from ticks)</span>
                <span className="droneStepperValue">
                  {anglerFishingData.totalExtraFishPerHour.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  {" "}({anglerFishingData.extraFishPct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%)
                </span>
              </div>
              <div className="droneSubTitle" style={{ marginTop: 8, marginBottom: 4 }}>Extra fish by type</div>
              <ul className="droneList small" style={{ margin: 0, paddingLeft: 20 }}>
                {anglerFishingData.extraPerFish.map(({ fishName, extraFishPerHour }) => (
                  <li key={fishName}>
                    <span className="mono">{fishName}</span>: +{extraFishPerHour.toLocaleString(undefined, { maximumFractionDigits: 1 })}/h
                  </li>
                ))}
              </ul>
            </>
          ) : state.anglerDroneOn ? (
            <p className="droneHint small" style={{ marginBottom: 0 }}>
              No fish with power in Fishing module. Open Fishing, select a dock and ensure rod/drones give power to at least one fish.
            </p>
          ) : null}
        </div>
      </Collapsible>
    </div>
  );
}