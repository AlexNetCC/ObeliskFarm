import { useEffect, useMemo, useState } from "react";
import "./fishing.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
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
  FISHING_UPGRADES_T1,
  FISHING_UPGRADES_T2,
  getFishById,
  upgradeIconUrl,
  enhanceIconUrl,
  UPGRADE_COSTS,
  type DockId,
  type EnhanceId,
  type FishingUpgradeId,
} from "../../lib/fishing";

/** Fish card tier: 0 = none, 1 = Card (1.5×), 2 = Gilded (2×), 3 = Poly (4× base). */
export type FishCardTier = 0 | 1 | 2 | 3;

type SavedState = {
  dronesPerDock?: Partial<Record<DockId, number>>;
  activeDockId?: DockId | null;
  showDisabledFishGrayed?: boolean;
  upgradeLevels?: Partial<Record<FishingUpgradeId, number>>;
  enhanceLevels?: Partial<Record<EnhanceId, number>>;
  fishCardTier?: Partial<Record<string, FishCardTier>>;
  valuePackPotencyPoly?: boolean;
};

/** Single persisted state (same pattern as Drone: one state, lazy load, save on change). */
type FishingState = {
  dronesPerDock: Record<DockId, number>;
  activeDockId: DockId;
  showDisabledFishGrayed: boolean;
  upgradeLevels: Partial<Record<FishingUpgradeId, number>>;
  enhanceLevels: Partial<Record<EnhanceId, number>>;
  fishCardTier: Partial<Record<string, FishCardTier>>;
  valuePackPotencyPoly: boolean;
};

const STORAGE_KEY = "obeliskfarm:web:fishing_save.json:v1";
const FISHING_EXTERNAL_KEY = "obeliskfarm:web:fishing_external.json";

/** Elixir 3× Fishing Tick Speed buff icon (same as Drone module). */
const ELIXIR_3X_FISHING_BUFF_ICON = "https://static.wikitide.net/shminerwiki/8/87/Triple_Fish_Tick_Chance.png";

const FISHING_ICON = "https://static.wikitide.net/shminerwiki/f/fb/Fishing_Button.png";

