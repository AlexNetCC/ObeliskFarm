import { useEffect, useMemo, useRef, useState } from "react";
import "./drone.css";
import { Tooltip } from "../../components/Tooltip";
import { Collapsible } from "../../components/Collapsible";
import { loadJson, saveJson } from "../../lib/storage";
import { calculateGemBombGemsPerHour, defaultGameParameters, getGameSpeedMultiplier, type GameParameters } from "../../lib/gemev/freebieEv";
import { FREE_BUFFS, GEM_BUFFS, getDurationMinutes, getWeight } from "../../lib/lootbug/constants";

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

/** Frogger Lootfrog chance: 0% at grade 0, +0.003% per grade, max 0.135% (with Polychrome card). */
const FROGGER_LOOTFROG_CHANCE_PCT_PER_GRADE = 0.003;
const FROGGER_LOOTFROG_CHANCE_PCT_MAX = 0.135;

const LOOTFROG_TOTAL_WEIGHT = 196;
const LOOTFROG_WIKI_IMG = "https://shminer.miraheze.org/wiki/Special:FilePath";

function lootfrogIconUrl(file: string): string {
  return `${LOOTFROG_WIKI_IMG}/${encodeURIComponent(file)}`;
}

/** Lootfrog rewards: label, weight (chance), gem EV (null = not calculable), icon (wiki filename). 1 skill point = 125 gems. */
const LOOTFROG_REWARDS: Array<{ label: string; weight: number; gemEv: number | null; iconFile: string | null }> = [
  { label: "50–100 Gems", weight: 70, gemEv: 75, iconFile: "Gem.png" },
  { label: "15–30 Fuel", weight: 40, gemEv: 112.5, iconFile: "Fuel.png" }, // 22.5 fuel × 5
  { label: "10–20 Relic Chests", weight: 50, gemEv: null, iconFile: "Relic_Chest.png" },
  { label: "1 Lootbug Lantern", weight: 1, gemEv: null, iconFile: "Lootbug_Lantern.png" },
  { label: "4–8 Tier 2 Items", weight: 8, gemEv: null, iconFile: "Items_Button.png" },
  { label: "1–3 Skill Points", weight: 2, gemEv: 250, iconFile: "Skill_Point.png" }, // 2 sp × 125
  { label: "3–5 Sushi", weight: 8, gemEv: null, iconFile: "Sushi.png" },
  { label: "4–10 Blue Cow", weight: 6, gemEv: null, iconFile: "Blue_Cow.png" },
  { label: "1 Frogspawn", weight: 1, gemEv: null, iconFile: "Frogspawn.png" },
  { label: "150–300 Gems", weight: 4, gemEv: 225, iconFile: "Gem.png" },
  { label: "100–150 Relic Chests", weight: 2, gemEv: null, iconFile: "Relic_Chest.png" },
  { label: "1000–3000 Gems", weight: 2, gemEv: 2000, iconFile: "Gem.png" },
  { label: "15–30 Sushi", weight: 2, gemEv: null, iconFile: "Sushi.png" },
];

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
/** Angler fuel buff: 1% proc per Angler cycle. When proc: +6 ticks (base), +2% Legendary Fish Chance, 1:45 duration. Per grade: +6 ticks, +2%, +0:05.25. Max (Poly): +222 ticks, +52%, 3:09. */
const ANGLER_BUFF_PROC_CHANCE = 0.01;
const ANGLER_BUFF_TICKS_BASE = 6;
const ANGLER_BUFF_TICKS_PER_GRADE = 6;
const ANGLER_BUFF_TICKS_MAX = 222;
const ANGLER_BUFF_LEGENDARY_PCT_BASE = 2;
const ANGLER_BUFF_LEGENDARY_PCT_PER_GRADE = 2;
const ANGLER_BUFF_LEGENDARY_PCT_MAX = 52;
const ANGLER_BUFF_DURATION_BASE_SEC = 105; // 1:45
const ANGLER_BUFF_DURATION_SEC_PER_GRADE = 5.25; // +0:05.25
const ANGLER_BUFF_DURATION_MAX_SEC = 189; // 3:09

/** Starburst Drone: Stargazing. Suit: Triple Star Chance 6% base + 1% per level. Fuel buff: +100% Auto-catch (always), +15% Star Spawn Rate at grade 0, +1% per grade; duration 2:20 at grade 0, +0:09 per grade. */
const STARBURST_TRIPLE_STAR_PCT_BASE = 6;
const STARBURST_TRIPLE_STAR_PCT_PER_LEVEL = 1;
const STARBURST_FUEL_DURATION_BASE_SEC = 140; // 2:20
const STARBURST_FUEL_DURATION_SEC_PER_GRADE = 9;
const STARBURST_STAR_SPAWN_PCT_BASE = 15;
const STARBURST_STAR_SPAWN_PCT_PER_GRADE = 1;

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
  /** Platinum Statue of Appetite (Pet): +15% fuel duration (multiplicative). */
  platinumStatueOfAppetite: boolean;
  /** World 3 upgrade: Fuel Duration +0.15% per level (multiplicative). */
  fuelDurationWorld3Level: number;
  /** Frogger Drone */
  /** Frogger Drone enabled (ON). When OFF, contributions to Gem EV/fuel are zero. */
  froggerDroneOn: boolean;
  froggerSuitLevel: number;
  froggerGradeLevel: number;
  froggerFueled: boolean;
  lootfrogsUnlocked: boolean;
  /** Lootfrog Loot Multiplier; affects all rewards. */
  lootfrogLootMultiplier: number;
  /** Triple Lootfrog Chance (%); 3 instead of 1, does not block capacity. */
  tripleLootfrogChancePct: number;
  /** 10× Lootfrog Chance (%); 10 instead of 1, does not block capacity. */
  lootfrog10xChancePct: number;
  /** Lootfrog capacity; default 5. */
  lootfrogCapacity: number;
  /** Golden Lootfrog Chance (%); rewards × Golden Lootfrog Multiplier. */
  goldenLootfrogChancePct: number;
  /** Golden Lootfrog Multiplier; base 2×. */
  goldenLootfrogMultiplier: number;
  /** Big Lootfrog Chance (%); rewards × Big Lootfrog Multiplier. */
  bigLootfrogChancePct: number;
  /** Big Lootfrog Multiplier; base 5×. */
  bigLootfrogMultiplier: number;
  /** Bomb Bear Drone: when fueled, +X% Lootbug Spawn Rate (multiplicative with Lootbug stats). */
  bombBearDroneOn: boolean;
  bombBearGradeLevel: number;
  bombBearFueled: boolean;
  /** Angler Drone: gives fishing ticks; when fueled, buff (extra ticks / legendary % / duration). */
  anglerDroneOn: boolean;
  anglerSuitLevel: number;
  anglerGradeLevel: number;
  anglerFueled: boolean;
  /** Starburst Drone: Stargazing; suit = Triple Star Chance, fuel = +100% Auto-catch / +X% Star Spawn Rate. */
  starburstDroneOn: boolean;
  starburstSuitLevel: number;
  starburstGradeLevel: number;
  starburstFueled: boolean;
};

const STORAGE_KEY = "obeliskfarm:web:drone_elixir_save.json:v7";
const STORAGE_KEY_V6 = "obeliskfarm:web:drone_elixir_save.json:v6";
const STORAGE_KEY_V5 = "obeliskfarm:web:drone_elixir_save.json:v5";
const STORAGE_KEY_V4 = "obeliskfarm:web:drone_elixir_save.json:v4";
const STORAGE_KEY_V3 = "obeliskfarm:web:drone_elixir_save.json:v3";
const STORAGE_KEY_V2 = "obeliskfarm:web:drone_elixir_save.json:v2";
const STORAGE_KEY_V1 = "obeliskfarm:web:drone_elixir_save.json:v1";
const GEMEV_STORAGE_KEY = "obeliskfarm:web:gemev_save.json:v1";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";
const LOOTBUG_STORAGE_KEY = "obeliskfarm:web:lootbug_save.json:v1";
const LOOTBUG_BASE_SPAWN_MIN = 20;
const DEFAULT_ACTIVE_GEM_BUFFS = ["2x Game Speed", "10x Bomb Recharge"];
const GEM_ICON = "https://static.wikitide.net/shminerwiki/a/aa/Gem.png";
/** 1 fuel = 5 gems (in-game cost). */
const GEMS_PER_FUEL = 5;

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

