import { useEffect, useMemo, useState } from "react";
import "./fishing.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
import { mulberry32 } from "../../lib/rng";
import { loadJson, saveJson } from "../../lib/storage";
import {
  AQUARIUM,
  ALL_FISH,
  DOCKS,
  catchChancePercent,
  computeFishingStatsFromLevels,
  type ComputedFishingStats,
  dockIconUrl,
  effectiveFishingTickSec,
  ENHANCE_COSTS_T1,
  ENHANCE_COSTS_T2,
  ENHANCEMENTS_T1,
  ENHANCEMENTS_T2,
  expectedCatchesPerRoll,
  fishIconUrl,
  FISHING_SKILL_TREE,
  FISHING_UPGRADES_T1,
  FISHING_UPGRADES_T2,
  getFishById,
  upgradeIconUrl,
  enhanceIconUrl,
  UPGRADE_COSTS,
  type DockId,
  type EnhanceId,
  type FishingSkillId,
  type FishingUpgradeId,
} from "../../lib/fishing";

/** Fish card tier: 0 = none, 1 = Card (1.5×), 2 = Gilded (2×), 3 = Poly (4× base). */
export type FishCardTier = 0 | 1 | 2 | 3;

/** Sample from Poisson(lambda) using exponential inter-arrival. */
function samplePoisson(rng: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  let count = 0;
  let sum = 0;
  while (sum < lambda) {
    let u = rng();
    if (u <= 0) u = 1e-10;
    sum -= Math.log(u);
    count++;
  }
  return count - 1;
}

type SavedState = {
  dronesPerDock?: Partial<Record<DockId, number>>;
  activeDockId?: DockId | null;
  showDisabledFishGrayed?: boolean;
  upgradeLevels?: Partial<Record<FishingUpgradeId, number>>;
  enhanceLevels?: Partial<Record<EnhanceId, number>>;
  fishCardTier?: Partial<Record<string, FishCardTier>>;
  sushiCardTier?: FishCardTier;
  valuePackPotencyPoly?: boolean;
  skillTreeLevels?: Partial<Record<FishingSkillId, number>>;
  legendaryFishFound?: number;
};

/** Single persisted state (same pattern as Drone: one state, lazy load, save on change). */
type FishingState = {
  dronesPerDock: Record<DockId, number>;
  activeDockId: DockId;
  showDisabledFishGrayed: boolean;
  upgradeLevels: Partial<Record<FishingUpgradeId, number>>;
  enhanceLevels: Partial<Record<EnhanceId, number>>;
  fishCardTier: Partial<Record<string, FishCardTier>>;
  /** Sushi Misc card: 0 = none, 1 = Card +5 ticks, 2 = Gilded +10, 3 = Poly +20. */
  sushiCardTier: FishCardTier;
  /** Fishing Rod card: 0 = none, 1 = Card 1.02×, 2 = Gilded 1.05×, 3 = Poly 1.10× rod power. */
  fishingRodCardTier: FishCardTier;
  valuePackPotencyPoly: boolean;
  skillTreeLevels: Partial<Record<FishingSkillId, number>>;
  legendaryFishFound: number;
};

const STORAGE_KEY = "obeliskfarm:web:fishing_save.json:v1";
const FISHING_EXTERNAL_KEY = "obeliskfarm:web:fishing_external.json";

/** Sushi: base 90 ticks. Sushi Misc card: Card +5, Gilded +10, Poly +20. */
const SUSHI_BASE_TICKS = 90;
const SUSHI_CARD_TICKS: Record<FishCardTier, number> = { 0: 0, 1: 5, 2: 10, 3: 20 };
const SUSHI_MC_RUNS = 10000;

/** Fishing Rod card: Fishing Rod Power. Card 1.02×, Gilded 1.05×, Poly 1.10×. */
const FISHING_ROD_CARD_MULT: Record<FishCardTier, number> = { 0: 1, 1: 1.02, 2: 1.05, 3: 1.1 };

/** Elixir 3× Fishing Tick Speed buff icon (same as Drone module). */
const ELIXIR_3X_FISHING_BUFF_ICON = "https://static.wikitide.net/shminerwiki/8/87/Triple_Fish_Tick_Chance.png";

const FISHING_ICON = "https://static.wikitide.net/shminerwiki/f/fb/Fishing_Button.png";

/** Gem icon for enhancement costs (wiki File:Gem.png). */
const GEM_ICON_URL = fishIconUrl("Gem.png");

/** Skill point icon for Skill Tree costs (24px from wiki). */
const SKILL_POINT_ICON_URL = "https://static.wikitide.net/shminerwiki/thumb/5/51/Skill_Point.png/24px-Skill_Point.png";