/** Gem icon for enhancement costs (wiki File:Gem.png). */
const GEM_ICON_URL = fishIconUrl("Gem.png");


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
      return `${current.drone_base_power.toFixed(2)}→${next.drone_base_power.toFixed(2)}`;
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
      return `${current.drone_base_power.toFixed(2)}→${next.drone_base_power.toFixed(2)}`;
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
): number {
  const stats = computeFishingStatsFromLevels(upgradeLevels, enhanceLevels);
  const s = stats.shiny_fish_chance_pct / 100;
  const s2 = stats.super_shiny_chance_pct / 100;
  const expectedShinyMulti =
    (1 - s) * 1 +
    s * (1 - s2) * stats.shiny_multiplier +
    s * s2 * stats.shiny_multiplier * stats.super_shiny_multiplier;
  const tickDurationSec = Math.max(1, 60 + stats.fishing_tick_reduction);
  const effectiveTickSec = effectiveFishingTickSec(tickDurationSec, elixir3xFishingExternal.uptimeFraction);
  let total = 0;
  for (const set of AQUARIUM) {
    const dock = DOCKS.find((d) => d.id === set.dockId)!;
    const rod = activeDockId === set.dockId ? stats.fishing_rod_power : 0;
    const n = dronesPerDock[set.dockId] ?? 0;
    const powerOnThisDock = rod + n * stats.drone_base_power;
    const dockFillsPerHour = 3600 / (dock.baseTicksNeeded * effectiveTickSec);
    for (const f of set.fish) {
      total +=
        dockFillsPerHour *
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

/** Read-only stat row (value computed from upgrades/enhancements). */
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
        <span className="mono fishingRowValue">{displayValue}{suffix}</span>
      </div>
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
    const valuePackPotencyPoly = saved?.valuePackPotencyPoly ?? false;
    return { dronesPerDock, showDisabledFishGrayed, activeDockId, upgradeLevels, enhanceLevels, fishCardTier, valuePackPotencyPoly };
  });

  useEffect(() => {
    saveJson(STORAGE_KEY, state);
  }, [state]);

  const upgradeLevels = state.upgradeLevels ?? {};
  const enhanceLevels = state.enhanceLevels ?? {};
  const stats: ComputedFishingStats = computeFishingStatsFromLevels(upgradeLevels, enhanceLevels);

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

  /** Power on a dock: rod only on the dock you're fishing at (active); else 0. Plus drones on this dock. */
  function powerForDock(dockId: DockId): number {
    const rod = state.activeDockId === dockId ? stats.fishing_rod_power : 0;
    const n = state.dronesPerDock[dockId] ?? 0;
    return rod + n * stats.drone_base_power;
  }

  /** Base tick duration in seconds (60 + reduction, e.g. -40 → 20). */
  const tickDurationSec = Math.max(1, 60 + stats.fishing_tick_reduction);
  /** Elixir 3× Fishing Tick Speed: from Drone module (fishing_external.json). Open Drone to sync. */
  const elixir3xFishingExternal = (() => {
    const ext = loadJson<{
      elixir3xFishingTickSpeedMinPerHour?: number;
      elixir3xFishingTickSpeedUptimeFraction?: number;
    }>(FISHING_EXTERNAL_KEY);
    const minPerHour = typeof ext?.elixir3xFishingTickSpeedMinPerHour === "number" ? ext.elixir3xFishingTickSpeedMinPerHour : 0;
    const uptimeFraction =
      typeof ext?.elixir3xFishingTickSpeedUptimeFraction === "number"
        ? Math.max(0, Math.min(1, ext.elixir3xFishingTickSpeedUptimeFraction))
        : 0;
    return { minPerHour, uptimeFraction };
  })();

  const effectiveTickSec = effectiveFishingTickSec(tickDurationSec, elixir3xFishingExternal.uptimeFraction);
  /** Fish/h multiplier from Elixir 3× buff (1 = no buff, 3 = 100% uptime). */
  const elixir3xFishingMulti =
    effectiveTickSec > 0 ? Math.min(3, tickDurationSec / effectiveTickSec) : 1;

  const fishingGainsRows = useMemo(() => {
    const dockIds = new Set(availableDocks.map((d) => d.id));
    return AQUARIUM.filter((set) => dockIds.has(set.dockId)).flatMap((set) => {
      const dock = DOCKS.find((d) => d.id === set.dockId)!;
      const powerOnThisDock = powerForDock(set.dockId);
      const dockFillsPerHour = 3600 / (dock.baseTicksNeeded * effectiveTickSec);
      return set.fish.map((f) => {
        const catchPct = catchChancePercent(powerOnThisDock, f.powerRating);
        const baseFishPerHour =
          dockFillsPerHour *
          expectedCatchesPerRoll(powerOnThisDock, f.powerRating) *
          stats.fish_income_multi *
          expectedShinyMulti;
        const cardMulti = getCardMulti(f.id);
        const fishPerHour = baseFishPerHour * cardMulti;
        const totalMulti = stats.fish_income_multi * expectedShinyMulti * cardMulti;
        const hasPower = powerOnThisDock > 0;
        return {
          dockId: set.dockId,
          dockName: dock.name,
          hasPower,
          fish: f,
          fishPerHour,
          catchPct,
          totalMulti,
        };
      });
    });
  }, [
    availableDocks,
    effectiveTickSec,
    expectedShinyMulti,
    stats.fishing_rod_power,
    stats.drone_base_power,
    stats.fish_income_multi,
    state.dronesPerDock,
    state.activeDockId,
    getCardMulti,
  ]);

  /** Fish only where power > 0. Visible = show-grayed ? all (gray where !hasPower) : only hasPower. */
  const visibleGainsRows = useMemo(() => {
    if (state.showDisabledFishGrayed) return fishingGainsRows;
    return fishingGainsRows.filter((r) => r.hasPower);
  }, [fishingGainsRows, state.showDisabledFishGrayed]);

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
    const currentTotal = computeTotalFishPerHour(
      upgradeLevels,
      enhanceLevels,
      state.dronesPerDock,
      state.activeDockId,
      elixir3xFishingExternal,
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
                          {catchPct.toFixed(1)}%
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
          </div>
        </Collapsible>

        <Collapsible
          id="fishing-your-stats"
          title="Your stats (from game)"
          defaultExpanded={true}
          className="fishingLeftPanel"
          headerRight={
            <>
              <Tooltip content={statsTooltip} />
              <span className="small" style={{ opacity: 0.85 }}>Stats § Fishing</span>
            </>
          }
        >
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
                    value={stats.fishing_rod_power}
                    decimals={2}
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
                    value={stats.drone_base_power}
                    decimals={2}
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
            ) : null}
            <div className="fishingDockHeaderRow">
              <span className="fishingDockHeaderFisher">Fisher here</span>
              <span className="fishingDockHeaderPower">Power</span>
              <span className="fishingDockHeaderDrones">Drones</span>
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
                    <span className="fishingDockRowPower">Power: {dockPower}</span>
                    <span className="fishingDockRowDrones">Drones: {dockDrones}</span>
                  </div>
                  <div className="fishingDockDroneControls">
                    <span className="fishingDockDroneControlsLabel">Fishing drone count</span>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ALL_FISH.map((f) => {
                const tier = (state.fishCardTier[f.id] ?? 0) as FishCardTier;
                return (
                  <div
                    key={f.id}
                    style={{
                      border: "1px solid rgba(15,23,42,0.10)",
                      borderRadius: 10,
                      padding: 10,
                      background: "var(--tier2)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
            <div className="fishingFishCardsValuePack" style={{ marginTop: 12 }}>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={state.valuePackPotencyPoly}
                  onChange={(e) => setState((prev) => ({ ...prev, valuePackPotencyPoly: e.target.checked }))}
                />
                Value Pack (potency poly ×1.15)
              </label>
            </div>
            <div className="small" style={{ marginTop: 8, opacity: 0.85 }}>
              Card: 50% second fish (1.5×). Gilded: 100% second fish (2×). Poly: 4× base. Poly multi from upgrades and Value Pack applies on top.
            </div>
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