const DEFAULT: ElixirState = {
  gameSpeedMultiplier: 1,
  elixirDroneOn: false,
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
  platinumStatueOfAppetite: false,
  fuelDurationWorld3Level: 0,
  froggerDroneOn: false,
  froggerSuitLevel: 8,
  froggerGradeLevel: 0,
  froggerFueled: false,
  lootfrogsUnlocked: false,
  lootfrogLootMultiplier: 1,
  tripleLootfrogChancePct: 0,
  lootfrog10xChancePct: 0,
  lootfrogCapacity: 5,
  goldenLootfrogChancePct: 0,
  goldenLootfrogMultiplier: 2,
  bigLootfrogChancePct: 0,
  bigLootfrogMultiplier: 5,
  bombBearDroneOn: false,
  bombBearGradeLevel: 0,
  bombBearFueled: false,
  anglerDroneOn: false,
  anglerSuitLevel: 0,
  anglerGradeLevel: 0,
  anglerFueled: false,
  starburstDroneOn: false,
  starburstSuitLevel: 0,
  starburstGradeLevel: 0,
  starburstFueled: false,
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

function migrateFromV4(migrated: Partial<ElixirState>): Partial<ElixirState> {
  return {
    ...migrated,
    starburstDroneOn: typeof migrated.starburstDroneOn === "boolean" ? migrated.starburstDroneOn : DEFAULT.starburstDroneOn,
    starburstSuitLevel: clamp(migrated.starburstSuitLevel ?? DEFAULT.starburstSuitLevel, 0, 20),
    starburstGradeLevel: clamp(migrated.starburstGradeLevel ?? DEFAULT.starburstGradeLevel, 0, 45),
    starburstFueled: typeof migrated.starburstFueled === "boolean" ? migrated.starburstFueled : DEFAULT.starburstFueled,
  };
}

function migrateFromV5(migrated: Partial<ElixirState>): Partial<ElixirState> {
  return {
    ...migrated,
    lootfrogsUnlocked: typeof migrated.lootfrogsUnlocked === "boolean" ? migrated.lootfrogsUnlocked : DEFAULT.lootfrogsUnlocked,
  };
}

function migrateFromV6(migrated: Partial<ElixirState>): Partial<ElixirState> {
  return {
    ...migrated,
    lootfrogLootMultiplier: clamp(migrated.lootfrogLootMultiplier ?? DEFAULT.lootfrogLootMultiplier, 0.1, 20),
    tripleLootfrogChancePct: clamp(migrated.tripleLootfrogChancePct ?? DEFAULT.tripleLootfrogChancePct, 0, 100),
    lootfrog10xChancePct: clamp(migrated.lootfrog10xChancePct ?? DEFAULT.lootfrog10xChancePct, 0, 100),
    lootfrogCapacity: clampInt(migrated.lootfrogCapacity ?? DEFAULT.lootfrogCapacity, 1, 999),
    goldenLootfrogChancePct: clamp(migrated.goldenLootfrogChancePct ?? DEFAULT.goldenLootfrogChancePct, 0, 100),
    goldenLootfrogMultiplier: clamp(migrated.goldenLootfrogMultiplier ?? DEFAULT.goldenLootfrogMultiplier, 1, 20),
    bigLootfrogChancePct: clamp(migrated.bigLootfrogChancePct ?? DEFAULT.bigLootfrogChancePct, 0, 100),
    bigLootfrogMultiplier: clamp(migrated.bigLootfrogMultiplier ?? DEFAULT.bigLootfrogMultiplier, 1, 20),
  };
}

export function Drone() {
  const [state, setState] = useState<ElixirState>(() => {
    const saved = loadJson<Record<string, unknown>>(STORAGE_KEY)
      ?? loadJson<Record<string, unknown>>(STORAGE_KEY_V6)
      ?? loadJson<Record<string, unknown>>(STORAGE_KEY_V5)
      ?? loadJson<Record<string, unknown>>(STORAGE_KEY_V4)
      ?? loadJson<Record<string, unknown>>(STORAGE_KEY_V3)
      ?? loadJson<Record<string, unknown>>(STORAGE_KEY_V2)
      ?? loadJson<Record<string, unknown>>(STORAGE_KEY_V1);
    const migrated = saved
      ? migrateFromV6(
          migrateFromV5(
            migrateFromV4(migrateFromV3(migrateFromV2(migrateFromV1(saved))))
          )
        )
      : {};
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
    s.platinumStatueOfAppetite = typeof migrated.platinumStatueOfAppetite === "boolean" ? migrated.platinumStatueOfAppetite : DEFAULT.platinumStatueOfAppetite;
    s.fuelDurationWorld3Level = Math.max(0, Math.trunc(Number(s.fuelDurationWorld3Level ?? 0)));
    s.froggerSuitLevel = clamp(s.froggerSuitLevel ?? DEFAULT.froggerSuitLevel, 0, 20);
    s.froggerGradeLevel = clamp(s.froggerGradeLevel ?? DEFAULT.froggerGradeLevel, 0, 45);
    s.froggerDroneOn = typeof migrated.froggerDroneOn === "boolean" ? migrated.froggerDroneOn : DEFAULT.froggerDroneOn;
    s.froggerFueled = typeof migrated.froggerFueled === "boolean" ? migrated.froggerFueled : DEFAULT.froggerFueled;
    s.lootfrogsUnlocked = typeof migrated.lootfrogsUnlocked === "boolean" ? migrated.lootfrogsUnlocked : DEFAULT.lootfrogsUnlocked;
    s.bombBearDroneOn = typeof migrated.bombBearDroneOn === "boolean" ? migrated.bombBearDroneOn : DEFAULT.bombBearDroneOn;
    s.bombBearGradeLevel = clamp(s.bombBearGradeLevel ?? DEFAULT.bombBearGradeLevel, 0, 45);
    s.bombBearFueled = typeof migrated.bombBearFueled === "boolean" ? migrated.bombBearFueled : DEFAULT.bombBearFueled;
    s.anglerDroneOn = typeof migrated.anglerDroneOn === "boolean" ? migrated.anglerDroneOn : DEFAULT.anglerDroneOn;
    s.anglerSuitLevel = clamp(s.anglerSuitLevel ?? DEFAULT.anglerSuitLevel, 0, 20);
    s.anglerGradeLevel = clamp(s.anglerGradeLevel ?? DEFAULT.anglerGradeLevel, 0, 45);
    s.anglerFueled = typeof migrated.anglerFueled === "boolean" ? migrated.anglerFueled : DEFAULT.anglerFueled;
    s.starburstDroneOn = typeof migrated.starburstDroneOn === "boolean" ? migrated.starburstDroneOn : DEFAULT.starburstDroneOn;
    s.starburstSuitLevel = clamp(s.starburstSuitLevel ?? DEFAULT.starburstSuitLevel, 0, 20);
    s.starburstGradeLevel = clamp(s.starburstGradeLevel ?? DEFAULT.starburstGradeLevel, 0, 45);
    s.starburstFueled = typeof migrated.starburstFueled === "boolean" ? migrated.starburstFueled : DEFAULT.starburstFueled;
    const sgExt = loadJson<{ starburstDroneOn?: boolean }>("obeliskfarm:web:stargazing_external.json");
    if (typeof sgExt?.starburstDroneOn === "boolean") s.starburstDroneOn = sgExt.starburstDroneOn;
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
  const platinumStatueMult = state.platinumStatueOfAppetite ? 1.15 : 1;
  // Coal, World 3, Gasoline, Axolotl, Platinum Statue, Cards, Relics: multiplicative. Round once at the end.
  const fuelDurationGameSec = Math.round(
    fuelDurationFromGradeSec *
    (1 + state.fuelDurationUpgradeLevel / 100) *
    fuelDurationWorld3Mult *
    (state.gasolineGuzzler ? 1 + GASOLINE_GUZZLER_FUEL_DURATION_PCT / 100 : 1) *
    (state.axolotlSkin ? 1.1 : 1) *
    platinumStatueMult *
    MISC_FUEL_MULT[state.miscFuelCardTier] *
    fuelDurationRelicMult,
  );
  const fuelDurationSecReal = fuelDurationGameSec / gameSpeedMult;
  const fuelDurationMultiplier =
    (1 + state.fuelDurationUpgradeLevel / 100) *
    fuelDurationWorld3Mult *
    (state.gasolineGuzzler ? 1 + GASOLINE_GUZZLER_FUEL_DURATION_PCT / 100 : 1) *
    (state.axolotlSkin ? 1.1 : 1) *
    platinumStatueMult *
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
    platinumStatueMult *
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
    platinumStatueMult *
    MISC_FUEL_MULT[state.miscFuelCardTier] *
    fuelDurationRelicMult,
  );
  const bombBearFuelDurationSecReal = bombBearFuelDurationGameSec / gameSpeedMult;

  /** Angler: interval (game time) = 1140 − suit×2 s; real time = interval / game speed. Base ticks per hour = 2 × 3600 / (interval/gameSpeed). */
  const anglerIntervalSecGame = Math.max(1, ANGLER_BASE_INTERVAL_SEC - state.anglerSuitLevel * ANGLER_SUIT_SEC_PER_LEVEL);
  const anglerIntervalSecReal = anglerIntervalSecGame / gameSpeedMult;
  const anglerBaseTicksPerHour = (ANGLER_TICKS_PER_INTERVAL * 3600) / anglerIntervalSecReal;
  /** Angler fuel buff: 1% proc per Angler cycle. When proc: +6 ticks (base) + 6×grade, +2% Legendary Chance, duration 1:45 + 5.25s×grade. */
  const anglerBuffTicksPerProc = state.anglerDroneOn && state.anglerFueled
    ? Math.min(ANGLER_BUFF_TICKS_MAX, ANGLER_BUFF_TICKS_BASE + ANGLER_BUFF_TICKS_PER_GRADE * state.anglerGradeLevel)
    : 0;
  const anglerProcsPerHour = state.anglerDroneOn && state.anglerFueled
    ? ANGLER_BUFF_PROC_CHANCE * (3600 / anglerIntervalSecReal)
    : 0;
  const anglerBuffTicksPerHour = anglerProcsPerHour * anglerBuffTicksPerProc;
  const anglerTicksPerHour = anglerBaseTicksPerHour + anglerBuffTicksPerHour;
  /** Buff uptime and legendary bonus for Fishing: when buff active, LEGENDARY_CATCH_BASE is reduced by bonusPct. */
  const anglerBuffDurationSec = state.anglerDroneOn && state.anglerFueled
    ? Math.min(ANGLER_BUFF_DURATION_MAX_SEC, ANGLER_BUFF_DURATION_BASE_SEC + ANGLER_BUFF_DURATION_SEC_PER_GRADE * state.anglerGradeLevel)
    : 0;
  const anglerTimeBetweenProcsSec = anglerProcsPerHour > 0 ? 3600 / anglerProcsPerHour : 0;
  const anglerBuffUptimeFraction = anglerTimeBetweenProcsSec > 0 && anglerBuffDurationSec > 0
    ? Math.min(1, anglerBuffDurationSec / anglerTimeBetweenProcsSec)
    : 0;
  const anglerLegendaryBonusPct = state.anglerDroneOn && state.anglerFueled
    ? Math.min(ANGLER_BUFF_LEGENDARY_PCT_MAX, ANGLER_BUFF_LEGENDARY_PCT_BASE + ANGLER_BUFF_LEGENDARY_PCT_PER_GRADE * state.anglerGradeLevel)
    : 0;

  /** Angler fuel duration: 3:00 base + 0:09 per grade (shared multipliers). */
  const anglerFuelDurationFromGradeSec = ANGLER_FUEL_DURATION_BASE_SEC + state.anglerGradeLevel * ANGLER_FUEL_DURATION_SEC_PER_GRADE;
  const anglerFuelDurationGameSec = Math.round(
    anglerFuelDurationFromGradeSec *
    (1 + state.fuelDurationUpgradeLevel / 100) *
    fuelDurationWorld3Mult *
    (state.gasolineGuzzler ? 1 + GASOLINE_GUZZLER_FUEL_DURATION_PCT / 100 : 1) *
    (state.axolotlSkin ? 1.1 : 1) *
    platinumStatueMult *
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

  /** Starburst: Triple Star Chance from suit (when ON). 6% base + 1% per level. */
  const starburstTripleStarChancePct = state.starburstDroneOn ? STARBURST_TRIPLE_STAR_PCT_BASE + state.starburstSuitLevel * STARBURST_TRIPLE_STAR_PCT_PER_LEVEL : 0;
  /** Starburst fuel duration: 2:20 base + 0:09 per grade (same coal/card mults). */
  const starburstFuelDurationFromGradeSec = STARBURST_FUEL_DURATION_BASE_SEC + state.starburstGradeLevel * STARBURST_FUEL_DURATION_SEC_PER_GRADE;
  const starburstFuelDurationGameSec = Math.round(
    starburstFuelDurationFromGradeSec *
    (1 + state.fuelDurationUpgradeLevel / 100) *
    fuelDurationWorld3Mult *
    (state.gasolineGuzzler ? 1 + GASOLINE_GUZZLER_FUEL_DURATION_PCT / 100 : 1) *
    (state.axolotlSkin ? 1.1 : 1) *
    platinumStatueMult *
    MISC_FUEL_MULT[state.miscFuelCardTier] *
    fuelDurationRelicMult,
  );
  const starburstFuelDurationSecReal = starburstFuelDurationGameSec / gameSpeedMult;
  /** When fueled: +15% at grade 0, +1% per grade. Applied as mult (1 + pct/100) for uptime fraction in Stargazing. */
  const starburstStarSpawnRatePct = state.starburstDroneOn && state.starburstFueled
    ? STARBURST_STAR_SPAWN_PCT_BASE + state.starburstGradeLevel * STARBURST_STAR_SPAWN_PCT_PER_GRADE
    : 0;
  const starburstFuelGemsPerHour = useMemo(() => {
    if (!state.starburstFueled || starburstFuelDurationSecReal <= 0) return 0;
    const fuelsPerHour = 3600 / starburstFuelDurationSecReal;
    const coal = state.fuelSaveChanceUpgradeLevel / 100;
    const upgrade = state.upgradeFuelSaveChancePct / 100;
    const saveChance = 1 - (1 - coal) * (1 - upgrade);
    return fuelsPerHour * (1 - saveChance) * GEMS_PER_FUEL;
  }, [starburstFuelDurationSecReal, state.starburstFueled, state.fuelSaveChanceUpgradeLevel, state.upgradeFuelSaveChancePct]);

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

  /** Lootfrog gains: spawns/h per reward, gems/h for calculable rewards. Only when lootfrogsUnlocked. */
  const { lootfrogGainsRows, lootfrogsPerHour } = useMemo(() => {
    if (!state.lootfrogsUnlocked) return { lootfrogGainsRows: [], lootfrogsPerHour: 0 };
    const autofiresPerHour = 3600 / Math.max(0.1, froggerBombIntervalSecReal);
    const spawnChancePct = Math.min(
      state.froggerGradeLevel * FROGGER_LOOTFROG_CHANCE_PCT_PER_GRADE,
      FROGGER_LOOTFROG_CHANCE_PCT_MAX
    );
    const triggersPerHour = autofiresPerHour * (spawnChancePct / 100);
    const triplePct = state.tripleLootfrogChancePct / 100;
    const tenXPct = state.lootfrog10xChancePct / 100;
    const expectedPerTrigger = 1 + 2 * triplePct + 9 * tenXPct;
    const lootfrogsPerHour = triggersPerHour * expectedPerTrigger;
    const lootMult = state.lootfrogLootMultiplier;
    const goldenPct = state.goldenLootfrogChancePct / 100;
    const goldenMult = (1 - goldenPct) + goldenPct * state.goldenLootfrogMultiplier;
    const bigPct = state.bigLootfrogChancePct / 100;
    const bigMult = (1 - bigPct) + bigPct * state.bigLootfrogMultiplier;
    const rewardMult = lootMult * goldenMult * bigMult;
    const rows = LOOTFROG_REWARDS.map((r) => {
      const spawnsPerHour = lootfrogsPerHour * (r.weight / LOOTFROG_TOTAL_WEIGHT);
      const gemsPerHour = r.gemEv != null ? spawnsPerHour * r.gemEv * rewardMult : null;
      return { ...r, spawnsPerHour, gemsPerHour };
    });
    return { lootfrogGainsRows: rows, lootfrogsPerHour };
  }, [
    state.lootfrogsUnlocked,
    froggerBombIntervalSecReal,
    state.froggerGradeLevel,
    state.lootfrogLootMultiplier,
    state.tripleLootfrogChancePct,
    state.lootfrog10xChancePct,
    state.goldenLootfrogChancePct,
    state.goldenLootfrogMultiplier,
    state.bigLootfrogChancePct,
    state.bigLootfrogMultiplier,
  ]);

  const lootfrogTotalGemsPerHour = useMemo(
    () => lootfrogGainsRows.reduce((s, r) => s + (r.gemsPerHour ?? 0), 0),
    [lootfrogGainsRows],
  );

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
    const ext = loadJson<Record<string, unknown>>(GEMEV_EXTERNAL_KEY) ?? {};
    ext.droneBomb10xMinPerHour = state.elixirDroneOn ? droneBomb10xMinPerHour : 0;
    const elixirFuelGems = state.elixirDroneOn && state.fueled ? fuelGemsPerHour : 0;
    const froggerFuelGems = state.froggerDroneOn && state.froggerFueled ? froggerFuelGemsPerHour : 0;
    const bombBearFuelGems = state.bombBearDroneOn && state.bombBearFueled ? bombBearFuelGemsPerHour : 0;
    const anglerFuelGems = state.anglerDroneOn && state.anglerFueled ? anglerFuelGemsPerHour : 0;
    const starburstFuelGems = state.starburstDroneOn && state.starburstFueled ? starburstFuelGemsPerHour : 0;
    ext.droneFuelGemsPerHour = elixirFuelGems + froggerFuelGems + bombBearFuelGems + anglerFuelGems + starburstFuelGems;
    ext.elixirFuelGemsPerHour = elixirFuelGems;
    ext.bombBearLootbugSpawnRateMult = bombBearLootbugSpawnRateMult;
    ext.fishingUnlocked = state.fishingUnlocked;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [droneBomb10xMinPerHour, fuelGemsPerHour, froggerFuelGemsPerHour, bombBearFuelGemsPerHour, anglerFuelGemsPerHour, starburstFuelGemsPerHour, bombBearLootbugSpawnRateMult, state.elixirDroneOn, state.fueled, state.froggerDroneOn, state.froggerFueled, state.bombBearDroneOn, state.bombBearFueled, state.anglerDroneOn, state.anglerFueled, state.starburstDroneOn, state.starburstFueled, state.fishingUnlocked]);

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
  const elixir2xStarMinPerHour = drone2xStarUptimeFraction * 60;
  /** Starburst: when ON and fueled, 100% uptime of +Star Spawn Rate and 100% Auto-catch (60 min/h). */
  const starburstStarSpawnRateUptimeFraction = state.starburstDroneOn && state.starburstFueled ? 1 : 0;
  const starburstAutoCatch100MinPerHour = state.starburstDroneOn && state.starburstFueled ? 60 : 0;
  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(STARGAZING_EXTERNAL_KEY) ?? {};
    ext.drone2xStarUptimeFraction = drone2xStarUptimeFraction;
    ext.drone3xSuperUptimeFraction = drone3xSuperUptimeFraction;
    ext.elixir2xStarMinPerHour = elixir2xStarMinPerHour;
    ext.starburstDroneOn = state.starburstDroneOn;
    ext.starburstTripleStarChancePct = starburstTripleStarChancePct;
    ext.starburstStarSpawnRateUptimeFraction = starburstStarSpawnRateUptimeFraction;
    ext.starburstStarSpawnRatePct = starburstStarSpawnRatePct;
    ext.starburstAutoCatch100MinPerHour = starburstAutoCatch100MinPerHour;
    saveJson(STARGAZING_EXTERNAL_KEY, ext);
  }, [drone2xStarUptimeFraction, drone3xSuperUptimeFraction, elixir2xStarMinPerHour, state.starburstDroneOn, starburstTripleStarChancePct, starburstStarSpawnRateUptimeFraction, starburstStarSpawnRatePct, starburstAutoCatch100MinPerHour]);

  /** Starburst contribution to star/SS offline: computed from drone state so it updates when fuel/suit/grade change. Triple Star (suit) multiplies stars per spawn by 1+2×triple; Star Spawn Rate (when fueled) multiplies spawn rate. */
  const starburstContribution = useMemo(() => {
    if (!state.starburstDroneOn) {
      return { multTriple: 1, multSpawn: 1, pctStarsOff: 0, pctSSOff: 0, pctFromTriple: 0, pctFromSpawn: 0 };
    }
    const tripleFrac = Math.max(0, Math.min(1, starburstTripleStarChancePct / 100));
    const multTriple = 1 + 2 * tripleFrac; // stars per spawn: 1 → 1+2*T
    const multSpawn = state.starburstFueled
      ? 1 + starburstStarSpawnRateUptimeFraction * (starburstStarSpawnRatePct / 100)
      : 1;
    const pctFromTriple = (multTriple - 1) * 100;
    const pctFromSpawn = (multSpawn - 1) * 100;
    const pctStarsOff = (multTriple * multSpawn - 1) * 100; // stars: triple and spawn rate
    const pctSSOff = (multSpawn - 1) * 100; // SS: only spawn rate (no triple from Starburst)
    return { multTriple, multSpawn, pctStarsOff, pctSSOff, pctFromTriple, pctFromSpawn };
  }, [state.starburstDroneOn, state.starburstFueled, starburstTripleStarChancePct, starburstStarSpawnRateUptimeFraction, starburstStarSpawnRatePct]);

  const FISHING_EXTERNAL_KEY = "obeliskfarm:web:fishing_external.json";
  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(FISHING_EXTERNAL_KEY) ?? {};
    ext.elixir3xFishingTickSpeedMinPerHour = elixir3xFishingTickSpeedMinPerHour;
    ext.elixir3xFishingTickSpeedUptimeFraction = elixir3xFishingTickSpeedUptimeFraction;
    ext.anglerTicksPerHour = state.anglerDroneOn ? anglerTicksPerHour : 0;
    ext.anglerBaseTicksPerHour = state.anglerDroneOn ? anglerBaseTicksPerHour : 0;
    ext.anglerBuffTicksPerHour = state.anglerDroneOn && state.anglerFueled ? anglerBuffTicksPerHour : 0;
    ext.anglerLegendaryBonusPct = state.anglerDroneOn && state.anglerFueled ? anglerLegendaryBonusPct : 0;
    ext.anglerBuffUptimeFraction = state.anglerDroneOn && state.anglerFueled ? anglerBuffUptimeFraction : 0;
    saveJson(FISHING_EXTERNAL_KEY, ext);
  }, [elixir3xFishingTickSpeedMinPerHour, elixir3xFishingTickSpeedUptimeFraction, state.anglerDroneOn, state.anglerFueled, anglerTicksPerHour, anglerBaseTicksPerHour, anglerBuffTicksPerHour, anglerLegendaryBonusPct, anglerBuffUptimeFraction]);

  /** Drone's share of Gem EV/h from 10× Bomb Recharge (from Gem EV module). */
  const drone10xGemEvPerHour = (() => {
    const ext = loadJson<{ gemBomb10xImpact?: number; total10xMinPerHour?: number }>(GEMEV_EXTERNAL_KEY);
    const total10x = typeof ext?.total10xMinPerHour === "number" ? ext.total10xMinPerHour : 0;
    const impact = typeof ext?.gemBomb10xImpact === "number" ? ext.gemBomb10xImpact : 0;
    if (total10x <= 0) return 0;
    return impact * (droneBomb10xMinPerHour / total10x);
  })();

  /** Fishing data for Angler subsection: read from Fishing. Compute suit/buff split locally so it updates when grade changes (Fishing may be unmounted). */
  const anglerFishingData = useMemo(() => {
    const ext = loadJson<{
      effectiveTickSec?: number;
      fishGains?: Array<{
        fishId: string;
        fishName: string;
        baseFishPerHour?: number;
        fishPerHour?: number;
      }>;
      anglerBreakdown?: {
        extraFromSuit: number;
        extraFromBuff: number;
        legendaryPctIncrease: number;
        totalBaseAll: number;
        totalFullAll: number;
        perFish: Array<{ fishId: string; fishName: string; base: number; suit: number; full: number; extraPct: number }>;
      };
      lootbugFishing12TicksProcsPerHour?: number;
      giftSushiPerHour?: number;
      anglerTicksUsedForFishGains?: number;
    }>(FISHING_EXTERNAL_KEY);
    const effectiveTickSec = typeof ext?.effectiveTickSec === "number" ? ext.effectiveTickSec : 0;
    const breakdown = ext?.anglerBreakdown;
    const gains = Array.isArray(ext?.fishGains) ? ext.fishGains : [];
    const anglerTicksUsed = typeof ext?.anglerTicksUsedForFishGains === "number" && ext.anglerTicksUsedForFishGains > 0 ? ext.anglerTicksUsedForFishGains : anglerTicksPerHour;
    const scale = anglerTicksUsed > 0 ? anglerTicksPerHour / anglerTicksUsed : 1;
    const extraPerFish = breakdown?.perFish
      ? breakdown.perFish.map((p) => {
          const base = p.base;
          const oldExtra = p.full - p.base;
          const newExtra = oldExtra * scale;
          const full = base + newExtra;
          const pct = base > 0 ? (newExtra / base) * 100 : 0;
          return {
            fishId: p.fishId,
            fishName: p.fishName,
            baseFishPerHour: base,
            fishPerHour: full,
            extraFishPerHour: newExtra,
            extraPct: pct,
          };
        })
      : gains.map((g) => {
          const base = typeof g.baseFishPerHour === "number" ? g.baseFishPerHour : g.fishPerHour ?? 0;
          const full = typeof g.fishPerHour === "number" ? g.fishPerHour : base;
          const extra = full - base;
          const pct = base > 0 ? (extra / base) * 100 : 0;
          return { ...g, baseFishPerHour: base, fishPerHour: full, extraFishPerHour: extra, extraPct: pct };
        });
    const totalBaseFishPerHour = extraPerFish.reduce((s, g) => s + (g.baseFishPerHour ?? 0), 0);
    const totalFullFishPerHour = extraPerFish.reduce((s, g) => s + (g.fishPerHour ?? 0), 0);
    const totalExtraFishPerHour = totalFullFishPerHour - totalBaseFishPerHour;
    const extraFishPct = totalBaseFishPerHour > 0 ? (totalExtraFishPerHour / totalBaseFishPerHour) * 100 : 0;

    /** Compute suit/buff split from tick proportions: Angler share of total ticks, then suit vs buff within Angler. Updates when grade changes. */
    let extraFromSuit = breakdown?.extraFromSuit ?? 0;
    let extraFromBuff = breakdown?.extraFromBuff ?? 0;
    const lootbugTicks = typeof ext?.lootbugFishing12TicksProcsPerHour === "number" ? Math.max(0, ext.lootbugFishing12TicksProcsPerHour) : 0;
    const sushiTicks = (typeof ext?.giftSushiPerHour === "number" ? Math.max(0, ext.giftSushiPerHour) : 0) * 90;
    const totalTicks = anglerTicksPerHour + lootbugTicks + sushiTicks;
    if (totalTicks > 0 && anglerTicksPerHour > 0 && totalExtraFishPerHour > 0) {
      const anglerShare = anglerTicksPerHour / totalTicks;
      const extraFromAngler = totalExtraFishPerHour * anglerShare;
      extraFromSuit = extraFromAngler * (anglerBaseTicksPerHour / anglerTicksPerHour);
      extraFromBuff = extraFromAngler * (anglerBuffTicksPerHour / anglerTicksPerHour);
    }

    /** Legendary % increase: buff lowers effective base, so rate ≈ 1/(1 - bonus×uptime). Computed locally so it updates with grade. */
    let legendaryPctIncrease = breakdown?.legendaryPctIncrease ?? 0;
    if (anglerLegendaryBonusPct > 0 && anglerBuffUptimeFraction > 0) {
      const factor = 1 - (anglerLegendaryBonusPct / 100) * anglerBuffUptimeFraction;
      if (factor > 0 && factor < 1) legendaryPctIncrease = (1 / factor - 1) * 100;
    }

    return {
      effectiveTickSec,
      extraPerFish,
      totalExtraFishPerHour,
      totalBaseFishPerHour,
      totalFullFishPerHour,
      extraFishPct,
      extraFromSuit,
      extraFromBuff,
      legendaryPctIncrease,
    };
  }, [state.anglerDroneOn, state.anglerSuitLevel, state.anglerGradeLevel, anglerTicksPerHour, anglerBaseTicksPerHour, anglerBuffTicksPerHour, anglerLegendaryBonusPct, anglerBuffUptimeFraction]);

  /** Gem EV/h from Bomb Bear: when no buff (mult 1), show 0. Prefer value from Lootbug (includes Gems, 10×, Item Chests). Fallback: live calc from gems+net10x when Lootbug has not run yet. */
  const bombBearLootbugGemsEvPerHour = (() => {
    if (bombBearLootbugSpawnRateMult <= 1) return 0;
    const ext = loadJson<{
      bombBearLootbugGemsEvPerHour?: number;
      lootbugGemsPerHour?: number;
      lootbugNet10xGemEvPerHour?: number;
    }>(GEMEV_EXTERNAL_KEY);
    const fromLootbug = typeof ext?.bombBearLootbugGemsEvPerHour === "number" && ext.bombBearLootbugGemsEvPerHour >= 0 ? ext.bombBearLootbugGemsEvPerHour : null;
    if (fromLootbug !== null) return fromLootbug;
    const gems = typeof ext?.lootbugGemsPerHour === "number" && ext.lootbugGemsPerHour >= 0 ? ext.lootbugGemsPerHour : 0;
    const net10x = typeof ext?.lootbugNet10xGemEvPerHour === "number" ? ext.lootbugNet10xGemEvPerHour : 0;
    const totalGains = gems + net10x;
    return totalGains * (bombBearLootbugSpawnRateMult - 1) / bombBearLootbugSpawnRateMult;
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

      <Collapsible id="drone-fuel-save-duration" title="Fuel Save/Duration" defaultExpanded={false}>
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
              <span className="droneBlockHeaderTitle">Construct</span>
            </div>
            <div className="droneCheckboxRow">
              <img
                src="https://static.wikitide.net/shminerwiki/4/4d/4_Statue_Appetite_Platinized.png"
                alt=""
                className="droneSkillIcon"
                aria-hidden
              />
              <input
                id="elixir-platinum-statue-appetite"
                type="checkbox"
                className="droneCheckbox"
                checked={state.platinumStatueOfAppetite}
                onChange={(e) => update({ platinumStatueOfAppetite: e.target.checked })}
              />
              <label htmlFor="elixir-platinum-statue-appetite" className="droneLabel">
                Platinum Statue of Appetite (+15% fuel duration)
              </label>
            </div>
          </div>

          <div className="droneUpgradesBlock" style={{ marginTop: 10 }}>
            <div className="droneBlockHeader">
              <span className="droneBlockHeaderTitle">Skill Tree</span>
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

      <Collapsible
        id="drone-elixir"
        title="Elixir Drone"
        defaultExpanded={false}
        headerRight={
          <div className="droneCheckboxRow" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <img src="https://static.wikitide.net/shminerwiki/b/bd/Drone_Elixir.png" alt="" className="droneHeaderIcon" aria-hidden />
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
        }
      >
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
              <span className="droneStepperValue">{formatMinSec(fuelDurationGameSec)}</span>
            </div>
            <div className="droneRow">
              <span className="droneLabel">1 fuel lasts (real time)</span>
              <span className="droneStepperValue">{formatMinSec(fuelDurationSecReal)}</span>
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
            /** 2× Star Spawn Rate min/h from Lootbug: computed from saved Lootbug state so value updates without opening Lootbug. */
            const lootbug2xStarMinPerHour = (() => {
              const lootbugSave = loadJson<{ spawnRateMultiplier?: number; tripleChancePct?: number; goldenChancePct?: number; activeGemBuffs?: string[] }>(LOOTBUG_STORAGE_KEY) ?? {};
              const gameSpeed = gameSpeedMult;
              if (gameSpeed <= 0) return 0;
              const spawnRateMult = clamp(lootbugSave.spawnRateMultiplier ?? 1, 0.1, 20);
              const triplePct = clamp(lootbugSave.tripleChancePct ?? 0, 0, 100) / 100;
              const goldenPct = clamp(lootbugSave.goldenChancePct ?? 0, 0, 100) / 100;
              const activeGemBuffs = Array.isArray(lootbugSave.activeGemBuffs) ? lootbugSave.activeGemBuffs : DEFAULT_ACTIVE_GEM_BUFFS;
              const buyGemBuffsSet = new Set(activeGemBuffs);
              const effectiveSpawnRateMult = spawnRateMult;
              const effectiveSpawnMinGame = effectiveSpawnRateMult > 0 ? LOOTBUG_BASE_SPAWN_MIN / effectiveSpawnRateMult : 0;
              const effectiveSpawnMinReal = gameSpeed > 0 && effectiveSpawnMinGame > 0 ? effectiveSpawnMinGame / gameSpeed : 0;
              const spawnsPerHour = effectiveSpawnMinReal > 0 ? 60 / effectiveSpawnMinReal : 0;
              const expectedLootbugsPerSpawn = 1 + 2 * triplePct;
              const lootbugsPerHour = spawnsPerHour * expectedLootbugsPerSpawn;
              const totalFreeWeight = FREE_BUFFS.reduce((s, b) => s + getWeight(b), 0);
              const totalGemWeightAll = GEM_BUFFS.reduce((s, b) => s + getWeight(b), 0);
              const freeBuff = FREE_BUFFS.find((b) => b.name === "2x Star Spawn Rate");
              const gemBuff = GEM_BUFFS.find((b) => b.name === "2x Star Spawn Rate");
              const freeMin = getDurationMinutes(freeBuff?.duration ?? null) ?? 0;
              const gemMin = getDurationMinutes(gemBuff?.duration ?? null) ?? 0;
              let freeMinPerHour = 0;
              if (freeBuff && totalFreeWeight > 0) {
                const perHour = (lootbugsPerHour * getWeight(freeBuff)) / totalFreeWeight;
                freeMinPerHour = (perHour * freeMin) / gameSpeed;
              }
              let gemMinPerHour = 0;
              if (gemBuff && totalGemWeightAll > 0) {
                const perHour = (lootbugsPerHour * getWeight(gemBuff)) / totalGemWeightAll;
                const effectiveRate = buyGemBuffsSet.has("2x Star Spawn Rate") ? 1 : goldenPct;
                gemMinPerHour = (perHour * effectiveRate * gemMin) / gameSpeed;
              }
              return freeMinPerHour + gemMinPerHour;
            })();
            const lootbug2xStarUptimeFraction = Math.min(1, lootbug2xStarMinPerHour / 60);
            const combined2xStarUptime = 1 - (1 - pStar) * (1 - lootbug2xStarUptimeFraction);
            const starSuperOverlapInclLootbugPct = combined2xStarUptime * pSuper * 100;
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
                <div className="droneBuffPlotSummary">
                  <span className="droneBuffPlotSummaryLabel">
                    Star Spawn Rate + SS Rate overlap incl. Lootbug
                    <Tooltip
                      content={{
                        title: "Star Spawn Rate & SS Rate overlap incl. Lootbug",
                        sections: [
                          {
                            heading: "Meaning",
                            lines: [
                              "Same overlap (2× Star and 3× Super Star both active) but 2× Star uptime includes Lootbug: free 2× Star Spawn Rate plus gem buff (bought or from Golden Lootbug).",
                            ],
                          },
                          {
                            heading: "Formula",
                            lines: [
                              "Combined 2× Star uptime = 1 − (1 − Drone uptime) × (1 − Lootbug min/h ÷ 60). Overlap = combined 2× Star × Drone 3× Super uptime. Uses saved Lootbug state (no need to open Lootbug).",
                            ],
                          },
                        ],
                      }}
                    />
                  </span>
                  <span className="droneBuffPlotSummaryValue">{starSuperOverlapInclLootbugPct.toFixed(2)}%</span>
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

      <Collapsible
        id="drone-frogger"
        title="Frogger Drone"
        defaultExpanded={false}
        headerRight={
          <div className="droneCheckboxRow" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <img src="https://static.wikitide.net/shminerwiki/e/e8/Drone_Frogger.png" alt="" className="droneHeaderIcon" aria-hidden />
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
        }
      >
        <div className="droneSection">
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

          <div className="droneCheckboxRow">
            <img
              src="https://static.wikitide.net/shminerwiki/9/93/Lootfrog.png"
              alt=""
              className="droneSkillIcon"
              aria-hidden
            />
            <input
              id="frogger-lootfrogs-unlocked"
              type="checkbox"
              className="droneCheckbox"
              checked={state.lootfrogsUnlocked}
              onChange={(e) => update({ lootfrogsUnlocked: e.target.checked })}
            />
            <label htmlFor="frogger-lootfrogs-unlocked" className="droneLabel">
              Lootfrogs unlocked?
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
              <span className="droneStepperValue">{formatMinSec(froggerFuelDurationGameSec)}</span>
            </div>
            <div className="droneRow">
              <span className="droneLabel">1 fuel lasts (real time)</span>
              <span className="droneStepperValue">{formatMinSec(froggerFuelDurationSecReal)}</span>
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

        {state.lootfrogsUnlocked ? (
          <div className="droneSection">
            <div className="droneSectionTitle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img src="https://static.wikitide.net/shminerwiki/9/93/Lootfrog.png" alt="" className="droneSkillIcon" aria-hidden />
              Lootfrog
            </div>
            <div className="droneLootfrogParams">
            <div className="droneRow">
              <span className="droneLabel">
                Chance to spawn a frog (grade {state.froggerGradeLevel})
                <Tooltip
                  content={{
                    title: "Lootfrog chance",
                    lines: [
                      "0% at grade 0, +0.003% per grade, max 0.135% (with Polychrome card).",
                    ],
                  }}
                />
              </span>
              <span className="droneStepperValue">
                {Math.min(
                  state.froggerGradeLevel * FROGGER_LOOTFROG_CHANCE_PCT_PER_GRADE,
                  FROGGER_LOOTFROG_CHANCE_PCT_MAX
                ).toFixed(3)}%
              </span>
            </div>
            <div className="droneRow">
              <span className="droneLabel">Lootfrogs/h</span>
              <span className="droneStepperValue mono">{lootfrogsPerHour.toFixed(2)}</span>
            </div>

            <NumInput
              label="Lootfrog Loot Multiplier"
              value={state.lootfrogLootMultiplier}
              onChange={(n) => update({ lootfrogLootMultiplier: clamp(n, 0.1, 20) })}
              min={0.1}
              max={20}
              decimals={2}
              suffix="×"
              tooltip={{
                title: "Lootfrog Loot Multiplier",
                lines: ["All Lootfrog rewards are affected by the Lootfrog Loot Multiplier."],
              }}
            />
            <NumInput
              label="Triple Lootfrog Chance (%)"
              value={state.tripleLootfrogChancePct}
              onChange={(n) => update({ tripleLootfrogChancePct: clamp(n, 0, 100) })}
              min={0}
              max={100}
              decimals={2}
              suffix="%"
              tooltip={{
                title: "Triple Lootfrog Chance",
                lines: ["Chance for 3 Lootfrogs instead of 1. Does not block Lootfrog capacity."],
              }}
            />
            <NumInput
              label="10× Lootfrog Chance (%)"
              value={state.lootfrog10xChancePct}
              onChange={(n) => update({ lootfrog10xChancePct: clamp(n, 0, 100) })}
              min={0}
              max={100}
              decimals={2}
              suffix="%"
              tooltip={{
                title: "10× Lootfrog Chance",
                lines: ["Chance for 10 Lootfrogs instead of 1. Does not block Lootfrog capacity."],
              }}
            />
            <Stepper
              label="Lootfrog Capacity"
              value={state.lootfrogCapacity}
              onChange={(n) => update({ lootfrogCapacity: clampInt(n, 1, 999) })}
              min={1}
              max={999}
              tooltip={{
                title: "Lootfrog Capacity",
                lines: ["Default 5. Maximum Lootfrogs that can be held."],
              }}
            />
            <NumInput
              label="Golden Lootfrog Chance (%)"
              value={state.goldenLootfrogChancePct}
              onChange={(n) => update({ goldenLootfrogChancePct: clamp(n, 0, 100) })}
              min={0}
              max={100}
              decimals={2}
              suffix="%"
              tooltip={{
                title: "Golden Lootfrog Chance",
                lines: ["Golden Lootfrog rewards are multiplied by the Golden Lootfrog Multiplier."],
              }}
            />
            <NumInput
              label="Golden Lootfrog Multiplier"
              value={state.goldenLootfrogMultiplier}
              onChange={(n) => update({ goldenLootfrogMultiplier: clamp(n, 1, 20) })}
              min={1}
              max={20}
              decimals={2}
              suffix="×"
              tooltip={{
                title: "Golden Lootfrog Multiplier",
                lines: ["Base 2×. Applied to Golden Lootfrog rewards (incl. chance)."],
              }}
            />
            <NumInput
              label="Big Lootfrog Chance (%)"
              value={state.bigLootfrogChancePct}
              onChange={(n) => update({ bigLootfrogChancePct: clamp(n, 0, 100) })}
              min={0}
              max={100}
              decimals={2}
              suffix="%"
              tooltip={{
                title: "Big Lootfrog Chance",
                lines: ["Big Lootfrog rewards are multiplied by the Big Lootfrog Multiplier."],
              }}
            />
            <NumInput
              label="Big Lootfrog Multiplier"
              value={state.bigLootfrogMultiplier}
              onChange={(n) => update({ bigLootfrogMultiplier: clamp(n, 1, 20) })}
              min={1}
              max={20}
              decimals={2}
              suffix="×"
              tooltip={{
                title: "Big Lootfrog Multiplier",
                lines: ["Base 5×. Applied to Big Lootfrog rewards (incl. chance)."],
              }}
            />
            </div>

            <div className="droneRow droneFuelGemsRow droneBomb10xRow" style={{ marginTop: 6 }}>
              <span className="droneFuelGemsLabel">
                <img src={GEM_ICON} alt="" className="droneSkillIcon" aria-hidden />
                <span className="droneLabel">Lootfrog Gems/h (calculable)</span>
              </span>
              <span className="droneFuelGemsValue droneBomb10xGemEvValue" aria-label={`${lootfrogTotalGemsPerHour.toFixed(1)} gems per hour from Lootfrog`}>
                +{lootfrogTotalGemsPerHour.toFixed(1)}
              </span>
            </div>

            <Collapsible id="drone-lootfrog-gains" title="Lootfrog gains" defaultExpanded={false}>
              <div className="droneLootfrogTableWrap">
                <table className="droneLootfrogTable">
                  <thead>
                    <tr>
                      <th className="droneLootfrogThName">Reward</th>
                      <th className="droneLootfrogThSpawn">Reward/h</th>
                      <th className="droneLootfrogThGems">
                        <img src={GEM_ICON} alt="" className="droneLootfrogGemsIcon" aria-hidden />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lootfrogGainsRows.map((r) => (
                      <tr key={r.label} className="droneLootfrogRow">
                        <td className="droneLootfrogTdName">
                          <span className="droneLootfrogRewardCell">
                            {r.iconFile ? (
                              <img src={lootfrogIconUrl(r.iconFile)} alt="" className="droneLootfrogIcon" aria-hidden />
                            ) : null}
                            <span>{r.label}</span>
                          </span>
                        </td>
                        <td className="droneLootfrogTdSpawn">
                          <span className="mono">{r.spawnsPerHour.toFixed(3)}</span>
                        </td>
                        <td className="droneLootfrogTdGems">
                          {r.gemsPerHour != null ? (
                            <span className="droneLootfrogGemsCell">
                              <img src={GEM_ICON} alt="" className="droneLootfrogGemsIcon" aria-hidden />
                              <span className="mono droneBomb10xGemEvValue">+{r.gemsPerHour.toFixed(1)}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Collapsible>
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

      <Collapsible
        id="drone-bomb-bear"
        title="Bomb Bear Drone"
        defaultExpanded={false}
        headerRight={
          <div className="droneCheckboxRow" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <img src="https://static.wikitide.net/shminerwiki/6/6c/Drone_Bear.png" alt="" className="droneHeaderIcon" aria-hidden />
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
                      "When fueled: +30% Lootbug spawn rate at grade 0, +3% per grade, max +90% (Polychrome). Multiplicative in-game.",
                    ],
                  },
                  {
                    heading: "Setup",
                    lines: [
                      "Enter your spawn rate in Lootbug as measured in-game (with Bomb Bear ON). Keep Bomb Bear ON here.",
                      "Lootbug gains = from your entered rate. This section shows the extra Gem EV from Bomb Bear alone.",
                    ],
                  },
                ],
              }}
            />
          </div>
        }
      >
        <div className="droneSection">
          <p className="droneHint" style={{ marginTop: 0, marginBottom: 10 }}>
            When fueled, Bomb Bear increases Lootbug spawn rate (multiplicative with Lootbug stats). Enter your spawn rate in Lootbug as measured with Bomb Bear ON; keep Bomb Bear ON here to see the extra gain from the Drone.
          </p>
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
              <span className="droneStepperValue">{formatMinSec(bombBearFuelDurationGameSec)}</span>
            </div>
            <div className="droneRow">
              <span className="droneLabel">1 fuel lasts (real time)</span>
              <span className="droneStepperValue">{formatMinSec(bombBearFuelDurationSecReal)}</span>
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
            <span className="droneLabel">
              Lootbug Spawn Rate Mult
              <Tooltip
                content={{
                  title: "Lootbug Spawn Rate Mult",
                  sections: [
                    {
                      heading: "Meaning",
                      lines: [
                        "Bomb Bear's multiplier when fueled: 1 + buff % (e.g. 1.69× = +69%).",
                      ],
                    },
                    {
                      heading: "Use",
                      lines: [
                        "Used with Lootbug gains to compute Gem EV/h from Bomb Bear: extra = gains × (mult − 1) ÷ mult.",
                        "Your entered spawn rate = base × this mult. So base = entered ÷ mult.",
                      ],
                    },
                  ],
                }}
              />
            </span>
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
                          "Extra Gem EV per hour from Bomb Bear alone: Lootbug gains (with Bomb Bear) minus gains without Bomb Bear.",
                        ],
                      },
                      {
                        heading: "Formula",
                        lines: [
                          "extra = Lootbug gains × (Bomb Bear mult − 1) ÷ Bomb Bear mult.",
                          "Computed in Lootbug from Gems + 10× + Item Chests. Open Lootbug once to sync.",
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

      <Collapsible
        id="drone-angler"
        title="Angler Drone"
        defaultExpanded={false}
        headerRight={
          <div className="droneCheckboxRow" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <img src="https://static.wikitide.net/shminerwiki/5/54/Drone_Angler.png" alt="" className="droneHeaderIcon" aria-hidden />
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
        }
      >
        <div className="droneSection">
          <p className="droneHint" style={{ marginTop: 0, marginBottom: 10 }}>
            Gives 2 Fishing Ticks every {ANGLER_BASE_INTERVAL_SEC} s (game time). Suit: Time Between Fishing Ticks −40 s. Integrates with Fishing module for ticks and extra fish.
          </p>
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
              <span className="droneStepperValue">{formatMinSec(anglerFuelDurationGameSec)}</span>
            </div>
            <div className="droneRow">
              <span className="droneLabel">1 fuel lasts (real time)</span>
              <span className="droneStepperValue">{formatMinSec(anglerFuelDurationSecReal)}</span>
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
                <span className="droneLabel">Extra from 2 suit ticks</span>
                <span className="droneStepperValue mono">
                  +{anglerFishingData.extraFromSuit.toLocaleString(undefined, { maximumFractionDigits: 1 })} fish/h
                </span>
              </div>
              {state.anglerFueled && anglerBuffTicksPerHour > 0 ? (
                <>
                  <div className="droneRow">
                    <span className="droneLabel">Extra from 1% procs (buff, +6 ticks/grade)</span>
                    <span className="droneStepperValue mono">
                      +{anglerFishingData.extraFromBuff.toLocaleString(undefined, { maximumFractionDigits: 1 })} fish/h
                    </span>
                  </div>
                  <div className="droneRow">
                    <span className="droneLabel">Legendary fish: buff gives</span>
                    <span className="droneStepperValue mono">
                      +{anglerFishingData.legendaryPctIncrease.toLocaleString(undefined, { maximumFractionDigits: 1 })}%
                    </span>
                  </div>
                </>
              ) : null}
              {anglerFishingData.extraPerFish.some(({ extraFishPerHour }) => extraFishPerHour > 0) ? (
                <>
                  <div className="droneSubTitle" style={{ marginTop: 8, marginBottom: 4 }}>Extra fish by type</div>
                  <ul className="droneList small" style={{ margin: 0, paddingLeft: 20 }}>
                    {anglerFishingData.extraPerFish
                      .filter(({ extraFishPerHour }) => extraFishPerHour > 0)
                      .map(({ fishName, extraFishPerHour, extraPct }) => (
                        <li key={fishName}>
                          <span className="mono">{fishName}</span>: +{extraFishPerHour.toLocaleString(undefined, { maximumFractionDigits: 1 })}/h
                          {typeof extraPct === "number" && extraPct > 0 ? ` (+${extraPct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%)` : null}
                        </li>
                      ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : state.anglerDroneOn ? (
            <p className="droneHint small" style={{ marginBottom: 0 }}>
              No fish with power in Fishing module. Open Fishing, select a dock and ensure rod/drones give power to at least one fish.
            </p>
          ) : null}
        </div>
      </Collapsible>

      <Collapsible
        id="drone-starburst"
        title="Starburst Drone"
        defaultExpanded={false}
        headerRight={
          <div className="droneCheckboxRow" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <img src="https://static.wikitide.net/shminerwiki/5/54/Drone_Starburst.png" alt="" className="droneHeaderIcon" aria-hidden />
            <input
              id="starburst-drone-on"
              type="checkbox"
              className="droneCheckbox"
              checked={state.starburstDroneOn}
              onChange={(e) => update({ starburstDroneOn: e.target.checked })}
            />
            <label htmlFor="starburst-drone-on" className="droneLabel">
              Drone: {state.starburstDroneOn ? "ON" : "OFF"}
            </label>
            <Tooltip
              content={{
                title: "Starburst Drone",
                lines: ["When OFF, Starburst contributions (Triple Star Chance, Star Spawn Rate, 100% Auto-catch, fuel cost) are not sent to Stargazing."],
              }}
            />
          </div>
        }
      >
        <div className="droneSection">
          <p className="droneHint" style={{ marginTop: 0, marginBottom: 10 }}>
            Suit: Triple Star Chance. When fueled: +100% Auto-catch (always), +Star Spawn Rate. Effect is applied in the Stargazing module when this drone is ON.
          </p>
          <div className="droneSectionTitle">Settings</div>
          <Stepper
            label="Starburst Suit level"
            value={state.starburstSuitLevel}
            onChange={(n) => update({ starburstSuitLevel: n })}
            min={0}
            max={20}
            step={1}
            stepLarge={5}
            tooltip={{
              title: "Starburst Suit",
              lines: [
                "Triple Star Chance: 6% base + 1% per level. Stargazing uses this when drone is ON.",
              ],
            }}
          />
          <div className="droneRow">
            <span className="droneLabel">→ Triple Star Chance (suit)</span>
            <span className="droneStepperValue">
              {state.starburstDroneOn ? `${starburstTripleStarChancePct}%` : "—"}
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
              id="starburst-fueled"
              type="checkbox"
              className="droneCheckbox"
              checked={state.starburstFueled}
              onChange={(e) => update({ starburstFueled: e.target.checked })}
            />
            <label htmlFor="starburst-fueled" className="droneLabel">
              Drone fueled
            </label>
          </div>
          {state.starburstFueled ? (
            <div className="droneSubSection">
              <div className="droneSubTitle">When fueled</div>
              <Stepper
                label="Grade level"
                value={state.starburstGradeLevel}
                onChange={(n) => update({ starburstGradeLevel: n })}
                min={0}
                max={45}
                step={1}
                stepLarge={5}
                tooltip={{
                  title: "Starburst grade (fuel buff)",
                  lines: [
                    "Buff: +100% Auto-catch (always), +15% Star Spawn Rate at grade 0, +1% per grade. Duration: 2:20 at grade 0, +0:09 per grade.",
                    "Same fuel duration multipliers (Coal, Cards, etc.) as other drones.",
                  ],
                }}
              />
              <div className="droneRow">
                <span className="droneLabel">→ Star Spawn Rate (fuel buff)</span>
                <span className="droneStepperValue">
                  {state.starburstDroneOn ? `+${starburstStarSpawnRatePct}%` : "—"}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {state.starburstFueled ? (
          <div className="droneSection">
            <div className="droneSectionTitle">Fuel (Starburst)</div>
            <div className="droneRow">
              <span className="droneLabel">1 fuel lasts (game time)</span>
              <span className="droneStepperValue">{formatMinSec(starburstFuelDurationGameSec)}</span>
            </div>
            <div className="droneRow">
              <span className="droneLabel">1 fuel lasts (real time)</span>
              <span className="droneStepperValue">{formatMinSec(starburstFuelDurationSecReal)}</span>
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
                        "Average gems per hour spent on fuel to keep the Starburst Drone fueled 100% of the time.",
                        "Fuels per hour × (1 − Fuel Save Chance) × 5 gems per fuel.",
                      ],
                    }}
                  />
                </span>
              </span>
              <span className="droneFuelGemsValue" aria-label={`${starburstFuelGemsPerHour.toFixed(1)} gems per hour cost`}>
                −{starburstFuelGemsPerHour.toFixed(1)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="droneSection">
          <div className="droneSectionTitle">Stargazing</div>
          {state.starburstDroneOn ? (
            <div className="droneRow" style={{ gap: 8 }}>
              <span className="droneLabel">
                Starburst multi
                <Tooltip
                  content={{
                    title: "Starburst multi",
                    lines: [
                      "Combined multiplier from this drone: Triple Star (suit) × Star Spawn Rate (when fueled). Applied to star gain in Stargazing.",
                    ],
                  }}
                  label="?"
                />
              </span>
              <span className="droneStepperValue mono">
                ×{(starburstContribution.multTriple * starburstContribution.multSpawn).toFixed(2)}
              </span>
            </div>
          ) : (
            <p className="droneHint small" style={{ marginTop: 0, marginBottom: 0 }}>
              Turn drone ON to see Starburst multi (Triple Star × Star Spawn Rate when fueled).
            </p>
          )}
        </div>
      </Collapsible>
    </div>
  );
}