function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replaceAll(",", ".").replaceAll(" ", "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function endsWithDecimalSeparator(raw: string): boolean {
  const t = raw.trim();
  return t.endsWith(".") || t.endsWith(",");
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Format minutes per hour as "m:ss" (e.g. 15.5 → "15:30"). */
function formatElixirMinSecPerHour(minPerHour: number): string {
  if (!Number.isFinite(minPerHour) || minPerHour < 0) return "0:00";
  const m = Math.floor(minPerHour);
  const s = Math.round((minPerHour - m) * 60);
  if (s >= 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format hours as "h:mm" (e.g. 5.2 → "5:12", 0.75 → "0:45"). */
function formatHoursToHhMin(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return "0:00";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Toggles for fish card tier: None (0), Card 1.5× (1), Gilded 2× (2), Poly 4× (3). Same layout as Stargazing card tier row. */
function FishCardTierToggles(props: { value: FishCardTier; onChange: (t: FishCardTier) => void }) {
  const { value, onChange } = props;
  const cur = value;
  const mk = (tier: FishCardTier, label: string) => (
    <button
      type="button"
      className={`btn btnSecondary fishingCardTierBtn ${cur === tier ? "cardBtnActive" : ""}`}
      onClick={() => onChange(cur === tier ? 0 : tier)}
    >
      {label} {cur === tier ? "✓" : ""}
    </button>
  );
  return (
    <div className="fishingCardTierRow">
      {mk(1, "Card")}
      {mk(2, "Gilded")}
      {mk(3, "Poly")}
    </div>
  );
}


/** Interpolate green (t=1) → red (t=0). t in [0,1]. Muted palette. */
function heatmapColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(140 + 70 * (1 - clamped));
  const g = Math.round(140 + 70 * clamped);
  const b = 120;
  return `rgb(${r},${g},${b})`;
}

/** Format "current→next" for the stat this upgrade changes. Used under upgrade name. */
function formatUpgradeNextEffect(
  upgradeId: FishingUpgradeId,
  current: ComputedFishingStats,
  next: ComputedFishingStats,
): string | null {
  switch (upgradeId) {
    case "fishing_rod":
      return `${Math.round(current.fishing_rod_power)}→${Math.round(next.fishing_rod_power)}`;
    case "fishing_drone":
    case "fishing_drone_2":
      return `${current.fishing_drone_cap.toFixed(1)}→${next.fishing_drone_cap.toFixed(1)}`;
    case "upgrade_boat":
      return `${current.boat_level}→${next.boat_level}`;
    case "upgrade_t2_boat":
      return `${current.t2_boat_level}→${next.t2_boat_level}`;
    case "tick_speed":
      return `${current.fishing_tick_reduction.toFixed(1)}s→${next.fishing_tick_reduction.toFixed(1)}s`;
    case "fish_multiplier":
      return `${current.fish_income_multi.toFixed(2)}×→${next.fish_income_multi.toFixed(2)}×`;
    case "rod_multiplier":
      return `${Math.round(current.fishing_rod_power)}→${Math.round(next.fishing_rod_power)}`;
    case "drone_multiplier":
      return `${current.drone_power_multiplier.toFixed(2)}×→${next.drone_power_multiplier.toFixed(2)}×`;
    case "drone_base_power":
      return `${current.drone_base_power.toFixed(2)}→${next.drone_base_power.toFixed(2)}`;
    case "drone_cloner":
      return `${current.fishing_drone_cap.toFixed(1)}→${next.fishing_drone_cap.toFixed(1)}`;
    case "shiny_multiplier":
      return `${current.shiny_multiplier.toFixed(2)}→${next.shiny_multiplier.toFixed(2)}`;
    case "poly_card_multi":
      return `${current.super_shiny_multiplier.toFixed(2)}→${next.super_shiny_multiplier.toFixed(2)}`;
    case "double_tick_chance":
      return "→+0.5%";
    case "shiny_fish_chance":
      return "→+0.5%";
    case "triple_tick_chance":
      return "→+0.35%";
    case "tier2_dock_power":
      return "→+0.05×";
    case "super_shiny_chance":
      return "→+1%";
    default:
      return null;
  }
}

/** Format "current→next" for the stat this enhancement changes. Used under enhancement name. */
function formatEnhanceNextEffect(
  enhanceId: EnhanceId,
  current: ComputedFishingStats,
  next: ComputedFishingStats,
): string | null {
  switch (enhanceId) {
    case "enhance_fish_multiplier":
      return `${current.fish_income_multi.toFixed(2)}×→${next.fish_income_multi.toFixed(2)}×`;
    case "enhance_fishing_drone":
    case "enhance_fishing_drone_3":
      return `${current.fishing_drone_cap.toFixed(1)}→${next.fishing_drone_cap.toFixed(1)}`;
    case "enhance_rod_multiplier":
      return `${Math.round(current.fishing_rod_power)}→${Math.round(next.fishing_rod_power)}`;
    case "enhance_tick_speed":
      return `${current.fishing_tick_reduction.toFixed(1)}s→${next.fishing_tick_reduction.toFixed(1)}s`;
    case "enhance_drone_multiplier":
      return `${current.drone_power_multiplier.toFixed(2)}×→${next.drone_power_multiplier.toFixed(2)}×`;
    case "enhance_token_multiplier":
      return `${current.token_gain_multi.toFixed(2)}×→${next.token_gain_multi.toFixed(2)}×`;
    case "enhance_shiny_multiplier":
      return `${current.shiny_multiplier.toFixed(2)}→${next.shiny_multiplier.toFixed(2)}`;
    case "enhance_double_tick_chance":
      return "→+0.5%";
    case "enhance_triple_tick_chance":
      return "→+0.4%";
    case "enhance_tier2_dock_power":
      return "→+0.05×";
    case "enhance_super_shiny_multi":
      return `${current.super_shiny_multiplier.toFixed(2)}→${next.super_shiny_multiplier.toFixed(2)}`;
    case "enhance_tiny_notice_chance":
      return "→+0.5%";
    default:
      return null;
  }
}

/** Options for skill tree when computing total fish per hour (for marginal %). */
type TotalFishOptions = {
  skillTreeLevels?: Partial<Record<FishingSkillId, number>>;
  fishCardTier?: Partial<Record<string, number>>;
  legendaryFishFound?: number;
  /** Fishing Rod card tier (0–3) for rod power mult 1 / 1.02 / 1.05 / 1.10. */
  fishingRodCardTier?: FishCardTier;
};

/**
 * Total fish per hour for given levels and dock assignment (same formula as Fishing gains list).
 * Used to compute marginal % gain from +1 level by comparing total with hypothetical levels.
 */
function computeTotalFishPerHour(
  upgradeLevels: Partial<Record<FishingUpgradeId, number>>,
  enhanceLevels: Partial<Record<EnhanceId, number>>,
  dronesPerDock: Record<DockId, number>,
  activeDockId: DockId,
  elixir3xFishingExternal: { uptimeFraction: number },
  skillOptions?: TotalFishOptions,
): number {
  const stats = computeFishingStatsFromLevels(upgradeLevels, enhanceLevels, skillOptions);
  const s = stats.shiny_fish_chance_pct / 100;
  const s2 = stats.super_shiny_chance_pct / 100;
  const expectedShinyMulti =
    (1 - s) * 1 +
    s * (1 - s2) * stats.shiny_multiplier +
    s * s2 * stats.shiny_multiplier * stats.super_shiny_multiplier;
  const tickDurationSec = Math.max(1, 60 + stats.fishing_tick_reduction);
  const effectiveTickSec = effectiveFishingTickSec(tickDurationSec, elixir3xFishingExternal.uptimeFraction);
  const doublePct = stats.double_tick_chance_pct / 100;
  const triplePct = stats.triple_tick_chance_pct / 100;
  const expectedRollsPerFill = 1 + doublePct + 2 * triplePct;
  const rodMult = (skillOptions?.fishingRodCardTier != null) ? FISHING_ROD_CARD_MULT[skillOptions.fishingRodCardTier] : 1;
  const baseRod = Math.round(stats.fishing_rod_power * rodMult);
  let total = 0;
  for (const set of AQUARIUM) {
    const dock = DOCKS.find((d) => d.id === set.dockId)!;
    const rod = activeDockId === set.dockId ? baseRod : 0;
    const n = dronesPerDock[set.dockId] ?? 0;
    const powerOnThisDock = rod + n * stats.drone_base_power;
    const dockFillsPerHour = 3600 / (dock.baseTicksNeeded * effectiveTickSec);
    for (const f of set.fish) {
      total +=
        dockFillsPerHour *
        expectedRollsPerFill *
        expectedCatchesPerRoll(powerOnThisDock, f.powerRating) *
        stats.fish_income_multi *
        expectedShinyMulti;
    }
  }
  return total;
}

/** Same formula as computeTotalFishPerHour but from precomputed stats (for skill breakdown). */
function computeTotalFishPerHourFromStats(
  stats: ComputedFishingStats,
  dronesPerDock: Record<DockId, number>,
  activeDockId: DockId,
  elixir3xFishingExternal: { uptimeFraction: number },
  effectiveRodPowerOverride?: number,
): number {
  const s = stats.shiny_fish_chance_pct / 100;
  const s2 = stats.super_shiny_chance_pct / 100;
  const expectedShinyMulti =
    (1 - s) * 1 +
    s * (1 - s2) * stats.shiny_multiplier +
    s * s2 * stats.shiny_multiplier * stats.super_shiny_multiplier;
  const tickDurationSec = Math.max(1, 60 + stats.fishing_tick_reduction);
  const effectiveTickSec = effectiveFishingTickSec(tickDurationSec, elixir3xFishingExternal.uptimeFraction);
  const doublePct = stats.double_tick_chance_pct / 100;
  const triplePct = stats.triple_tick_chance_pct / 100;
  const expectedRollsPerFill = 1 + doublePct + 2 * triplePct;
  const rodForActive = effectiveRodPowerOverride ?? stats.fishing_rod_power;
  let total = 0;
  for (const set of AQUARIUM) {
    const dock = DOCKS.find((d) => d.id === set.dockId)!;
    const rod = activeDockId === set.dockId ? rodForActive : 0;
    const n = dronesPerDock[set.dockId] ?? 0;
    const powerOnThisDock = rod + n * stats.drone_base_power;
    const dockFillsPerHour = 3600 / (dock.baseTicksNeeded * effectiveTickSec);
    for (const f of set.fish) {
      total +=
        dockFillsPerHour *
        expectedRollsPerFill *
        expectedCatchesPerRoll(powerOnThisDock, f.powerRating) *
        stats.fish_income_multi *
        expectedShinyMulti;
    }
  }
  return total;
}

function NumberRow(props: {
  label: string;
  iconUrl?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  decimals?: number;
  inputMode?: "decimal" | "numeric";
  suffix?: string;
}) {
  const {
    label,
    iconUrl,
    value,
    onChange,
    min = -Infinity,
    max = Infinity,
    decimals = 0,
    inputMode = "numeric",
    suffix = "",
  } = props;
  const [raw, setRaw] = useState<string>(Number.isFinite(value) ? String(value) : "");

  useEffect(() => {
    setRaw(Number.isFinite(value) ? String(value) : "");
  }, [value]);

  function commitFromRaw(nextRaw: string) {
    const trimmed = nextRaw.trim();
    if (!trimmed) {
      const v0 = clamp(0, min, max);
      onChange(v0);
      setRaw(String(v0));
      return;
    }
    const parsed = parseNumber(nextRaw);
    if (parsed === null) {
      setRaw(Number.isFinite(value) ? String(value) : "");
      return;
    }
    const v = clamp(parsed, min, max);
    onChange(v);
    setRaw(String(v));
  }

  const displayValue = Number.isFinite(value) ? value.toFixed(decimals) : "—";

  return (
    <div className="fishingRow">
      <div className="fishingLabel">
        <div className="fishingLabelLeft">
          {iconUrl ? (
            <img src={iconUrl} alt="" className="iconSmall" style={{ width: 18, height: 18, objectFit: "contain" }} />
          ) : null}
          <span className="fishingLabelName">{label}</span>
        </div>
      </div>
      <div className="fishingRowInputBlock">
        <div className="fishingInputWrap">
          <input
            className="input"
            inputMode={inputMode}
            value={raw}
            onChange={(e) => {
              const nextRaw = e.target.value;
              setRaw(nextRaw);
              if (endsWithDecimalSeparator(nextRaw)) return;
              const parsed = parseNumber(nextRaw);
              if (parsed === null) return;
              onChange(clamp(parsed, min, max));
            }}
            onBlur={() => commitFromRaw(raw)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>
        <span className="mono fishingRowValue">{displayValue}{suffix}</span>
      </div>
    </div>
  );
}

/** Read-only stat row: label and value on one line. */
function StatRow(props: {
  label: string;
  iconUrl?: string;
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  const { label, iconUrl, value, decimals = 0, suffix = "" } = props;
  const displayValue = Number.isFinite(value) ? value.toFixed(decimals) : "—";
  return (
    <div className="fishingRow fishingRowInline">
      <div className="fishingLabelLeft">
        {iconUrl ? (
          <img src={iconUrl} alt="" className="iconSmall" style={{ width: 18, height: 18, objectFit: "contain" }} />
        ) : null}
        <span className="fishingLabelName">{label}</span>
      </div>
      <span className="mono fishingRowValue">{displayValue}{suffix}</span>
    </div>
  );
}

const statsTooltip = {
  title: "Fishing stats",
  sections: [
    {
      heading: "Source",
      lines: ["Values are computed from your upgrade and enhancement levels, including boat levels (Upgrade Boat / Upgrade T2 Boat)."],
    },
    {
      heading: "Drones and gains",
      lines: [
        "Each fishing drone adds drone base power to the dock it is assigned to.",
        "Dock power = rod (on the dock you fish at) + (drones on that dock × drone base power).",
        "Higher power increases catch chance and fish per hour.",
      ],
    },
    {
      heading: "Tick reduction",
      lines: [
        "Seconds reduced from base 60s per tick.",
        "Example: -40 means 20s per tick.",
      ],
    },
    {
      heading: "Double / triple / 5× tick chance",
      lines: [
        "When the tick bar fills, you can get 2, 3, or 5 ticks at once instead of 1.",
        "Example: at 4/5, a 5× tick gives 5 ticks (bar fills and resets), then 4 more → 4/5 again.",
        "5× from fishing only is 0%; the game can add more from relics, store, or cards.",
      ],
    },
    {
      heading: "Shiny and super shiny",
      lines: [
        "Shiny works like a crit: a chance to multiply the catch (base 3×).",
        "Super shiny only rolls when the catch is already shiny; base multiplier 2× on top.",
      ],
    },
    {
      heading: "Elixir buff",
      lines: [
        "Buff uptime is calculated in the Drone module and applied to fish/h.",
        "Open Drone to sync.",
      ],
    },
  ],
};

export function Fishing() {
  const [state, setState] = useState<FishingState>(() => {
    const saved = loadJson<SavedState>(STORAGE_KEY);
    const upgradeLevels = saved?.upgradeLevels ?? {};
    const enhanceLevels = saved?.enhanceLevels ?? {};
    const computed = computeFishingStatsFromLevels(upgradeLevels, enhanceLevels);
    const dronesPerDock: Record<DockId, number> = {} as Record<DockId, number>;
    DOCKS.forEach((d, i) => {
      dronesPerDock[d.id] = saved?.dronesPerDock?.[d.id] ?? (i === 0 ? Math.max(0, Math.round(computed.fishing_drone_cap)) : 0);
    });
    const showDisabledFishGrayed = saved?.showDisabledFishGrayed ?? false;
    const activeDockId: DockId = (saved?.activeDockId != null ? saved.activeDockId : "lake") as DockId;
    const fishCardTier = saved?.fishCardTier ?? {};
    const sushiCardTier = clamp(Math.trunc(Number(saved?.sushiCardTier ?? 0)), 0, 3) as FishCardTier;
    const valuePackPotencyPoly = saved?.valuePackPotencyPoly ?? false;
    const skillTreeLevels = saved?.skillTreeLevels ?? {};
    const legendaryFishFound = clamp(Number(saved?.legendaryFishFound ?? 0), 0, 6);
    const fishingRodCardTier = clamp(Math.trunc(Number(saved?.fishingRodCardTier ?? 0)), 0, 3) as FishCardTier;
    return { dronesPerDock, showDisabledFishGrayed, activeDockId, upgradeLevels, enhanceLevels, fishCardTier, sushiCardTier, fishingRodCardTier, valuePackPotencyPoly, skillTreeLevels, legendaryFishFound };
  });

  useEffect(() => {
    saveJson(STORAGE_KEY, state);
  }, [state]);

  const [mcState, setMcState] = useState<{
    hours: number;
    runs: number;
    samples: number[] | null;
    samplesPerFish: Record<string, number[]> | null;
    running: boolean;
  }>({ hours: 24, runs: 10000, samples: null, samplesPerFish: null, running: false });

  const [sushiMcState, setSushiMcState] = useState<{
    samples: number[] | null;
    samplesPerFish: Record<string, number[]> | null;
    running: boolean;
  }>({ samples: null, samplesPerFish: null, running: false });

  const upgradeLevels = state.upgradeLevels ?? {};
  const enhanceLevels = state.enhanceLevels ?? {};
  const skillTreeLevels = state.skillTreeLevels ?? {};
  const skillTreeOptions = {
    skillTreeLevels,
    fishCardTier: state.fishCardTier,
    legendaryFishFound: state.legendaryFishFound,
  };
  const stats: ComputedFishingStats = computeFishingStatsFromLevels(upgradeLevels, enhanceLevels, skillTreeOptions);
  /** Rod power with Fishing Rod card (1× / 1.02× / 1.05× / 1.10×). Rounded so display and calculations use the same integer. */
  const effectiveRodPower = Math.round(stats.fishing_rod_power * FISHING_ROD_CARD_MULT[state.fishingRodCardTier]);

  /** Expected multiplier from Shiny (chance × multi) and Super Shiny (only when already shiny). */
  const expectedShinyMulti = useMemo(() => {
    const s = stats.shiny_fish_chance_pct / 100;
    const s2 = stats.super_shiny_chance_pct / 100;
    return (
      (1 - s) * 1 +
      s * (1 - s2) * stats.shiny_multiplier +
      s * s2 * stats.shiny_multiplier * stats.super_shiny_multiplier
    );
  }, [
    stats.shiny_fish_chance_pct,
    stats.super_shiny_chance_pct,
    stats.shiny_multiplier,
    stats.super_shiny_multiplier,
  ]);

  /** Card gain multiplier for a fish: tier 0 → 1×, Card → 1.5×, Gilded → 2×, Poly → 4×; when tier > 0 also × poly_card_gain_multi and Value Pack 1.15 if active. */
  const getCardMulti = useMemo(() => {
    const poly = stats.poly_card_gain_multi * (state.valuePackPotencyPoly ? 1.15 : 1);
    return (fishId: string): number => {
      const tier = (state.fishCardTier[fishId] ?? 0) as FishCardTier;
      if (tier === 0) return 1;
      const base = tier === 1 ? 1.5 : tier === 2 ? 2 : 4;
      return base * poly;
    };
  }, [stats.poly_card_gain_multi, state.valuePackPotencyPoly, state.fishCardTier]);

  /** Docks reachable with current boat levels: T1 level 0 = Lake, 1 = +Desert, 2 = +Tundra, …; T2 level 1 = Cave, 2 = +Volcano, … (T2 only when t2_boat_level >= 1). */
  const availableDocks = useMemo(
    () =>
      DOCKS.filter((d, i) => {
        if (d.tier === 1) return stats.boat_level >= i;
        return (stats.t2_boat_level ?? 0) >= i - 5;
      }),
    [stats.boat_level, stats.t2_boat_level],
  );

  const totalDronesAssigned = useMemo(
    () => DOCKS.reduce((sum, d) => sum + (state.dronesPerDock[d.id] ?? 0), 0),
    [state.dronesPerDock],
  );
  const droneCap = Math.floor(stats.fishing_drone_cap);

  /** Keep activeDockId on an available dock when boat levels change. */
  useEffect(() => {
    const ids = new Set(availableDocks.map((d) => d.id));
    if (!ids.has(state.activeDockId) && availableDocks.length > 0) {
      setState((prev) => ({ ...prev, activeDockId: availableDocks[0]!.id }));
    }
  }, [availableDocks, state.activeDockId]);

  function setDockDrones(dockId: DockId, delta: number) {
    setState((prev) => {
      const cur = prev.dronesPerDock[dockId] ?? 0;
      const total = DOCKS.reduce((s, d) => s + (prev.dronesPerDock[d.id] ?? 0), 0);
      const others = total - cur;
      const maxThis = Math.max(0, droneCap - others);
      const next = cur + delta;
      const clamped = Math.max(0, Math.min(maxThis, next));
      return { ...prev, dronesPerDock: { ...prev.dronesPerDock, [dockId]: clamped } };
    });
  }

  function setDockDronesTo(dockId: DockId, value: number) {
    setState((prev) => {
      const cur = prev.dronesPerDock[dockId] ?? 0;
      const total = DOCKS.reduce((s, d) => s + (prev.dronesPerDock[d.id] ?? 0), 0);
      const others = total - cur;
      const maxThis = Math.max(0, droneCap - others);
      const clamped = Math.max(0, Math.min(maxThis, value));
      return { ...prev, dronesPerDock: { ...prev.dronesPerDock, [dockId]: clamped } };
    });
  }

  function setFishingUpgradeLevel(upgradeId: FishingUpgradeId, delta: number) {
    const costs = UPGRADE_COSTS[upgradeId];
    if (!costs?.length) return;
    const maxLvl = costs[costs.length - 1]!.level;
    setState((prev) => {
      const prevLevels = prev.upgradeLevels ?? {};
      const cur = Math.max(0, Math.min(maxLvl, prevLevels[upgradeId] ?? 0));
      const next = Math.max(0, Math.min(maxLvl, cur + delta));
      return { ...prev, upgradeLevels: { ...prevLevels, [upgradeId]: next } };
    });
  }

  function setFishingEnhanceLevel(enhanceId: EnhanceId, delta: number) {
    const costsT1 = ENHANCE_COSTS_T1[enhanceId as keyof typeof ENHANCE_COSTS_T1];
    const costsT2 = ENHANCE_COSTS_T2[enhanceId as keyof typeof ENHANCE_COSTS_T2];
    const costs = costsT1 ?? costsT2;
    if (!costs?.length) return;
    const maxLvl = costs[costs.length - 1]!.level;
    setState((prev) => {
      const prevLevels = prev.enhanceLevels ?? {};
      const cur = Math.max(0, Math.min(maxLvl, prevLevels[enhanceId] ?? 0));
      const next = Math.max(0, Math.min(maxLvl, cur + delta));
      return { ...prev, enhanceLevels: { ...prevLevels, [enhanceId]: next } };
    });
  }

  function setSkillTreeLevel(skillId: FishingSkillId, delta: number) {
    const def = FISHING_SKILL_TREE.find((s) => s.id === skillId);
    if (!def || !def.costs.length) return;
    const maxLvl = def.costs.length;
    setState((prev) => {
      const prevLevels = prev.skillTreeLevels ?? {};
      const cur = Math.max(0, Math.min(maxLvl, prevLevels[skillId] ?? 0));
      const next = Math.max(0, Math.min(maxLvl, cur + delta));
      return { ...prev, skillTreeLevels: { ...prevLevels, [skillId]: next } };
    });
  }

  /** Power on a dock: rod only on the dock you're fishing at (active); else 0. Plus drones on this dock. */
  function powerForDock(dockId: DockId): number {
    const rod = state.activeDockId === dockId ? effectiveRodPower : 0;
    const n = state.dronesPerDock[dockId] ?? 0;
    return rod + n * stats.drone_base_power;
  }

  /** Base tick duration in seconds (60 + reduction, e.g. -40 → 20). */
  const tickDurationSec = Math.max(1, 60 + stats.fishing_tick_reduction);
  /** Elixir 3× and Angler Drone: from Drone module (fishing_external.json). Open Drone to sync. */
  const fishingExternalData = (() => {
    const ext = loadJson<{
      elixir3xFishingTickSpeedMinPerHour?: number;
      elixir3xFishingTickSpeedUptimeFraction?: number;
      anglerTicksPerHour?: number;
      lootbugFishing12TicksProcsPerHour?: number;
    }>(FISHING_EXTERNAL_KEY);
    const minPerHour = typeof ext?.elixir3xFishingTickSpeedMinPerHour === "number" ? ext.elixir3xFishingTickSpeedMinPerHour : 0;
    const uptimeFraction =
      typeof ext?.elixir3xFishingTickSpeedUptimeFraction === "number"
        ? Math.max(0, Math.min(1, ext.elixir3xFishingTickSpeedUptimeFraction))
        : 0;
    const anglerTicksPerHour = typeof ext?.anglerTicksPerHour === "number" ? Math.max(0, ext.anglerTicksPerHour) : 0;
    const lootbugFishing12TicksProcsPerHour = typeof ext?.lootbugFishing12TicksProcsPerHour === "number" ? Math.max(0, ext.lootbugFishing12TicksProcsPerHour) : 0;
    return { elixir3xFishingExternal: { minPerHour, uptimeFraction }, anglerTicksPerHour, lootbugFishing12TicksProcsPerHour };
  })();
  const elixir3xFishingExternal = fishingExternalData.elixir3xFishingExternal;
  const anglerTicksPerHour = fishingExternalData.anglerTicksPerHour;
  const lootbugFishing12TicksProcsPerHour = fishingExternalData.lootbugFishing12TicksProcsPerHour;

  const effectiveTickSec = effectiveFishingTickSec(tickDurationSec, elixir3xFishingExternal.uptimeFraction);
  /** Fish/h multiplier from Elixir 3× buff (1 = no buff, 3 = 100% uptime). */
  const elixir3xFishingMulti =
    effectiveTickSec > 0 ? Math.min(3, tickDurationSec / effectiveTickSec) : 1;

  /** When a tick from Angler, Lootbug, or Sushi happens, it ticks on every dock (not distributed). So each dock gets the same +fills. */
  const extraFillsPerDockPerHour = anglerTicksPerHour + lootbugFishing12TicksProcsPerHour;

  const fishingGainsRows = useMemo(() => {
    const dockIds = new Set(availableDocks.map((d) => d.id));
    const rod = effectiveRodPower;
    const dronePower = stats.drone_base_power;
    const sets = AQUARIUM.filter((set) => dockIds.has(set.dockId));
    return sets.flatMap((set) => {
      const dock = DOCKS.find((d) => d.id === set.dockId)!;
      const rodHere = state.activeDockId === set.dockId ? rod : 0;
      const dronesHere = state.dronesPerDock[set.dockId] ?? 0;
      const powerOnThisDock = rodHere + dronesHere * dronePower;
      const dockFillsPerHour = 3600 / (dock.baseTicksNeeded * effectiveTickSec);
      const fillsPerHour = dockFillsPerHour + extraFillsPerDockPerHour;
      const doublePct = stats.double_tick_chance_pct / 100;
      const triplePct = stats.triple_tick_chance_pct / 100;
      const expectedRollsPerFill = 1 + doublePct + 2 * triplePct;
      return set.fish.map((f) => {
        const catchPct = catchChancePercent(powerOnThisDock, f.powerRating);
        const catchMulti =
          expectedRollsPerFill *
          expectedCatchesPerRoll(powerOnThisDock, f.powerRating) *
          stats.fish_income_multi *
          expectedShinyMulti;
        const cardMulti = getCardMulti(f.id);
        const baseFishPerHour = dockFillsPerHour * catchMulti * cardMulti;
        const fishPerHour = fillsPerHour * catchMulti * cardMulti;
        const totalMulti = stats.fish_income_multi * expectedShinyMulti * cardMulti;
        const hasPower = powerOnThisDock > 0;
        return {
          dockId: set.dockId,
          dockName: dock.name,
          hasPower,
          fish: f,
          baseFishPerHour,
          fishPerHour,
          catchPct,
          totalMulti,
        };
      });
    });
  }, [
    availableDocks,
    effectiveTickSec,
    extraFillsPerDockPerHour,
    expectedShinyMulti,
    effectiveRodPower,
    stats.drone_base_power,
    stats.fish_income_multi,
    stats.double_tick_chance_pct,
    stats.triple_tick_chance_pct,
    state.dronesPerDock,
    state.activeDockId,
    getCardMulti,
  ]);

  /** Fish only where power > 0. Visible = show-grayed ? all (gray where !hasPower) : only hasPower. */
  const visibleGainsRows = useMemo(() => {
    if (state.showDisabledFishGrayed) return fishingGainsRows;
    return fishingGainsRows.filter((r) => r.hasPower);
  }, [fishingGainsRows, state.showDisabledFishGrayed]);

  /** Export for Drone (Angler): base (bar only) and full fish/h (with global ticks). Drone uses difference for extra from Angler + Lootbug. */
  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(FISHING_EXTERNAL_KEY) ?? {};
    ext.effectiveTickSec = effectiveTickSec;
    ext.fishGains = visibleGainsRows
      .filter((r) => r.hasPower && (r.baseFishPerHour > 0 || r.fishPerHour > 0))
      .map((r) => ({
        fishId: r.fish.id,
        fishName: r.fish.name,
        baseFishPerHour: r.baseFishPerHour,
        fishPerHour: r.fishPerHour,
      }));
    saveJson(FISHING_EXTERNAL_KEY, ext);
  }, [effectiveTickSec, visibleGainsRows]);

  /** Run MC: simulate each fill → rolls → catch attempt per fish; record total and per-fish. */
  function runFishingMc() {
    const { hours, runs } = mcState;
    const dockIds = new Set(availableDocks.map((d) => d.id));
    const doublePct = stats.double_tick_chance_pct / 100;
    const triplePct = stats.triple_tick_chance_pct / 100;
    type FishEntry = { fish: { id: string; name: string; powerRating: number }; ECR: number; totalMulti: number };
    type DockEntry = { dockId: string; dockName: string; fillsPerHour: number; fish: FishEntry[] };
    const docksWithPower: DockEntry[] = [];
    for (const set of AQUARIUM) {
      if (!dockIds.has(set.dockId)) continue;
      const dock = DOCKS.find((d) => d.id === set.dockId)!;
      const power = powerForDock(set.dockId);
      if (power <= 0) continue;
      const fillsPerHour =
        3600 / (dock.baseTicksNeeded * effectiveTickSec) + extraFillsPerDockPerHour;
      const fish: FishEntry[] = set.fish.map((f) => ({
        fish: f,
        ECR: expectedCatchesPerRoll(power, f.powerRating),
        totalMulti: stats.fish_income_multi * expectedShinyMulti * getCardMulti(f.id),
      }));
      docksWithPower.push({ dockId: set.dockId, dockName: dock.name, fillsPerHour, fish });
    }
    setMcState((s) => ({ ...s, running: true, samples: null, samplesPerFish: null }));
    window.setTimeout(() => {
      const rng = mulberry32((Date.now() & 0x7fffffff) >>> 0);
      const samples: number[] = [];
      const fishIds = new Set<string>();
      for (const d of docksWithPower) for (const { fish: f } of d.fish) fishIds.add(f.id);
      const samplesPerFish: Record<string, number[]> = {};
      for (const id of fishIds) samplesPerFish[id] = [];
      for (let i = 0; i < runs; i++) {
        let total = 0;
        const runPerFish: Record<string, number> = {};
        for (const id of fishIds) runPerFish[id] = 0;
        for (const { fillsPerHour, fish: fishList } of docksWithPower) {
          const numFills = Math.floor(hours * fillsPerHour);
          for (let f = 0; f < numFills; f++) {
            const rolls = 1 + (rng() < doublePct ? 1 : 0) + (rng() < triplePct ? 2 : 0);
            for (let r = 0; r < rolls; r++) {
              for (const { fish: fDef, ECR, totalMulti } of fishList) {
                const g = Math.floor(ECR);
                const frac = ECR - g;
                const raw = g + (rng() < frac ? 1 : 0);
                const count = raw * totalMulti;
                runPerFish[fDef.id] = (runPerFish[fDef.id] ?? 0) + count;
                total += count;
              }
            }
          }
        }
        samples.push(total);
        for (const id of fishIds) samplesPerFish[id].push(runPerFish[id] ?? 0);
      }
      const sortNum = (a: number, b: number) => a - b;
      samples.sort(sortNum);
      for (const id of fishIds) samplesPerFish[id].sort(sortNum);
      setMcState((s) => ({ ...s, running: false, samples, samplesPerFish }));
    }, 0);
  }

  /** Sushi: ticks per Sushi (90 + card bonus), EV fish per Sushi at current power (total + per fish). */
  const ticksPerSushi = SUSHI_BASE_TICKS + SUSHI_CARD_TICKS[state.sushiCardTier];
  const sushiEvAndTotal = useMemo(() => {
    const rowsWithPower = visibleGainsRows.filter((r) => r.hasPower && r.fishPerHour > 0);
    const totalFishPerHour = rowsWithPower.reduce((s, r) => s + r.fishPerHour, 0);
    const ticksPerHour = effectiveTickSec > 0 ? 3600 / effectiveTickSec : 0;
    const fishPerSushiEv = ticksPerHour > 0 ? (ticksPerSushi * totalFishPerHour) / ticksPerHour : 0;
    const fishPerSushiEvPerFish = rowsWithPower.map((r) => ({
      fishId: r.fish.id,
      fishName: r.fish.name,
      iconFile: r.fish.iconFile,
      fishPerSushiEv: ticksPerHour > 0 ? (ticksPerSushi * r.fishPerHour) / ticksPerHour : 0,
    }));
    return { totalFishPerHour, fishPerSushiEv, fishPerSushiEvPerFish };
  }, [visibleGainsRows, effectiveTickSec, ticksPerSushi]);

  function runSushiMc() {
    const { fishPerSushiEv, fishPerSushiEvPerFish } = sushiEvAndTotal;
    const meanFishPerSushi = fishPerSushiEv;
    setSushiMcState((s) => ({ ...s, running: true, samples: null, samplesPerFish: null }));
    window.setTimeout(() => {
      const rng = mulberry32((Date.now() & 0x7fffffff) >>> 0);
      const samples: number[] = [];
      const fishIds = fishPerSushiEvPerFish.map((f) => f.fishId);
      const sumEv = fishPerSushiEvPerFish.reduce((s, f) => s + f.fishPerSushiEv, 0);
      const probsNorm = sumEv > 0 ? fishPerSushiEvPerFish.map((f) => f.fishPerSushiEv / sumEv) : fishPerSushiEvPerFish.map(() => 0);
      const samplesPerFish: Record<string, number[]> = {};
      for (const id of fishIds) samplesPerFish[id] = [];
      for (let i = 0; i < SUSHI_MC_RUNS; i++) {
        const totalFish = samplePoisson(rng, meanFishPerSushi);
        const runPerFish: Record<string, number> = {};
        for (const id of fishIds) runPerFish[id] = 0;
        for (let k = 0; k < totalFish; k++) {
          let u = rng();
          for (let j = 0; j < probsNorm.length; j++) {
            u -= probsNorm[j];
            if (u <= 0) {
              runPerFish[fishIds[j]] = (runPerFish[fishIds[j]] ?? 0) + 1;
              break;
            }
          }
        }
        const total = Object.values(runPerFish).reduce((a, b) => a + b, 0);
        samples.push(total);
        for (const id of fishIds) samplesPerFish[id].push(runPerFish[id] ?? 0);
      }
      samples.sort((a, b) => a - b);
      for (const id of fishIds) samplesPerFish[id].sort((a, b) => a - b);
      setSushiMcState((s) => ({ ...s, running: false, samples, samplesPerFish }));
    }, 0);
  }

  /** Total fish per hour by fish id (sum across docks) for "time to next upgrade". */
  const totalFishPerHourByFishId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of fishingGainsRows) {
      const id = r.fish.id;
      map[id] = (map[id] ?? 0) + r.fishPerHour;
    }
    return map;
  }, [fishingGainsRows]);

  /** T1 upgrades available at current boat level. */
  const availableT1Upgrades = useMemo(
    () => FISHING_UPGRADES_T1.filter((def) => stats.boat_level >= def.boatLevelRequired),
    [stats.boat_level],
  );

  /** T2 upgrades available at current boat level and T2 boat level. */
  const availableT2Upgrades = useMemo(
    () =>
      FISHING_UPGRADES_T2.filter(
        (def) =>
          stats.boat_level >= def.boatLevelRequired &&
          (def.t2BoatLevelRequired == null || (stats.t2_boat_level ?? 0) >= def.t2BoatLevelRequired),
      ),
    [stats.boat_level, stats.t2_boat_level],
  );

  /** T1 enhancements available at current boat level. */
  const availableT1Enhancements = useMemo(
    () => ENHANCEMENTS_T1.filter((def) => stats.boat_level >= def.boatLevelRequired),
    [stats.boat_level],
  );

  /** T2 enhancements available at current boat level and T2 boat level. */
  const availableT2Enhancements = useMemo(
    () =>
      ENHANCEMENTS_T2.filter(
        (def) =>
          stats.boat_level >= def.boatLevelRequired &&
          (def.t2BoatLevelRequired == null || (stats.t2_boat_level ?? 0) >= def.t2BoatLevelRequired),
      ),
    [stats.boat_level, stats.t2_boat_level],
  );

  const { heatMin, heatMax } = useMemo(() => {
    const enabled = visibleGainsRows.filter((r) => r.hasPower && r.fishPerHour > 0);
    if (enabled.length === 0) return { heatMin: 0, heatMax: 1 };
    const vals = enabled.map((r) => r.fishPerHour);
    return { heatMin: Math.min(...vals), heatMax: Math.max(...vals) };
  }, [visibleGainsRows]);

  /** +% gains = (total fish/h with +1 level − current total) / current total × 100. Computed from actual Fishing gains. Also next-level effect string (e.g. 10→12) for name cell. */
  const { upgradeMarginalPct, enhanceMarginalPct, upgradeNextEffect, enhanceNextEffect } = useMemo(() => {
    const currentStats = computeFishingStatsFromLevels(upgradeLevels, enhanceLevels);
    const skillOpts = {
      skillTreeLevels: state.skillTreeLevels,
      fishCardTier: state.fishCardTier,
      legendaryFishFound: state.legendaryFishFound,
      fishingRodCardTier: state.fishingRodCardTier,
    };
    const currentTotal = computeTotalFishPerHour(
      upgradeLevels,
      enhanceLevels,
      state.dronesPerDock,
      state.activeDockId,
      elixir3xFishingExternal,
      skillOpts,
    );
    const upgradeMap = new Map<FishingUpgradeId, number | null>();
    const upgradeEffectMap = new Map<FishingUpgradeId, string | null>();
    for (const def of [...availableT1Upgrades, ...availableT2Upgrades]) {
      const costs = UPGRADE_COSTS[def.id];
      const maxLvl = costs?.length ? costs[costs.length - 1]!.level : 0;
      const lvl = Math.max(0, Math.min(maxLvl, upgradeLevels[def.id] ?? 0));
      if (lvl >= maxLvl) {
        upgradeMap.set(def.id, null);
        upgradeEffectMap.set(def.id, null);
        continue;
      }
      const newLevels = { ...upgradeLevels, [def.id]: lvl + 1 };
      const nextStats = computeFishingStatsFromLevels(newLevels, enhanceLevels);
      // Drone cap upgrades: assume the extra drone(s) are assigned to the Fisher (active dock) for +% gains.
      const extraDronesOnFisher =
        def.id === "fishing_drone" ? 1 : def.id === "fishing_drone_2" ? 2 : 0;
      const newDronesPerDock =
        extraDronesOnFisher > 0
          ? {
              ...state.dronesPerDock,
              [state.activeDockId]: (state.dronesPerDock[state.activeDockId] ?? 0) + extraDronesOnFisher,
            }
          : state.dronesPerDock;
      const newTotal = computeTotalFishPerHour(
        newLevels,
        enhanceLevels,
        newDronesPerDock,
        state.activeDockId,
        elixir3xFishingExternal,
        skillOpts,
      );
      upgradeMap.set(
        def.id,
        currentTotal > 0 ? ((newTotal - currentTotal) / currentTotal) * 100 : null,
      );
      upgradeEffectMap.set(def.id, formatUpgradeNextEffect(def.id, currentStats, nextStats));
    }
    const enhanceMap = new Map<EnhanceId, number | null>();
    const enhanceEffectMap = new Map<EnhanceId, string | null>();
    const enhanceCosts = (def: { id: EnhanceId }) => {
      const t1 = ENHANCE_COSTS_T1[def.id as keyof typeof ENHANCE_COSTS_T1];
      const t2 = ENHANCE_COSTS_T2[def.id as keyof typeof ENHANCE_COSTS_T2];
      return t1 ?? t2;
    };
    for (const def of [...availableT1Enhancements, ...availableT2Enhancements]) {
      const costs = enhanceCosts(def);
      const maxLvl = costs?.length ? costs[costs.length - 1]!.level : 0;
      const lvl = Math.max(0, Math.min(maxLvl, enhanceLevels[def.id] ?? 0));
      if (lvl >= maxLvl) {
        enhanceMap.set(def.id, null);
        enhanceEffectMap.set(def.id, null);
        continue;
      }
      const newLevels = { ...enhanceLevels, [def.id]: lvl + 1 };
      const nextStats = computeFishingStatsFromLevels(upgradeLevels, newLevels);
      // Drone cap enhancements: assume the extra drone(s) are assigned to the Fisher (active dock) for +% gains.
      const extraDronesOnFisher =
        def.id === "enhance_fishing_drone" ? 1 : def.id === "enhance_fishing_drone_3" ? 3 : 0;
      const newDronesPerDock =
        extraDronesOnFisher > 0
          ? {
              ...state.dronesPerDock,
              [state.activeDockId]: (state.dronesPerDock[state.activeDockId] ?? 0) + extraDronesOnFisher,
            }
          : state.dronesPerDock;
      const newTotal = computeTotalFishPerHour(
        upgradeLevels,
        newLevels,
        newDronesPerDock,
        state.activeDockId,
        elixir3xFishingExternal,
        skillOpts,
      );
      enhanceMap.set(
        def.id,
        currentTotal > 0 ? ((newTotal - currentTotal) / currentTotal) * 100 : null,
      );
      enhanceEffectMap.set(def.id, formatEnhanceNextEffect(def.id, currentStats, nextStats));
    }
    return {
      upgradeMarginalPct: upgradeMap,
      enhanceMarginalPct: enhanceMap,
      upgradeNextEffect: upgradeEffectMap,
      enhanceNextEffect: enhanceEffectMap,
    };
  }, [
    upgradeLevels,
    enhanceLevels,
    state.dronesPerDock,
    state.activeDockId,
    state.skillTreeLevels,
    state.fishCardTier,
    state.legendaryFishFound,
    state.fishingRodCardTier,
    elixir3xFishingExternal,
    availableT1Upgrades,
    availableT2Upgrades,
    availableT1Enhancements,
    availableT2Enhancements,
  ]);

  /** Cost-efficiency heatmap: min/max across T1 + T2 upgrades (high = green, low = red). */
  const { costEfficHeatMin, costEfficHeatMax } = useMemo(() => {
    const vals: number[] = [];
    for (const def of [...availableT1Upgrades, ...availableT2Upgrades]) {
      const costs = UPGRADE_COSTS[def.id];
      const maxLvl = costs?.length ? costs[costs.length - 1]!.level : 0;
      const lvl = Math.max(0, Math.min(maxLvl, upgradeLevels[def.id] ?? 0));
      if (lvl >= maxLvl) continue;
      const marginalPct = upgradeMarginalPct.get(def.id);
      const nextLevel = lvl + 1;
      const nextCostEntry = costs?.find((c) => c.level === nextLevel);
      const fishPerHour = nextCostEntry
        ? (totalFishPerHourByFishId[nextCostEntry.fishId] ?? 0)
        : 0;
      if (
        marginalPct != null &&
        nextCostEntry &&
        fishPerHour > 0
      ) {
        const hoursToNext = nextCostEntry.amount / fishPerHour;
        vals.push(marginalPct / hoursToNext);
      }
    }
    if (vals.length === 0) return { costEfficHeatMin: 0, costEfficHeatMax: 1 };
    return {
      costEfficHeatMin: Math.min(...vals),
      costEfficHeatMax: Math.max(...vals),
    };
  }, [
    availableT1Upgrades,
    availableT2Upgrades,
    totalFishPerHourByFishId,
    upgradeLevels,
    upgradeMarginalPct,
    state.dronesPerDock,
  ]);

  /** Cost-efficiency heatmap for enhancements: min/max across T1 + T2 (marginal % / gem cost; high = green). */
  const { costEfficHeatMinEnhance, costEfficHeatMaxEnhance } = useMemo(() => {
    const vals: number[] = [];
    const enhanceCosts = (def: { id: EnhanceId }) => {
      const t1 = ENHANCE_COSTS_T1[def.id as keyof typeof ENHANCE_COSTS_T1];
      const t2 = ENHANCE_COSTS_T2[def.id as keyof typeof ENHANCE_COSTS_T2];
      return t1 ?? t2;
    };
    for (const def of [...availableT1Enhancements, ...availableT2Enhancements]) {
      const costs = enhanceCosts(def);
      const maxLvl = costs?.length ? costs[costs.length - 1]!.level : 0;
      const lvl = Math.max(0, Math.min(maxLvl, enhanceLevels[def.id] ?? 0));
      if (lvl >= maxLvl) continue;
      const marginalPct = enhanceMarginalPct.get(def.id);
      const nextLevel = lvl + 1;
      const nextCostEntry = costs?.find((c) => c.level === nextLevel);
      if (marginalPct != null && nextCostEntry && nextCostEntry.gems > 0) {
        vals.push((marginalPct / nextCostEntry.gems) * 100);
      }
    }
    if (vals.length === 0) return { costEfficHeatMinEnhance: 0, costEfficHeatMaxEnhance: 1 };
    return {
      costEfficHeatMinEnhance: Math.min(...vals),
      costEfficHeatMaxEnhance: Math.max(...vals),
    };
  }, [
    availableT1Enhancements,
    availableT2Enhancements,
    enhanceLevels,
    enhanceMarginalPct,
  ]);

  /** Skill tree: marginal % gain for +1 level, optional breakdown by effect, and cost-efficiency heatmap. */
  const { skillMarginalPct, skillMarginalBreakdown, costEfficHeatMinSkill, costEfficHeatMaxSkill } = useMemo(() => {
    const skillOpts = {
      skillTreeLevels: state.skillTreeLevels,
      fishCardTier: state.fishCardTier,
      legendaryFishFound: state.legendaryFishFound,
      fishingRodCardTier: state.fishingRodCardTier,
    };
    const currentStats = computeFishingStatsFromLevels(upgradeLevels, enhanceLevels, skillOpts);
    const currentTotal = computeTotalFishPerHour(
      upgradeLevels,
      enhanceLevels,
      state.dronesPerDock,
      state.activeDockId,
      elixir3xFishingExternal,
      skillOpts,
    );
    const marginalMap = new Map<FishingSkillId, number | null>();
    const breakdownMap = new Map<FishingSkillId, Array<{ label: string; pct: number }>>();
    const efficVals: number[] = [];
    for (const def of FISHING_SKILL_TREE) {
      const maxLvl = def.costs.length;
      const lvl = Math.max(0, Math.min(maxLvl, state.skillTreeLevels[def.id] ?? 0));
      if (lvl >= maxLvl) {
        marginalMap.set(def.id, null);
        continue;
      }
      const newSkillLevels = { ...state.skillTreeLevels, [def.id]: lvl + 1 };
      const extraDronesFromSkill =
        def.id === "fishing_with_friends" ? 5 : def.id === "motley_school" ? 5 : 0;
      const newDronesPerDock =
        extraDronesFromSkill > 0
          ? {
              ...state.dronesPerDock,
              [state.activeDockId]: (state.dronesPerDock[state.activeDockId] ?? 0) + extraDronesFromSkill,
            }
          : state.dronesPerDock;
      const newTotal = computeTotalFishPerHour(
        upgradeLevels,
        enhanceLevels,
        newDronesPerDock,
        state.activeDockId,
        elixir3xFishingExternal,
        { ...skillOpts, skillTreeLevels: newSkillLevels },
      );
      const marginalPct =
        currentTotal > 0 ? ((newTotal - currentTotal) / currentTotal) * 100 : null;
      marginalMap.set(def.id, marginalPct);

      if (currentTotal > 0 && extraDronesFromSkill > 0) {
        const totalSameDrones = computeTotalFishPerHour(
          upgradeLevels,
          enhanceLevels,
          state.dronesPerDock,
          state.activeDockId,
          elixir3xFishingExternal,
          { ...skillOpts, skillTreeLevels: newSkillLevels },
        );
        const pctFromStats = ((totalSameDrones - currentTotal) / currentTotal) * 100;
        const pctFromDrones = ((newTotal - totalSameDrones) / currentTotal) * 100;
        if (def.id === "fishing_with_friends") {
          breakdownMap.set(def.id, [
            { label: "Drone power +10%, Fish mult +3%", pct: pctFromStats },
            { label: "Fishing Drones +5", pct: pctFromDrones },
          ]);
        } else if (def.id === "motley_school") {
          breakdownMap.set(def.id, [
            { label: "Rod mult +10%", pct: pctFromStats },
            { label: "Fishing Drones +5", pct: pctFromDrones },
          ]);
        }
      }

      if (currentTotal > 0 && def.id === "lets_pick_up_the_pace") {
        const newStats = computeFishingStatsFromLevels(upgradeLevels, enhanceLevels, { ...skillOpts, skillTreeLevels: newSkillLevels });
        const statsTickOnly: ComputedFishingStats = {
          ...newStats,
          double_tick_chance_pct: currentStats.double_tick_chance_pct,
          triple_tick_chance_pct: currentStats.triple_tick_chance_pct,
        };
        const statsDoubleOnly: ComputedFishingStats = {
          ...newStats,
          triple_tick_chance_pct: currentStats.triple_tick_chance_pct,
        };
        const statsChancesOnly: ComputedFishingStats = {
          ...newStats,
          fishing_tick_reduction: currentStats.fishing_tick_reduction,
        };
        const totalTickOnly = computeTotalFishPerHourFromStats(statsTickOnly, state.dronesPerDock, state.activeDockId, elixir3xFishingExternal, effectiveRodPower);
        const totalDoubleOnly = computeTotalFishPerHourFromStats(statsDoubleOnly, state.dronesPerDock, state.activeDockId, elixir3xFishingExternal, effectiveRodPower);
        const totalChancesOnly = computeTotalFishPerHourFromStats(statsChancesOnly, state.dronesPerDock, state.activeDockId, elixir3xFishingExternal, effectiveRodPower);
        breakdownMap.set(def.id, [
          { label: "Tick -2s", pct: ((totalTickOnly - currentTotal) / currentTotal) * 100 },
          { label: "Double +2%", pct: ((totalDoubleOnly - totalTickOnly) / currentTotal) * 100 },
          { label: "Triple +1%", pct: ((totalChancesOnly - totalDoubleOnly) / currentTotal) * 100 },
        ]);
      }

      if (currentTotal > 0 && def.id === "with_this_fish_i_summon_two_more_fish") {
        const newStats = computeFishingStatsFromLevels(upgradeLevels, enhanceLevels, { ...skillOpts, skillTreeLevels: newSkillLevels });
        const statsFishMultiOnly: ComputedFishingStats = {
          ...newStats,
          shiny_fish_chance_pct: currentStats.shiny_fish_chance_pct,
        };
        const statsShinyOnly: ComputedFishingStats = {
          ...newStats,
          fish_income_multi: currentStats.fish_income_multi,
        };
        const totalFishMultiOnly = computeTotalFishPerHourFromStats(statsFishMultiOnly, state.dronesPerDock, state.activeDockId, elixir3xFishingExternal, effectiveRodPower);
        const totalShinyOnly = computeTotalFishPerHourFromStats(statsShinyOnly, state.dronesPerDock, state.activeDockId, elixir3xFishingExternal, effectiveRodPower);
        breakdownMap.set(def.id, [
          { label: "Fish mult +1%/card", pct: ((totalFishMultiOnly - currentTotal) / currentTotal) * 100 },
          { label: "Shiny +0.1%/card", pct: ((totalShinyOnly - currentTotal) / currentTotal) * 100 },
        ]);
      }

      if (currentTotal > 0 && def.id === "completionist_gatekeeper") {
        const newStats = computeFishingStatsFromLevels(upgradeLevels, enhanceLevels, { ...skillOpts, skillTreeLevels: newSkillLevels });
        const statsDroneOnly: ComputedFishingStats = {
          ...newStats,
          super_shiny_chance_pct: currentStats.super_shiny_chance_pct,
          tier2_dock_power_mult: currentStats.tier2_dock_power_mult,
        };
        const statsT2Only: ComputedFishingStats = {
          ...newStats,
          drone_base_power: currentStats.drone_base_power,
          super_shiny_chance_pct: currentStats.super_shiny_chance_pct,
        };
        const statsShinyOnly: ComputedFishingStats = {
          ...newStats,
          drone_base_power: currentStats.drone_base_power,
          tier2_dock_power_mult: currentStats.tier2_dock_power_mult,
        };
        const totalDroneOnly = computeTotalFishPerHourFromStats(statsDroneOnly, state.dronesPerDock, state.activeDockId, elixir3xFishingExternal, effectiveRodPower);
        const totalT2Only = computeTotalFishPerHourFromStats(statsT2Only, state.dronesPerDock, state.activeDockId, elixir3xFishingExternal, effectiveRodPower);
        const totalShinyOnly = computeTotalFishPerHourFromStats(statsShinyOnly, state.dronesPerDock, state.activeDockId, elixir3xFishingExternal, effectiveRodPower);
        breakdownMap.set(def.id, [
          { label: "T2 dock +3%", pct: ((totalT2Only - currentTotal) / currentTotal) * 100 },
          { label: "Drone power +2%", pct: ((totalDroneOnly - currentTotal) / currentTotal) * 100 },
          { label: "Super shiny +1%", pct: ((totalShinyOnly - currentTotal) / currentTotal) * 100 },
        ]);
      }

      const costForNext = def.costs[lvl] ?? 0;
      if (marginalPct != null && costForNext > 0) {
        efficVals.push(marginalPct / costForNext);
      }
    }
    return {
      skillMarginalPct: marginalMap,
      skillMarginalBreakdown: breakdownMap,
      costEfficHeatMinSkill: efficVals.length ? Math.min(...efficVals) : 0,
      costEfficHeatMaxSkill: efficVals.length ? Math.max(...efficVals) : 1,
    };
  }, [
    upgradeLevels,
    enhanceLevels,
    state.dronesPerDock,
    state.activeDockId,
    state.skillTreeLevels,
    state.fishCardTier,
    state.legendaryFishFound,
    state.fishingRodCardTier,
    effectiveRodPower,
    elixir3xFishingExternal,
  ]);

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="title">
            <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
              <img src={FISHING_ICON} alt="Fishing" className="fishingHeaderIcon" />
              <span>Fishing</span>
            </span>
          </h1>
          <p className="subtitle">Enter your fishing stats and toggle docks. Same formulas as game (beta).</p>
        </div>
        <div className="badge">BETA</div>
      </div>

      <div className="fishingLayoutGrid">
        <Collapsible
          id="fishing-gains"
          title="Fishing gains (by fish)"
          defaultExpanded={true}
          headerRight={
            <Tooltip
              content={{
                title: "Gains from power",
                sections: [
                  {
                    heading: "Dock power",
                    lines: [
                      "Each dock's power = rod (if you fish there) + every fishing drone on that dock × drone base power.",
                      "Power sets catch chance and fish per hour.",
                    ],
                  },
                ],
              }}
            />
          }
        >
          <div className="fishingSection">
            <div className="fishingSectionHeader">
              <div className="fishingSectionTitle">
                <span className="mono">Fish per hour</span>
              </div>
              <span className="mono fishingTotalRainbow" style={{ fontSize: "0.95em" }}>
                {visibleGainsRows.reduce((s, r) => s + r.fishPerHour, 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}/h
              </span>
            </div>
            <div className="fishingGainsToggleWrap">
              <label className="fishingGainsToggleLabel">
                <input
                  type="checkbox"
                  checked={state.showDisabledFishGrayed}
                  onChange={(e) => setState((prev) => ({ ...prev, showDisabledFishGrayed: e.target.checked }))}
                />
                <span className="small">Show fish from docks with no power (grayed out)</span>
              </label>
            </div>
            <div className="fishingGainsList">
              {visibleGainsRows.map(({ dockId, dockName, hasPower, fish, fishPerHour, catchPct, totalMulti }) => {
                const isActive = hasPower;
                const heatT =
                  heatMax > heatMin && isActive && fishPerHour > 0
                    ? (fishPerHour - heatMin) / (heatMax - heatMin)
                    : 0.5;
                const rateColor = isActive ? heatmapColor(heatT) : undefined;
                return (
                  <div
                    key={`${dockId}-${fish.id}`}
                    className={`fishingGainsRow ${!hasPower ? "fishingGainsRowDisabled" : ""}`}
                    title={!hasPower ? `No power on dock “${dockName}”` : undefined}
                  >
                    <img
                      src={fishIconUrl(fish.iconFile)}
                      alt=""
                      className="fishingFishIcon"
                    />
                    <span className="fishingGainsFishName">
                      {fish.name}
                      <span className="fishingGainsCardMulti"> ×{totalMulti.toFixed(2)}</span>
                    </span>
                    <span className="small fishingGainsDockName">{dockName}</span>
                    <span className="fishingGainsRateWrap">
                      {isActive && (
                        <span className="fishingGainsCatchPct" title="Catch chance (%)">
                          {Math.round(catchPct)}%
                        </span>
                      )}
                      <span
                        className="mono fishingGainsRate"
                        style={rateColor ? { backgroundColor: rateColor, color: heatT > 0.5 ? "#0a0a0a" : "#fff" } : undefined}
                      >
                        {isActive
                          ? fishPerHour.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                              minimumFractionDigits: 0,
                            })
                          : "—"}
                        /h
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="fishingGainsElixirRow">
              <img
                src={ELIXIR_3X_FISHING_BUFF_ICON}
                alt=""
                className="fishingGainsElixirIcon"
              />
              <span className="fishingGainsElixirLabel">Elixir drone 3× fishing tick speed</span>
              <span className="fishingGainsElixirValue">
                {formatElixirMinSecPerHour(elixir3xFishingExternal.minPerHour)} / h (
                {Math.round(elixir3xFishingExternal.uptimeFraction * 100)}% uptime → {elixir3xFishingMulti.toFixed(2)}× multi)
              </span>
            </div>

            <Collapsible id="fishing-mc" title="Variance (MC simulation)" defaultExpanded={false}>
              <div className="fishingMcSection">
                <p className="small" style={{ marginBottom: 8 }}>
                  Simulate each catch attempt: every fill → rolls (double/triple) → catch roll per fish. EV above is the average; variance can be high.
                </p>
                <div className="fishingMcInputRow">
                  <label className="fishingMcLabel">
                    Hours
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0.1}
                      max={720}
                      step={0.5}
                      className="fishingMcInput"
                      value={mcState.hours}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) setMcState((s) => ({ ...s, hours: Math.max(0.1, Math.min(720, v)) }));
                      }}
                      disabled={mcState.running}
                      aria-label="Simulation hours"
                    />
                  </label>
                  <label className="fishingMcLabel">
                    Runs
                    <input
                      type="number"
                      min={1000}
                      max={100000}
                      step={1000}
                      className="fishingMcInput"
                      value={mcState.runs}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isFinite(v)) setMcState((s) => ({ ...s, runs: Math.max(1000, Math.min(100000, v)) }));
                      }}
                      disabled={mcState.running}
                      aria-label="MC runs"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn"
                    onClick={runFishingMc}
                    disabled={mcState.running || visibleGainsRows.filter((r) => r.hasPower && r.fishPerHour > 0).length === 0}
                  >
                    {mcState.running ? "Running…" : "Run simulation"}
                  </button>
                </div>
                {mcState.samples && mcState.samples.length > 0 && (
                  <div className="fishingMcResults">
                    <div className="fishingMcResultsTitle">
                      Total fish over the next {mcState.hours} h (N={mcState.samples.length.toLocaleString()})
                    </div>
                    {(() => {
                      const s = mcState.samples;
                      const mean = s.reduce((a, b) => a + b, 0) / s.length;
                      const p10 = s[Math.floor(0.1 * s.length)] ?? 0;
                      const p25 = s[Math.floor(0.25 * s.length)] ?? 0;
                      const med = s[Math.floor(0.5 * s.length)] ?? 0;
                      const p75 = s[Math.floor(0.75 * s.length)] ?? 0;
                      const p90 = s[Math.floor(0.9 * s.length)] ?? 0;
                      const evTotal = visibleGainsRows.reduce((sum, r) => sum + (r.hasPower ? r.fishPerHour * mcState.hours : 0), 0);
                      const bins = 14;
                      const lo = s[0] ?? 0;
                      const hi = s[s.length - 1] ?? 0;
                      const span = hi - lo || 1;
                      const counts = new Array(bins).fill(0);
                      for (const v of s) {
                        const idx = Math.min(bins - 1, Math.floor(((v - lo) / span) * bins));
                        counts[idx]++;
                      }
                      const maxCount = Math.max(...counts);
                      return (
                        <>
                          <div className="fishingMcStats">
                            <div className="fishingMcStatRow">
                              <span className="fishingMcStatLabel">Mean (MC)</span>
                              <span className="mono">{mean.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                            </div>
                            <div className="fishingMcStatRow">
                              <span className="fishingMcStatLabel">EV (expected)</span>
                              <span className="mono">{evTotal.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                            </div>
                            <div className="fishingMcStatRow">
                              <span className="fishingMcStatLabel">Median</span>
                              <span className="mono">{med.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                            <div className="fishingMcStatRow fishingMcPercentiles">
                              <span className="fishingMcStatLabel">10th / 25th / 75th / 90th percentile</span>
                              <span className="mono">{p10.toLocaleString(undefined, { maximumFractionDigits: 0 })} / {p25.toLocaleString(undefined, { maximumFractionDigits: 0 })} / {p75.toLocaleString(undefined, { maximumFractionDigits: 0 })} / {p90.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                          </div>
                          <div className="fishingMcHistogramWrap">
                            <div className="fishingMcHistogramBarRow">
                              {counts.map((c, i) => {
                                const barHeightPx = maxCount > 0 ? Math.max(c > 0 ? 4 : 0, Math.round((c / maxCount) * 48)) : 0;
                                return (
                                <div key={i} className="fishingMcHistogramCell" title={`${(lo + (span * i) / bins).toLocaleString(undefined, { maximumFractionDigits: 0 })}–${(lo + (span * (i + 1)) / bins).toLocaleString(undefined, { maximumFractionDigits: 0 })}: ${c}`}>
                                  <div
                                    className="fishingMcHistogramBar"
                                    style={{ height: barHeightPx }}
                                  />
                                </div>
                                );
                              })}
                            </div>
                            <div className="fishingMcHistogramAxis small">
                              <span className="mono">{lo.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              <span className="fishingMcHistogramAxisLabel">Fish count</span>
                              <span className="mono">{hi.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
                {mcState.samplesPerFish && Object.keys(mcState.samplesPerFish).length > 0 && (() => {
                  const fishIdsWithPower = new Set(visibleGainsRows.filter((r) => r.hasPower && r.fishPerHour > 0).map((r) => r.fish.id));
                  const fishIds = Object.keys(mcState.samplesPerFish).filter((id) => fishIdsWithPower.has(id));
                  const bins = 10;
                  let globalHi = 0;
                  for (const id of fishIds) {
                    const a = mcState.samplesPerFish![id]!;
                    if (a.length === 0) continue;
                    const h = a[a.length - 1] ?? 0;
                    if (h > globalHi) globalHi = h;
                  }
                  const globalLo = 0;
                  const globalSpan = globalHi - globalLo || 1;
                  return (
                  <div className="fishingMcPerFish">
                    <div className="fishingMcResultsTitle">Per fish (same x-axis for comparison)</div>
                    {fishIds.map((fishId) => {
                        const fish = getFishById(fishId);
                        if (!fish) return null;
                        const arr = mcState.samplesPerFish![fishId]!;
                        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
                        const p10 = arr[Math.floor(0.1 * arr.length)] ?? 0;
                        const p90 = arr[Math.floor(0.9 * arr.length)] ?? 0;
                        const med = arr[Math.floor(0.5 * arr.length)] ?? 0;
                        const counts = new Array(bins).fill(0);
                        for (const v of arr) {
                          const idx = Math.min(bins - 1, Math.max(0, Math.floor(((v - globalLo) / globalSpan) * bins)));
                          counts[idx]++;
                        }
                        const maxC = Math.max(...counts);
                        return (
                          <div key={fishId} className="fishingMcPerFishRow">
                            <div className="fishingMcPerFishHead">
                              <img src={fishIconUrl(fish.iconFile)} alt="" className="fishingFishIcon" />
                              <span className="fishingMcPerFishName">{fish.name}</span>
                              <span className="fishingMcPerFishStats mono small">
                                mean {mean.toLocaleString(undefined, { maximumFractionDigits: 1 })} · med {med.toLocaleString(undefined, { maximumFractionDigits: 0 })} · P10 {p10.toLocaleString(undefined, { maximumFractionDigits: 0 })} / P90 {p90.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                            <div className="fishingMcHistogramBarRow fishingMcPerFishBars">
                              {counts.map((c, i) => {
                                const barHeightPx = maxC > 0 ? Math.max(c > 0 ? 2 : 0, Math.round((c / maxC) * 24)) : 0;
                                const binLo = globalLo + (globalSpan * i) / bins;
                                const binHi = globalLo + (globalSpan * (i + 1)) / bins;
                                return (
                                <div key={i} className="fishingMcHistogramCell fishingMcPerFishCell" title={`${binLo.toFixed(0)}–${binHi.toFixed(0)}: ${c}`}>
                                  <div
                                    className="fishingMcHistogramBar fishingMcPerFishBar"
                                    style={{ height: barHeightPx }}
                                  />
                                </div>
                                );
                              })}
                            </div>
                            <div className="fishingMcPerFishAxis small">
                              <div className="fishingMcPerFishAxisTicks">
                                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
                                  <span key={t} className="mono">
                                    {Math.round(globalLo + t * globalSpan).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  );
                })()}
              </div>
            </Collapsible>
          </div>
        </Collapsible>

        <Collapsible id="fishing-sushi" title="Sushi" defaultExpanded={true}>
          <div className="fishingSection">
            <div className="fishingSectionHeader">
              <img src="https://static.wikitide.net/shminerwiki/6/6d/Sushi.png" alt="" className="fishingSushiIcon" aria-hidden />
              <span className="fishingSectionTitle">Sushi</span>
            </div>
            <p className="small" style={{ marginBottom: 8, opacity: 0.85 }}>Sushi gives <span className="mono">{ticksPerSushi}</span> fishing ticks.</p>
            <div className="fishingFishCardsGrid fishingSushiCardGrid">
              <div className="fishingFishCardCell">
                <div className="fishingFishCardCellTop">
                  <span className="mono">Sushi Misc Card</span>
                </div>
                <FishCardTierToggles
                  value={state.sushiCardTier}
                  onChange={(t) => setState((prev) => ({ ...prev, sushiCardTier: t }))}
                />
              </div>
            </div>
            <div className="fishingSushiStats">
              <div className="fishingSushiStatRow">
                <span className="fishingSushiStatLabel">
                  Average EV (fish per Sushi)
                  <Tooltip
                    content={{
                      title: "Average EV (fish per Sushi)",
                      sections: [
                        { heading: "Meaning", lines: ["Expected fish from one Sushi at your current power and dock setup. Total and per fish."] },
                        { heading: "Formula", lines: ["Ticks per Sushi × (fish/h ÷ ticks/h). Uses same gains as the list above."] },
                      ],
                    }}
                  />
                </span>
                <span className="mono">{sushiEvAndTotal.fishPerSushiEv.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} total</span>
              </div>
              {sushiEvAndTotal.fishPerSushiEvPerFish.length > 0 && (
                <div className="fishingSushiEvPerFish">
                  {sushiEvAndTotal.fishPerSushiEvPerFish.map(({ fishId, fishName, iconFile, fishPerSushiEv }) => (
                    <div key={fishId} className="fishingSushiStatRow fishingSushiEvPerFishRow">
                      <span className="fishingSushiStatLabel">
                        <img src={fishIconUrl(iconFile)} alt="" className="fishingSushiEvFishIcon" aria-hidden />
                        {fishName}
                      </span>
                      <span className="mono">{fishPerSushiEv.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Collapsible id="fishing-sushi-mc" title="Variance (MC simulation)" defaultExpanded={true}>
              <div className="fishingSushiMcSection">
                <p className="small" style={{ marginBottom: 8 }}>
                  Simulate opening N={SUSHI_MC_RUNS.toLocaleString()} sushis; histogram of total fish per Sushi.
                </p>
                <button
                  type="button"
                  className="btn"
                  onClick={runSushiMc}
                  disabled={sushiMcState.running || visibleGainsRows.filter((r) => r.hasPower && r.fishPerHour > 0).length === 0}
                >
                  {sushiMcState.running ? "Running…" : "Run simulation"}
                </button>
                {sushiMcState.samples && sushiMcState.samples.length > 0 && sushiMcState.samplesPerFish && (() => {
                  const s = sushiMcState.samples;
                  const mean = s.reduce((a, b) => a + b, 0) / s.length;
                  const p10 = s[Math.floor(0.1 * s.length)] ?? 0;
                  const p25 = s[Math.floor(0.25 * s.length)] ?? 0;
                  const med = s[Math.floor(0.5 * s.length)] ?? 0;
                  const p75 = s[Math.floor(0.75 * s.length)] ?? 0;
                  const p90 = s[Math.floor(0.9 * s.length)] ?? 0;
                  const lo = s[0] ?? 0;
                  const hi = s[s.length - 1] ?? 0;
                  const bins = 14;
                  const span = hi - lo || 1;
                  const counts = new Array(bins).fill(0);
                  for (const v of s) {
                    const idx = Math.min(bins - 1, Math.floor(((v - lo) / span) * bins));
                    counts[idx]++;
                  }
                  const maxCount = Math.max(...counts);
                  const fishIdsWithSamples = sushiEvAndTotal.fishPerSushiEvPerFish.filter((f) => sushiMcState.samplesPerFish![f.fishId]?.length);
                  return (
                    <>
                      <div className="fishingSushiMcStats">
                        <div className="fishingSushiMcStatRow">
                          <span className="fishingSushiMcStatLabel">Mean (MC)</span>
                          <span className="mono">{mean.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="fishingSushiMcStatRow">
                          <span className="fishingSushiMcStatLabel">EV (expected)</span>
                          <span className="mono">{sushiEvAndTotal.fishPerSushiEv.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="fishingSushiMcStatRow">
                          <span className="fishingSushiMcStatLabel">Median</span>
                          <span className="mono">{med.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="fishingSushiMcStatRow">
                          <span className="fishingSushiMcStatLabel">10th / 25th / 75th / 90th %</span>
                          <span className="mono">{p10.toLocaleString(undefined, { maximumFractionDigits: 0 })} / {p25.toLocaleString(undefined, { maximumFractionDigits: 0 })} / {p75.toLocaleString(undefined, { maximumFractionDigits: 0 })} / {p90.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                      <div className="fishingMcHistogramWrap">
                        <div className="fishingMcHistogramBarRow">
                          {counts.map((c, i) => {
                            const barHeightPx = maxCount > 0 ? Math.max(c > 0 ? 4 : 0, Math.round((c / maxCount) * 48)) : 0;
                            return (
                              <div key={i} className="fishingMcHistogramCell" title={`${(lo + (span * i) / bins).toLocaleString(undefined, { maximumFractionDigits: 0 })}–${(lo + (span * (i + 1)) / bins).toLocaleString(undefined, { maximumFractionDigits: 0 })}: ${c}`}>
                                <div className="fishingMcHistogramBar" style={{ height: barHeightPx }} />
                              </div>
                            );
                          })}
                        </div>
                        <div className="fishingMcHistogramAxis small">
                          <span className="mono">{lo.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          <span className="fishingMcHistogramAxisLabel">Fish per Sushi (total)</span>
                          <span className="mono">{hi.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </Collapsible>
          </div>
        </Collapsible>

        <Collapsible
          id="fishing-your-stats"
          title="Your stats"
          defaultExpanded={true}
          className="fishingLeftPanel"
          headerRight={
            <>
              <Tooltip content={statsTooltip} />
              <span className="small" style={{ opacity: 0.85 }}>Stats § Fishing</span>
            </>
          }
        >
          <div className="fishingSection fishingTickSection">
            <div className="fishingTickRows">
              <div className="fishingTickRow">
                1 Fishing Tick = <span className="mono">{tickDurationSec.toFixed(2)}</span> Seconds
              </div>
              <div className="fishingTickRow">
                <strong>Effective</strong> 1 Fishing Tick = <span className="mono">{effectiveTickSec.toFixed(2)}</span> Seconds
                <Tooltip
                  content={{
                    title: "Effective fishing tick",
                    lines: [
                      "Time per tick when Elixir Drone 3× Fishing Tick Speed is taken into account. When the buff is active, ticks run 3× faster (real time).",
                      "Fish per hour and fills per hour use this value.",
                    ],
                  }}
                  label="?"
                />
                {effectiveTickSec < tickDurationSec && tickDurationSec > 0 ? (
                  <span className="fishingTickBetterPulse">
                    ({((1 - effectiveTickSec / tickDurationSec) * 100).toFixed(0)}% faster)
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="fishingBoatLevelRow">
            <StatRow
              label="Boat level (T1)"
              iconUrl={upgradeIconUrl("Fishing_Boat_Upgrade.png")}
              value={stats.boat_level}
            />
            <StatRow
              label="T2 boat level"
              iconUrl={upgradeIconUrl("Fishing_Boat_Upgrade_T2.png")}
              value={stats.t2_boat_level}
            />
          </div>
          <div className="fishingGrid">
            <div className="fishingSection">
              <div className="fishingSectionHeader">
                <div className="fishingSectionTitle">
                  <span className="mono">Fishing stats</span>
                </div>
              </div>
              <div className="fishingStatsTwoColWrap">
                <div className="fishingStatsCol">
                  <StatRow
                    label="Fishing rod power"
                    iconUrl={upgradeIconUrl("Fishing_Rod_Power.png")}
                    value={effectiveRodPower}
                    decimals={0}
                  />
                  <StatRow
                    label="Fishing drone cap"
                    iconUrl={upgradeIconUrl("Fishing_Drone_Capacity.png")}
                    value={stats.fishing_drone_cap}
                    decimals={2}
                    suffix=""
                  />
                  <StatRow
                    label="Drone base power"
                    iconUrl={upgradeIconUrl("Fishing_Drone_Base_Power.png")}
                    value={Math.round(stats.drone_base_power)}
                    decimals={0}
                    suffix=""
                  />
                  <StatRow
                    label="Drone power multiplier"
                    iconUrl={upgradeIconUrl("Drone_Power_Multiplier.png")}
                    value={stats.drone_power_multiplier}
                    decimals={2}
                    suffix="×"
                  />
                  <StatRow
                    label="Fish income multiplier (×)"
                    iconUrl={upgradeIconUrl("Fish_Income_Multiplier.png")}
                    value={stats.fish_income_multi}
                    decimals={2}
                    suffix="×"
                  />
                  <StatRow
                    label="Fishing tick reduction (s)"
                    iconUrl={upgradeIconUrl("Fishing_Tick_Reduction.png")}
                    value={stats.fishing_tick_reduction}
                    decimals={1}
                    suffix="s"
                  />
                  <StatRow
                    label="Double tick chance"
                    iconUrl={upgradeIconUrl("Double_Fish_Tick_Chance.png")}
                    value={stats.double_tick_chance_pct}
                    decimals={2}
                    suffix="%"
                  />
                  <StatRow
                    label="Triple tick chance"
                    iconUrl={upgradeIconUrl("Triple_Fish_Tick_Chance.png")}
                    value={stats.triple_tick_chance_pct}
                    decimals={2}
                    suffix="%"
                  />
                  <StatRow
                    label="5× tick chance"
                    iconUrl={upgradeIconUrl("5x_Fish_Tick_Chance.png")}
                    value={stats.five_tick_chance_pct}
                    decimals={2}
                    suffix="%"
                  />
                  <StatRow
                    label="Token gain multiplier"
                    iconUrl={upgradeIconUrl("Fish_Token_Gain_Multiplier.png")}
                    value={stats.token_gain_multi}
                    decimals={2}
                    suffix="×"
                  />
                </div>
                <div className="fishingStatsCol">
                  <StatRow
                    label="Notice fish requirement"
                    value={stats.notice_fish_req}
                    decimals={2}
                    suffix="×"
                  />
                  <StatRow
                    label="Shiny fish chance"
                    iconUrl={upgradeIconUrl("Shiny_Fish_Chance.png")}
                    value={stats.shiny_fish_chance_pct}
                    decimals={2}
                    suffix="%"
                  />
                  <StatRow
                    label="Super shiny chance"
                    iconUrl={upgradeIconUrl("Super_Shiny_Fish_Chance.png")}
                    value={stats.super_shiny_chance_pct}
                    decimals={2}
                    suffix="%"
                  />
                  <StatRow
                    label="Tiny notice chance"
                    iconUrl={upgradeIconUrl("Tiny_Notice_Chance.png")}
                    value={stats.tiny_notice_chance_pct}
                    decimals={2}
                    suffix="%"
                  />
                  <StatRow
                    label="Tier 2 dock power"
                    iconUrl={upgradeIconUrl("Tier_2_Dock_Power.png")}
                    value={stats.tier2_dock_power_mult}
                    decimals={2}
                    suffix="×"
                  />
                  <StatRow
                    label="Shiny multiplier"
                    iconUrl={upgradeIconUrl("Shiny_Multiplier.png")}
                    value={stats.shiny_multiplier}
                    decimals={2}
                    suffix="×"
                  />
                  <StatRow
                    label="Super shiny multiplier"
                    iconUrl={upgradeIconUrl("Super_Shiny_Multiplier.png")}
                    value={stats.super_shiny_multiplier}
                    decimals={2}
                    suffix="×"
                  />
                </div>
              </div>
            </div>
          </div>
        </Collapsible>

        <Collapsible id="fishing-docks" title="Docks" defaultExpanded={true}>
          <div className="fishingDocksBox">
            {totalDronesAssigned < droneCap && droneCap > 0 ? (
              <div className="fishingDroneCapWarning" role="alert">
                Assign more drones: {totalDronesAssigned} / {droneCap} (cap). Use + on a dock to add drones.
              </div>
            ) : (
              <div className="fishingDroneCapBar" aria-hidden="true" />
            )}
            <div className="fishingDockHeaderRow">
              <span className="fishingDockHeaderFisher">Fisher here</span>
            </div>
            {availableDocks.map((dock) => {
              const dockPower = powerForDock(dock.id);
              const dockDrones = state.dronesPerDock[dock.id] ?? 0;
              const isActiveDock = state.activeDockId === dock.id;
              const canAdd = totalDronesAssigned < droneCap;
              const canSub = dockDrones > 0;
              return (
                <div key={dock.id} className="fishingDockBlock">
                  <div className="fishingDockRow">
                    <label className="fishingDockRowLabel">
                      <input
                        type="radio"
                        name="fishing_fisher_dock"
                        value={dock.id}
                        checked={isActiveDock}
                        onChange={() => setState((prev) => ({ ...prev, activeDockId: dock.id }))}
                        aria-label={`Fisher at ${dock.name}`}
                      />
                      <span className="fishingDockRowNameBlock">
                        <span className="fishingDockRowName">{dock.name}</span>
                        <img
                          src={dockIconUrl(dock.id)}
                          alt=""
                          className="fishingDockRowDockImg"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </span>
                    </label>
                    <span className="fishingDockRowPower">Power: {Math.round(dockPower)}</span>
                    <span className="fishingDockRowDrones">Drones: {dockDrones}</span>
                  </div>
                  <div className="fishingDockDroneControls">
                    <span className="fishingDockDroneControlsLabel">Fishing drone count</span>
                    <button
                      type="button"
                      className="fishingDockDroneBtn fishingDockDroneBtnAll"
                      onClick={() => setDockDronesTo(dock.id, 0)}
                      disabled={dockDrones === 0}
                      aria-label="Remove all drones"
                    >
                      −all
                    </button>
                    <button
                      type="button"
                      className="fishingDockDroneBtn"
                      onClick={() => setDockDrones(dock.id, -1)}
                      disabled={!canSub}
                      aria-label="Remove drone"
                    >
                      −
                    </button>
                    <span className="fishingDockDroneCount">{dockDrones}</span>
                    <button
                      type="button"
                      className="fishingDockDroneBtn"
                      onClick={() => setDockDrones(dock.id, 1)}
                      disabled={!canAdd}
                      aria-label="Add drone"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="fishingDockDroneBtn fishingDockDroneBtnAll"
                      onClick={() => setDockDronesTo(dock.id, droneCap - (totalDronesAssigned - dockDrones))}
                      disabled={!canAdd}
                      aria-label="Add all drones to this dock"
                    >
                      +all
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Collapsible>

        <Collapsible id="fishing-upgrades" title="Available upgrades" defaultExpanded={true}>
          <div className="fishingUpgradesPanel">
            <Collapsible id="fishing-upgrades-t1" title="Tier 1" defaultExpanded={true} className="fishingUpgradesTier">
              <div className="fishingUpgradesList">
                <table className="fishingUpgradeTable">
                  <thead>
                    <tr>
                      <th className="fishingUpgradeThName">Upgrade</th>
                      <th className="fishingUpgradeThLvl">Lvl</th>
                      <th className="fishingUpgradeThCostEffic">
                        Cost Effic.
                        <Tooltip
                          content={{
                            title: "Cost efficiency",
                            sections: [
                              {
                                heading: "How it works",
                                lines: [
                                  "Marginal % gain divided by hours to get the cost for the next level.",
                                  "Higher = more gain per hour of farming invested.",
                                ],
                              },
                            ],
                          }}
                        />
                      </th>
                      <th className="fishingUpgradeThCost">Cost</th>
                      <th className="fishingUpgradeThTime">
                        Time to next
                        <Tooltip
                          content={{
                            title: "Time to next",
                            sections: [
                              {
                                heading: "What it means",
                                lines: [
                                  "Time to get enough of the cost fish for the next level.",
                                  "Assumes all fish per hour goes to that fish type.",
                                ],
                              },
                            ],
                          }}
                        />
                      </th>
                      <th className="fishingUpgradeThSpeed">
                        +% gains
                        <Tooltip
                          content={{
                            title: "+% gains",
                            sections: [
                              {
                                heading: "Marginal gain",
                                lines: [
                                  "Percent increase in total fish per hour for +1 level of this upgrade.",
                                  "Uses the same total as the fishing gains list above.",
                                ],
                              },
                            ],
                          }}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                {availableT1Upgrades.map((def) => {
                  const costs = UPGRADE_COSTS[def.id];
                  const maxLvl = costs?.length ? costs[costs.length - 1]!.level : 0;
                  const lvl = Math.max(0, Math.min(maxLvl, upgradeLevels[def.id] ?? 0));
                  const nextLevel = lvl + 1;
                  const nextCostEntry = costs?.find((c) => c.level === nextLevel);
                  const fishPerHour = nextCostEntry
                    ? (totalFishPerHourByFishId[nextCostEntry.fishId] ?? 0)
                    : 0;
                  const hoursToNext =
                    nextCostEntry && fishPerHour > 0
                      ? nextCostEntry.amount / fishPerHour
                      : null;
                  const fishDef = nextCostEntry ? getFishById(nextCostEntry.fishId) : undefined;
                  const isMaxed = lvl >= maxLvl;
                  const marginalPct = upgradeMarginalPct.get(def.id) ?? null;
                  const nextEffect = upgradeNextEffect.get(def.id) ?? null;
                  return (
                    <tr key={def.id} className="fishingUpgradeRow">
                      <td className="fishingUpgradeTdName">
                        <img src={upgradeIconUrl(def.iconFile)} alt="" className="fishingUpgradeIcon" />
                        <div className="fishingUpgradeNameBlock">
                          <span className="fishingUpgradeName">{def.name}</span>
                          {nextEffect != null ? <span className="fishingUpgradeNextEffect">{nextEffect}</span> : null}
                        </div>
                      </td>
                      <td className="fishingUpgradeTdLvl">
                        <span className="fishingUpgradeLevelLabel">
                          lvl <span className="mono">{lvl}</span> / {maxLvl}
                        </span>
                        <div className="btnRow fishingUpgradeButtons">
                          <button
                            type="button"
                            className="btn btnSecondary"
                            onClick={() => setFishingUpgradeLevel(def.id, -1)}
                            disabled={lvl <= 0}
                            aria-label="Decrease level"
                          >
                            −
                          </button>
                          {!isMaxed ? (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => setFishingUpgradeLevel(def.id, 1)}
                              aria-label="Increase level"
                            >
                              +
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="fishingUpgradeTdCostEffic">
                        {!isMaxed &&
                        marginalPct != null &&
                        hoursToNext != null &&
                        hoursToNext > 0
                          ? (() => {
                              const costEffic = marginalPct / hoursToNext;
                              const heatT =
                                costEfficHeatMax > costEfficHeatMin
                                  ? (costEffic - costEfficHeatMin) / (costEfficHeatMax - costEfficHeatMin)
                                  : 0.5;
                              const rateColor = heatmapColor(heatT);
                              return (
                                <span
                                  style={{
                                    backgroundColor: rateColor,
                                    color: heatT > 0.5 ? "#0a0a0a" : "#fff",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                  }}
                                >
                                  {costEffic.toFixed(2)}
                                </span>
                              );
                            })()
                          : "—"}
                      </td>
                      <td className="fishingUpgradeTdCost">
                        {isMaxed ? (
                          <span className="fishingUpgradeMaxed">Maxed</span>
                        ) : nextCostEntry && fishDef ? (
                          <>
                            <span className="fishingUpgradeCostBox">
                              <img src={fishIconUrl(fishDef.iconFile)} alt="" className="fishingUpgradeCostFishIcon" />
                              <span className="mono">{nextCostEntry.amount.toLocaleString()}</span>
                            </span>
                          </>
                        ) : nextCostEntry ? (
                          <span className="fishingUpgradeCostBox">
                            <span className="mono">{nextCostEntry.amount.toLocaleString()}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="fishingUpgradeTdTime">
                        <span className="fishingUpgradeTimeToNext">
                          {!isMaxed && hoursToNext != null
                            ? formatHoursToHhMin(hoursToNext)
                            : isMaxed
                              ? ""
                              : "—"}
                        </span>
                      </td>
                      <td className="fishingUpgradeTdSpeed">
                        {marginalPct != null ? `+${marginalPct.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
                  </tbody>
                </table>
              </div>
            </Collapsible>
            <Collapsible id="fishing-upgrades-t2" title="Tier 2" defaultExpanded={false} className="fishingUpgradesTier">
              <div className="fishingUpgradesList">
                <table className="fishingUpgradeTable">
                  <thead>
                    <tr>
                      <th className="fishingUpgradeThName">Upgrade</th>
                      <th className="fishingUpgradeThLvl">Lvl</th>
                      <th className="fishingUpgradeThCostEffic">
                        Cost Effic.
                        <Tooltip
                          content={{
                            title: "Cost efficiency",
                            sections: [
                              {
                                heading: "How it works",
                                lines: [
                                  "Marginal % gain divided by hours to get the cost for the next level.",
                                  "Higher = more gain per hour of farming invested.",
                                ],
                              },
                            ],
                          }}
                        />
                      </th>
                      <th className="fishingUpgradeThCost">Cost</th>
                      <th className="fishingUpgradeThTime">
                        Time to next
                        <Tooltip
                          content={{
                            title: "Time to next",
                            sections: [
                              {
                                heading: "What it means",
                                lines: [
                                  "Time to get enough of the cost fish for the next level.",
                                  "Assumes all fish per hour goes to that fish type.",
                                ],
                              },
                            ],
                          }}
                        />
                      </th>
                      <th className="fishingUpgradeThSpeed">
                        +% gains
                        <Tooltip
                          content={{
                            title: "+% gains",
                            sections: [
                              {
                                heading: "Marginal gain",
                                lines: [
                                  "Percent increase in total fish per hour for +1 level of this upgrade.",
                                  "Uses the same total as the fishing gains list above.",
                                ],
                              },
                            ],
                          }}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                {availableT2Upgrades.map((def) => {
                  const costs = UPGRADE_COSTS[def.id];
                  const maxLvl = costs?.length ? costs[costs.length - 1]!.level : 0;
                  const lvl = Math.max(0, Math.min(maxLvl, upgradeLevels[def.id] ?? 0));
                  const nextLevel = lvl + 1;
                  const nextCostEntry = costs?.find((c) => c.level === nextLevel);
                  const fishPerHour = nextCostEntry
                    ? (totalFishPerHourByFishId[nextCostEntry.fishId] ?? 0)
                    : 0;
                  const hoursToNext =
                    nextCostEntry && fishPerHour > 0
                      ? nextCostEntry.amount / fishPerHour
                      : null;
                  const fishDef = nextCostEntry ? getFishById(nextCostEntry.fishId) : undefined;
                  const isMaxed = lvl >= maxLvl;
                  const marginalPct = upgradeMarginalPct.get(def.id) ?? null;
                  const nextEffect = upgradeNextEffect.get(def.id) ?? null;
                  return (
                    <tr key={def.id} className="fishingUpgradeRow">
                      <td className="fishingUpgradeTdName">
                        <img src={upgradeIconUrl(def.iconFile)} alt="" className="fishingUpgradeIcon" />
                        <div className="fishingUpgradeNameBlock">
                          <span className="fishingUpgradeName">{def.name}</span>
                          {nextEffect != null ? <span className="fishingUpgradeNextEffect">{nextEffect}</span> : null}
                        </div>
                      </td>
                      <td className="fishingUpgradeTdLvl">
                        <span className="fishingUpgradeLevelLabel">
                          lvl <span className="mono">{lvl}</span> / {maxLvl}
                        </span>
                        <div className="btnRow fishingUpgradeButtons">
                          <button
                            type="button"
                            className="btn btnSecondary"
                            onClick={() => setFishingUpgradeLevel(def.id, -1)}
                            disabled={lvl <= 0}
                            aria-label="Decrease level"
                          >
                            −
                          </button>
                          {!isMaxed ? (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => setFishingUpgradeLevel(def.id, 1)}
                              aria-label="Increase level"
                            >
                              +
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="fishingUpgradeTdCostEffic">
                        {!isMaxed &&
                        marginalPct != null &&
                        hoursToNext != null &&
                        hoursToNext > 0
                          ? (() => {
                              const costEffic = marginalPct / hoursToNext;
                              const heatT =
                                costEfficHeatMax > costEfficHeatMin
                                  ? (costEffic - costEfficHeatMin) / (costEfficHeatMax - costEfficHeatMin)
                                  : 0.5;
                              const rateColor = heatmapColor(heatT);
                              return (
                                <span
                                  style={{
                                    backgroundColor: rateColor,
                                    color: heatT > 0.5 ? "#0a0a0a" : "#fff",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                  }}
                                >
                                  {costEffic.toFixed(2)}
                                </span>
                              );
                            })()
                          : "—"}
                      </td>
                      <td className="fishingUpgradeTdCost">
                        {isMaxed ? (
                          <span className="fishingUpgradeMaxed">Maxed</span>
                        ) : nextCostEntry && fishDef ? (
                          <span className="fishingUpgradeCostBox">
                            <img src={fishIconUrl(fishDef.iconFile)} alt="" className="fishingUpgradeCostFishIcon" />
                            <span className="mono">{nextCostEntry.amount.toLocaleString()}</span>
                          </span>
                        ) : nextCostEntry ? (
                          <span className="fishingUpgradeCostBox">
                            <span className="mono">{nextCostEntry.amount.toLocaleString()}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="fishingUpgradeTdTime">
                        <span className="fishingUpgradeTimeToNext">
                          {!isMaxed && hoursToNext != null
                            ? formatHoursToHhMin(hoursToNext)
                            : isMaxed
                              ? ""
                              : "—"}
                        </span>
                      </td>
                      <td className="fishingUpgradeTdSpeed">
                        {marginalPct != null ? `+${marginalPct.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
                  </tbody>
                </table>
              </div>
            </Collapsible>
          </div>
        </Collapsible>

        <Collapsible id="fishing-enhancements" title="Available enhancements" defaultExpanded={true}>
          <div className="fishingUpgradesPanel">
            <p className="fishingEnhancementsIntro">
              Enhancements cost <img src={GEM_ICON_URL} alt="gems" className="fishingGemIcon" /> gems. They do not count toward completion. See{" "}
              <a href="https://shminer.miraheze.org/wiki/Fishing#Enhancements" target="_blank" rel="noopener noreferrer">Fishing § Enhancements</a>.
            </p>
            <Collapsible id="fishing-enhancements-t1" title="Tier 1" defaultExpanded={true} className="fishingUpgradesTier">
              <div className="fishingUpgradesList">
                <table className="fishingUpgradeTable">
                  <thead>
                    <tr>
                      <th className="fishingUpgradeThName">Enhancement</th>
                      <th className="fishingUpgradeThLvl">Lvl</th>
                      <th className="fishingUpgradeThCostEffic">
                        Cost Effic.
                        <Tooltip
                          content={{
                            title: "Cost efficiency",
                            sections: [
                              {
                                heading: "How it works",
                                lines: [
                                  "Marginal % gain divided by gem cost for the next level.",
                                  "Higher = more gain per gem invested.",
                                ],
                              },
                            ],
                          }}
                        />
                      </th>
                      <th className="fishingUpgradeThCost">Cost</th>
                      <th className="fishingUpgradeThSpeed">
                        +% gains
                        <Tooltip
                          content={{
                            title: "+% gains",
                            sections: [
                              {
                                heading: "Marginal gain",
                                lines: [
                                  "Percent increase in total fish per hour for +1 level of this enhancement.",
                                  "Uses the same total as the fishing gains list above.",
                                ],
                              },
                            ],
                          }}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableT1Enhancements.map((def) => {
                      const costs = ENHANCE_COSTS_T1[def.id as keyof typeof ENHANCE_COSTS_T1];
                      const maxLvl = costs?.length ? costs[costs.length - 1]!.level : 0;
                      const lvl = Math.max(0, Math.min(maxLvl, enhanceLevels[def.id] ?? 0));
                      const nextLevel = lvl + 1;
                      const nextCostEntry = costs?.find((c) => c.level === nextLevel);
                      const isMaxed = lvl >= maxLvl;
                      const marginalPct = enhanceMarginalPct.get(def.id) ?? null;
                      const nextEffect = enhanceNextEffect.get(def.id) ?? null;
                      return (
                        <tr key={def.id} className="fishingUpgradeRow">
                          <td className="fishingUpgradeTdName">
                            <img src={enhanceIconUrl(def.iconFile)} alt="" className="fishingUpgradeIcon" />
                            <div className="fishingUpgradeNameBlock">
                              <span className="fishingUpgradeName">{def.name}</span>
                              {nextEffect != null ? <span className="fishingUpgradeNextEffect">{nextEffect}</span> : null}
                            </div>
                          </td>
                          <td className="fishingUpgradeTdLvl">
                            <span className="fishingUpgradeLevelLabel">
                              lvl <span className="mono">{lvl}</span> / {maxLvl}
                            </span>
                            <div className="btnRow fishingUpgradeButtons">
                              <button
                                type="button"
                                className="btn btnSecondary"
                                onClick={() => setFishingEnhanceLevel(def.id, -1)}
                                disabled={lvl <= 0}
                                aria-label="Decrease level"
                              >
                                −
                              </button>
                              {!isMaxed ? (
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() => setFishingEnhanceLevel(def.id, 1)}
                                  aria-label="Increase level"
                                >
                                  +
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td className="fishingUpgradeTdCostEffic">
                            {!isMaxed &&
                            marginalPct != null &&
                            nextCostEntry &&
                            nextCostEntry.gems > 0
                              ? (() => {
                                  const costEffic = (marginalPct / nextCostEntry.gems) * 100;
                                  const heatT =
                                    costEfficHeatMaxEnhance > costEfficHeatMinEnhance
                                      ? (costEffic - costEfficHeatMinEnhance) / (costEfficHeatMaxEnhance - costEfficHeatMinEnhance)
                                      : 0.5;
                                  const rateColor = heatmapColor(heatT);
                                  return (
                                    <span
                                      style={{
                                        backgroundColor: rateColor,
                                        color: heatT > 0.5 ? "#0a0a0a" : "#fff",
                                        padding: "2px 6px",
                                        borderRadius: 4,
                                      }}
                                    >
                                      {costEffic.toFixed(2)}
                                    </span>
                                  );
                                })()
                              : "—"}
                          </td>
                          <td className="fishingUpgradeTdCost">
                            {isMaxed ? (
                              <span className="fishingUpgradeMaxed">Maxed</span>
                            ) : nextCostEntry ? (
                              <span className="fishingUpgradeCostBox">
                                <img src={GEM_ICON_URL} alt="" className="fishingUpgradeCostFishIcon" />
                                <span className="mono">{nextCostEntry.gems.toLocaleString()}</span>
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="fishingUpgradeTdSpeed">
                            {marginalPct != null ? `+${marginalPct.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Collapsible>
            <Collapsible id="fishing-enhancements-t2" title="Tier 2" defaultExpanded={false} className="fishingUpgradesTier">
              <div className="fishingUpgradesList">
                <table className="fishingUpgradeTable">
                  <thead>
                    <tr>
                      <th className="fishingUpgradeThName">Enhancement</th>
                      <th className="fishingUpgradeThLvl">Lvl</th>
                      <th className="fishingUpgradeThCostEffic">
                        Cost Effic.
                        <Tooltip
                          content={{
                            title: "Cost efficiency",
                            sections: [
                              {
                                heading: "How it works",
                                lines: [
                                  "Marginal % gain divided by gem cost for the next level.",
                                  "Higher = more gain per gem invested.",
                                ],
                              },
                            ],
                          }}
                        />
                      </th>
                      <th className="fishingUpgradeThCost">Cost</th>
                      <th className="fishingUpgradeThSpeed">
                        +% gains
                        <Tooltip
                          content={{
                            title: "+% gains",
                            sections: [
                              {
                                heading: "Marginal gain",
                                lines: [
                                  "Percent increase in total fish per hour for +1 level of this enhancement.",
                                  "Uses the same total as the fishing gains list above.",
                                ],
                              },
                            ],
                          }}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableT2Enhancements.map((def) => {
                      const costs = ENHANCE_COSTS_T2[def.id as keyof typeof ENHANCE_COSTS_T2];
                      const maxLvl = costs?.length ? costs[costs.length - 1]!.level : 0;
                      const lvl = Math.max(0, Math.min(maxLvl, enhanceLevels[def.id] ?? 0));
                      const nextLevel = lvl + 1;
                      const nextCostEntry = costs?.find((c) => c.level === nextLevel);
                      const isMaxed = lvl >= maxLvl;
                      const marginalPct = enhanceMarginalPct.get(def.id) ?? null;
                      const nextEffect = enhanceNextEffect.get(def.id) ?? null;
                      return (
                        <tr key={def.id} className="fishingUpgradeRow">
                          <td className="fishingUpgradeTdName">
                            <img src={enhanceIconUrl(def.iconFile)} alt="" className="fishingUpgradeIcon" />
                            <div className="fishingUpgradeNameBlock">
                              <span className="fishingUpgradeName">{def.name}</span>
                              {nextEffect != null ? <span className="fishingUpgradeNextEffect">{nextEffect}</span> : null}
                            </div>
                          </td>
                          <td className="fishingUpgradeTdLvl">
                            <span className="fishingUpgradeLevelLabel">
                              lvl <span className="mono">{lvl}</span> / {maxLvl}
                            </span>
                            <div className="btnRow fishingUpgradeButtons">
                              <button
                                type="button"
                                className="btn btnSecondary"
                                onClick={() => setFishingEnhanceLevel(def.id, -1)}
                                disabled={lvl <= 0}
                                aria-label="Decrease level"
                              >
                                −
                              </button>
                              {!isMaxed ? (
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() => setFishingEnhanceLevel(def.id, 1)}
                                  aria-label="Increase level"
                                >
                                  +
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td className="fishingUpgradeTdCostEffic">
                            {!isMaxed &&
                            marginalPct != null &&
                            nextCostEntry &&
                            nextCostEntry.gems > 0
                              ? (() => {
                                  const costEffic = (marginalPct / nextCostEntry.gems) * 100;
                                  const heatT =
                                    costEfficHeatMaxEnhance > costEfficHeatMinEnhance
                                      ? (costEffic - costEfficHeatMinEnhance) / (costEfficHeatMaxEnhance - costEfficHeatMinEnhance)
                                      : 0.5;
                                  const rateColor = heatmapColor(heatT);
                                  return (
                                    <span
                                      style={{
                                        backgroundColor: rateColor,
                                        color: heatT > 0.5 ? "#0a0a0a" : "#fff",
                                        padding: "2px 6px",
                                        borderRadius: 4,
                                      }}
                                    >
                                      {costEffic.toFixed(2)}
                                    </span>
                                  );
                                })()
                              : "—"}
                          </td>
                          <td className="fishingUpgradeTdCost">
                            {isMaxed ? (
                              <span className="fishingUpgradeMaxed">Maxed</span>
                            ) : nextCostEntry ? (
                              <span className="fishingUpgradeCostBox">
                                <img src={GEM_ICON_URL} alt="" className="fishingUpgradeCostFishIcon" />
                                <span className="mono">{nextCostEntry.gems.toLocaleString()}</span>
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="fishingUpgradeTdSpeed">
                            {marginalPct != null ? `+${marginalPct.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Collapsible>
          </div>
        </Collapsible>

        <Collapsible id="fishing-fish-cards" title="Fish Cards" defaultExpanded={true}>
          <div className="fishingFishCardsPanel">
            <div className="fishingFishCardsGrid" style={{ marginBottom: 10 }}>
              <div className="fishingFishCardCell">
                <div className="fishingFishCardCellTop">
                  <img src={upgradeIconUrl("Fishing_Rod_Power.png")} alt="" className="fishingFishCardIcon" />
                  <span className="mono">Fishing Rod Power</span>
                  <Tooltip
                    content={{
                      title: "Fishing Rod card",
                      lines: ["Multiplies your Fishing Rod Power. Card 1.02×, Gilded 1.05×, Poly 1.10×."],
                    }}
                  />
                </div>
                <FishCardTierToggles
                  value={state.fishingRodCardTier}
                  onChange={(t) => setState((prev) => ({ ...prev, fishingRodCardTier: t }))}
                />
                <div className="small" style={{ marginTop: 4, opacity: 0.85 }}>Card 1.02× · Gilded 1.05× · Poly 1.10×</div>
              </div>
            </div>
            <div className="fishingFishCardsGrid">
              {ALL_FISH.map((f) => {
                const tier = (state.fishCardTier[f.id] ?? 0) as FishCardTier;
                return (
                  <div key={f.id} className="fishingFishCardCell">
                    <div className="fishingFishCardCellTop">
                      <img src={fishIconUrl(f.iconFile)} alt="" className="fishingFishCardIcon" />
                      <span className="mono">{f.name}</span>
                    </div>
                    <FishCardTierToggles
                      value={tier}
                      onChange={(t) => setState((prev) => ({ ...prev, fishCardTier: { ...prev.fishCardTier, [f.id]: t } }))}
                    />
                  </div>
                );
              })}
            </div>
            <div className="fishingFishCardsValuePack">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={state.valuePackPotencyPoly}
                  onChange={(e) => setState((prev) => ({ ...prev, valuePackPotencyPoly: e.target.checked }))}
                />
                Value Pack (potency poly ×1.15)
              </label>
            </div>
            <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
              Card: 50% second fish (1.5×). Gilded: 100% second fish (2×). Poly: 4× base. Poly multi from upgrades and Value Pack applies on top.
            </div>
          </div>
        </Collapsible>

        <Collapsible id="fishing-skill-tree" title="Skill Tree" defaultExpanded={true}>
          <div className="small" style={{ marginBottom: 8 }}>
            Skills cost skill points (from Obelisk level). Cost efficiency = marginal % gain per skill point for the next level.
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="label" style={{ alignItems: "center", gap: 8 }}>
              <img src={SKILL_POINT_ICON_URL} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />
              <span className="mono">Legendary Fish Found (0–6)</span>
              <span className="mono">{state.legendaryFishFound}</span>
            </div>
            <div className="btnRow" style={{ marginTop: 4 }}>
              <button type="button" className="btn btnSecondary" onClick={() => setState((p) => ({ ...p, legendaryFishFound: Math.max(0, p.legendaryFishFound - 1) }))} disabled={state.legendaryFishFound <= 0}>−</button>
              <button type="button" className="btn" onClick={() => setState((p) => ({ ...p, legendaryFishFound: Math.min(6, p.legendaryFishFound + 1) }))} disabled={state.legendaryFishFound >= 6}>+</button>
            </div>
            <div className="small" style={{ marginTop: 4, opacity: 0.85 }}>Used for Completionist Gatekeeper bonus.</div>
          </div>
          <div className="fishingUpgradesList">
            <table className="fishingUpgradeTable">
              <thead>
                <tr>
                  <th className="fishingUpgradeThName">Skill</th>
                  <th className="fishingUpgradeThLvl">Lvl</th>
                  <th className="fishingUpgradeThCostEffic">
                    Cost Effic.
                    <Tooltip
                      content={{
                        title: "Cost efficiency",
                        sections: [
                          {
                            heading: "Skill points",
                            lines: [
                              "Marginal % gain divided by skill points for the next level.",
                              "Higher value means more gain per skill point spent.",
                            ],
                          },
                        ],
                      }}
                    />
                  </th>
                  <th className="fishingUpgradeThCost">Cost (next)</th>
                  <th className="fishingUpgradeThSpeed">+% gains</th>
                </tr>
              </thead>
              <tbody>
                {FISHING_SKILL_TREE.map((def) => {
                  const maxLvl = def.costs.length;
                  const lvl = Math.max(0, Math.min(maxLvl, state.skillTreeLevels[def.id] ?? 0));
                  const nextCost = lvl < maxLvl ? (def.costs[lvl] ?? 0) : null;
                  const isMaxed = lvl >= maxLvl;
                  const marginalPct = skillMarginalPct.get(def.id) ?? null;
                  const costEffic =
                    !isMaxed &&
                    marginalPct != null &&
                    nextCost != null &&
                    nextCost > 0
                      ? marginalPct / nextCost
                      : null;
                  const heatT =
                    costEffic != null && costEfficHeatMaxSkill > costEfficHeatMinSkill
                      ? (costEffic - costEfficHeatMinSkill) / (costEfficHeatMaxSkill - costEfficHeatMinSkill)
                      : 0.5;
                  return (
                    <tr key={def.id} className="fishingUpgradeRow">
                      <td className="fishingUpgradeTdName">
                        <img src={fishIconUrl(def.iconFile)} alt="" className="fishingUpgradeIcon" />
                        <div className="fishingUpgradeNameBlock">
                          <span className="fishingUpgradeName">{def.name}</span>
                          <div className="small" style={{ marginTop: 2, opacity: 0.9 }}>
                            {def.effectLines.map((line, i) => (
                              <div key={i}>{line}</div>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="fishingUpgradeTdLvl">
                        <span className="fishingUpgradeLevelLabel">
                          <span className="mono">{lvl}</span> / {maxLvl}
                        </span>
                        <div className="btnRow fishingUpgradeButtons">
                          <button
                            type="button"
                            className="btn btnSecondary"
                            onClick={() => setSkillTreeLevel(def.id, -1)}
                            disabled={lvl <= 0}
                            aria-label="Decrease level"
                          >
                            −
                          </button>
                          {!isMaxed ? (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => setSkillTreeLevel(def.id, 1)}
                              aria-label="Increase level"
                            >
                              +
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="fishingUpgradeTdCostEffic">
                        {costEffic != null ? (
                          (() => {
                            const breakdown = skillMarginalBreakdown.get(def.id);
                            const totalPct = breakdown?.reduce((s, b) => s + b.pct, 0) ?? 0;
                            const hasBreakdown = breakdown?.length && totalPct > 0;
                            return (
                              <span className="fishingCostEfficWrap">
                                {hasBreakdown ? (
                                  <div className="fishingCostEfficPop">
                                    <div className="fishingCostEfficPopTitle">Share of marginal gain (sum 100%)</div>
                                    {breakdown!.map((b, i) => (
                                      <span key={i} className="fishingCostEfficPopLine">
                                        {b.label}: {((b.pct / totalPct) * 100).toFixed(1)}%
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                <span
                                  style={{
                                    backgroundColor: heatmapColor(heatT),
                                    color: heatT > 0.5 ? "#0a0a0a" : "#fff",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                  }}
                                >
                                  {costEffic.toFixed(3)}
                                </span>
                              </span>
                            );
                          })()
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="fishingUpgradeTdCost">
                        {isMaxed ? (
                          <span className="fishingUpgradeMaxed">Maxed</span>
                        ) : nextCost != null ? (
                          <span className="fishingUpgradeCostBox">
                            <img src={SKILL_POINT_ICON_URL} alt="" className="fishingUpgradeCostFishIcon" />
                            <span className="mono">{nextCost.toLocaleString()}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="fishingUpgradeTdSpeed">
                        {marginalPct != null ? `+${marginalPct.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
