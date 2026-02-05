import { useEffect, useMemo, useState } from "react";
import "./fishing.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
import { loadJson, saveJson } from "../../lib/storage";
import {
  AQUARIUM,
  DOCKS,
  catchChancePercent,
  computeFishingStatsFromLevels,
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

/** Full fishing stats: all computed from upgrade and enhancement levels (including boat levels). */
type FishingStats = {
  boat_level: number;
  t2_boat_level: number;
  fishing_rod_power: number;
  fishing_drone_cap: number;
  drone_base_power: number;
  fish_income_multi: number;
  fishing_tick_reduction: number;
  token_gain_multi: number;
  notice_fish_req: number;
  shiny_multiplier: number;
  super_shiny_multiplier: number;
};

type SavedState = {
  dronesPerDock?: Partial<Record<DockId, number>>;
  activeDockId?: DockId | null;
  showDisabledFishGrayed?: boolean;
  upgradeLevels?: Partial<Record<FishingUpgradeId, number>>;
  enhanceLevels?: Partial<Record<EnhanceId, number>>;
};

/** Single persisted state (same pattern as Drone: one state, lazy load, save on change). */
type FishingState = {
  dronesPerDock: Record<DockId, number>;
  activeDockId: DockId;
  showDisabledFishGrayed: boolean;
  upgradeLevels: Partial<Record<FishingUpgradeId, number>>;
  enhanceLevels: Partial<Record<EnhanceId, number>>;
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

/** Interpolate green (t=1) → red (t=0). t in [0,1]. Muted palette. */
function heatmapColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(140 + 70 * (1 - clamped));
  const g = Math.round(140 + 70 * clamped);
  const b = 120;
  return `rgb(${r},${g},${b})`;
}

/**
 * Approximate marginal % overall fish gain from +1 level of this upgrade.
 * Returns null when not applicable (boat, shiny, assignment-dependent, etc.).
 */
function upgradeMarginalFishPct(
  upgradeId: FishingUpgradeId,
  stats: { fish_income_multi: number; fishing_tick_reduction: number },
  effectiveTickSec: number,
): number | null {
  const multi = Math.max(0.01, stats.fish_income_multi);
  const tickSec = Math.max(1, effectiveTickSec);
  switch (upgradeId) {
    case "fish_multiplier":
      return (100 * 0.03) / multi;
    case "tick_speed": {
      const newTick = Math.max(0.5, tickSec - 0.5);
      return 100 * (tickSec / newTick - 1);
    }
    case "rod_multiplier":
      return 4;
    case "drone_multiplier":
      return 6;
    case "fishing_rod":
      return 16;
    case "double_tick_chance":
      return 0.5;
    case "triple_tick_chance":
      return 0.35 * 2;
    case "tier2_dock_power":
      return 5;
    case "drone_cloner":
      return 5;
    default:
      return null;
  }
}

/**
 * Approximate marginal % overall fish gain from +1 level of this enhancement.
 * Returns null when not applicable (token, notice, T2 dock-only, etc.).
 */
function enhanceMarginalGainsPct(
  enhanceId: EnhanceId,
  stats: { fish_income_multi: number; fishing_tick_reduction: number },
  effectiveTickSec: number,
): number | null {
  const multi = Math.max(0.01, stats.fish_income_multi);
  const tickSec = Math.max(1, effectiveTickSec);
  switch (enhanceId) {
    case "enhance_fish_multiplier":
      return (100 * 0.05) / multi;
    case "enhance_tick_speed": {
      const newTick = Math.max(0.5, tickSec - 0.5);
      return 100 * (tickSec / newTick - 1);
    }
    case "enhance_rod_multiplier":
      return 5;
    case "enhance_drone_multiplier":
      return 8;
    case "enhance_double_tick_chance":
      return 0.5;
    case "enhance_triple_tick_chance":
      return 0.4 * 2;
    case "enhance_tier2_dock_power":
      return 5;
    default:
      return null;
  }
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
      lines: ["Values are computed from your Upgrade and Enhancement levels, including Boat levels (Upgrade Boat / Upgrade T2 Boat)."],
    },
    {
      heading: "Tick reduction",
      lines: [
        "Seconds reduced from base 60s per tick.",
        "Example: -40 means 20s per tick.",
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
    return { dronesPerDock, showDisabledFishGrayed, activeDockId, upgradeLevels, enhanceLevels };
  });

  useEffect(() => {
    saveJson(STORAGE_KEY, state);
  }, [state]);

  const upgradeLevels = state.upgradeLevels ?? {};
  const enhanceLevels = state.enhanceLevels ?? {};
  const stats: FishingStats = computeFishingStatsFromLevels(upgradeLevels, enhanceLevels);

  const totalDronesAssigned = useMemo(
    () => DOCKS.reduce((sum, d) => sum + (state.dronesPerDock[d.id] ?? 0), 0),
    [state.dronesPerDock],
  );
  const droneCap = Math.floor(stats.fishing_drone_cap);

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
    return AQUARIUM.flatMap((set) => {
      const dock = DOCKS.find((d) => d.id === set.dockId)!;
      const powerOnThisDock = powerForDock(set.dockId);
      const dockFillsPerHour = 3600 / (dock.baseTicksNeeded * effectiveTickSec);
      return set.fish.map((f) => {
        const catchPct = catchChancePercent(powerOnThisDock, f.powerRating);
        const fishPerHour =
          dockFillsPerHour *
          expectedCatchesPerRoll(powerOnThisDock, f.powerRating) *
          stats.fish_income_multi;
        const hasPower = powerOnThisDock > 0;
        return {
          dockId: set.dockId,
          dockName: dock.name,
          hasPower,
          fish: f,
          fishPerHour,
          catchPct,
        };
      });
    });
  }, [
    effectiveTickSec,
    stats.fishing_rod_power,
    stats.drone_base_power,
    stats.fish_income_multi,
    state.dronesPerDock,
    state.activeDockId,
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

  /** Time-to-next heatmap: min/max hours across T1 + T2 upgrades (short = green, long = red). */
  const { timeHeatMin, timeHeatMax } = useMemo(() => {
    const hours: number[] = [];
    for (const def of [...availableT1Upgrades, ...availableT2Upgrades]) {
      const costs = UPGRADE_COSTS[def.id];
      const maxLvl = costs?.length ? costs[costs.length - 1]!.level : 0;
      const lvl = Math.max(0, Math.min(maxLvl, upgradeLevels[def.id] ?? 0));
      if (lvl >= maxLvl) continue;
      const nextLevel = lvl + 1;
      const nextCostEntry = costs?.find((c) => c.level === nextLevel);
      const fishPerHour = nextCostEntry
        ? (totalFishPerHourByFishId[nextCostEntry.fishId] ?? 0)
        : 0;
      if (nextCostEntry && fishPerHour > 0) {
        hours.push(nextCostEntry.amount / fishPerHour);
      }
    }
    if (hours.length === 0) return { timeHeatMin: 0, timeHeatMax: 1 };
    return { timeHeatMin: Math.min(...hours), timeHeatMax: Math.max(...hours) };
  }, [
    availableT1Upgrades,
    availableT2Upgrades,
    totalFishPerHourByFishId,
    upgradeLevels,
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
        <Collapsible id="fishing-gains" title="Fishing gains" defaultExpanded={true}>
          <div className="fishingSection">
            <div className="fishingSectionHeader">
              <div className="fishingSectionTitle">
                <span className="mono">Fish per hour (by fish)</span>
              </div>
            </div>
            <div className="fishingGainsToggleWrap">
              <label className="fishingGainsToggleLabel">
                <input
                  type="checkbox"
                  checked={state.showDisabledFishGrayed}
                  onChange={(e) => setState((prev) => ({ ...prev, showDisabledFishGrayed: e.target.checked }))}
                />
                <span className="small">Show fish from docks with no power (grayed)</span>
              </label>
            </div>
            <div className="fishingGainsList">
              {visibleGainsRows.map(({ dockId, dockName, hasPower, fish, fishPerHour, catchPct }) => {
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
                    title={!hasPower ? `No power on dock "${dockName}"` : undefined}
                  >
                    <img
                      src={fishIconUrl(fish.iconFile)}
                      alt=""
                      className="fishingFishIcon"
                    />
                    <span className="fishingGainsFishName">{fish.name}</span>
                    <span className="small fishingGainsDockName">{dockName}</span>
                    <span className="fishingGainsRateWrap">
                      {isActive && (
                        <span className="fishingGainsCatchPct" title="Catch chance %">
                          {catchPct.toFixed(0)}%
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
              <span className="fishingGainsElixirLabel">Elixir Drone 3× Fishing Tick Speed</span>
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
              <span className="small" style={{ opacity: 0.85 }}>Stats#Fishing</span>
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
              label="T2 Boat level"
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
              <div className="fishingRows">
                <StatRow
                  label="Fishing Rod Power"
                  iconUrl={upgradeIconUrl("Fishing_Rod_Power.png")}
                  value={stats.fishing_rod_power}
                  decimals={2}
                />
                <StatRow
                  label="Fishing Drone Cap"
                  iconUrl={upgradeIconUrl("Fishing_Drone_Capacity.png")}
                  value={stats.fishing_drone_cap}
                  decimals={2}
                  suffix=""
                />
                <StatRow
                  label="Drone Base Power"
                  iconUrl={upgradeIconUrl("Fishing_Drone_Base_Power.png")}
                  value={stats.drone_base_power}
                  decimals={2}
                  suffix=""
                />
                <StatRow
                  label="Fish Income Multiplier (×)"
                  iconUrl={upgradeIconUrl("Fish_Income_Multiplier.png")}
                  value={stats.fish_income_multi}
                  decimals={2}
                  suffix="×"
                />
                <StatRow
                  label="Fishing Tick Reduction (s)"
                  iconUrl={upgradeIconUrl("Fishing_Tick_Reduction.png")}
                  value={stats.fishing_tick_reduction}
                  decimals={1}
                  suffix="s"
                />
                <StatRow
                  label="Token Gain Multiplier"
                  iconUrl={upgradeIconUrl("Fish_Token_Gain_Multiplier.png")}
                  value={stats.token_gain_multi}
                  decimals={2}
                  suffix="×"
                />
                <StatRow
                  label="Notice Fish Requirement"
                  value={stats.notice_fish_req}
                  decimals={2}
                  suffix="×"
                />
                <StatRow
                  label="Shiny Multiplier"
                  iconUrl={upgradeIconUrl("Shiny_Multiplier.png")}
                  value={stats.shiny_multiplier}
                  decimals={2}
                  suffix="×"
                />
                <StatRow
                  label="Super Shiny Multiplier"
                  iconUrl={upgradeIconUrl("Super_Shiny_Multiplier.png")}
                  value={stats.super_shiny_multiplier}
                  decimals={2}
                  suffix="×"
                />
              </div>
            </div>
          </div>
        </Collapsible>

        <Collapsible id="fishing-docks" title="Docks" defaultExpanded={true}>
          <div className="fishingDocksBox">
            <div className="fishingDockHeaderRow">
              <span className="fishingDockHeaderFisher">Fisher here</span>
              <span className="fishingDockHeaderPower">Power</span>
              <span className="fishingDockHeaderDrones">Drones</span>
            </div>
            {DOCKS.map((dock) => {
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
                    <span className="fishingDockDroneControlsLabel">Fishing Drone Count</span>
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

        <Collapsible id="fishing-upgrades" title="Available Upgrades" defaultExpanded={true}>
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
                        Time (hh:min)
                        <Tooltip
                          content={{
                            title: "Time (hh:min)",
                            sections: [
                              {
                                heading: "Meaning",
                                lines: [
                                  "Time to reach next level if you had zero of the cost fish.",
                                  "Assumes you only fish for that fish.",
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
                                heading: "Effect",
                                lines: [
                                  "Approximate % increase in overall fish per hour for +1 level.",
                                  "Shown only where the formula applies (e.g. Fish Multi, Tick Speed).",
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
                  const marginalPct = !isMaxed ? upgradeMarginalFishPct(def.id, stats, effectiveTickSec) : null;
                  return (
                    <tr key={def.id} className="fishingUpgradeRow">
                      <td className="fishingUpgradeTdName">
                        <img src={upgradeIconUrl(def.iconFile)} alt="" className="fishingUpgradeIcon" />
                        <span className="fishingUpgradeName">{def.name}</span>
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
                        <span
                          className="fishingUpgradeTimeToNext"
                          style={
                            !isMaxed &&
                            hoursToNext != null &&
                            timeHeatMax > timeHeatMin
                              ? (() => {
                                  const heatT =
                                    1 -
                                    (hoursToNext - timeHeatMin) / (timeHeatMax - timeHeatMin);
                                  const rateColor = heatmapColor(heatT);
                                  return {
                                    backgroundColor: rateColor,
                                    color: heatT > 0.5 ? "#0a0a0a" : "#fff",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                  };
                                })()
                              : undefined
                          }
                        >
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
                      <th className="fishingUpgradeThCost">Cost</th>
                      <th className="fishingUpgradeThTime">
                        Time (hh:min)
                        <Tooltip
                          content={{
                            title: "Time (hh:min)",
                            sections: [
                              {
                                heading: "Meaning",
                                lines: [
                                  "Time to reach next level if you had zero of the cost fish.",
                                  "Assumes you only fish for that fish.",
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
                                heading: "Effect",
                                lines: [
                                  "Approximate % increase in overall fish per hour for +1 level.",
                                  "Shown only where the formula applies (e.g. Fish Multi, Tick Speed).",
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
                  const marginalPct = !isMaxed ? upgradeMarginalFishPct(def.id, stats, effectiveTickSec) : null;
                  return (
                    <tr key={def.id} className="fishingUpgradeRow">
                      <td className="fishingUpgradeTdName">
                        <img src={upgradeIconUrl(def.iconFile)} alt="" className="fishingUpgradeIcon" />
                        <span className="fishingUpgradeName">{def.name}</span>
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
                        <span
                          className="fishingUpgradeTimeToNext"
                          style={
                            !isMaxed &&
                            hoursToNext != null &&
                            timeHeatMax > timeHeatMin
                              ? (() => {
                                  const heatT =
                                    1 -
                                    (hoursToNext - timeHeatMin) / (timeHeatMax - timeHeatMin);
                                  const rateColor = heatmapColor(heatT);
                                  return {
                                    backgroundColor: rateColor,
                                    color: heatT > 0.5 ? "#0a0a0a" : "#fff",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                  };
                                })()
                              : undefined
                          }
                        >
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

        <Collapsible id="fishing-enhancements" title="Available Enhancements" defaultExpanded={true}>
          <div className="fishingUpgradesPanel">
            <p className="fishingEnhancementsIntro">
              Enhancements cost <img src={GEM_ICON_URL} alt="Gems" className="fishingGemIcon" /> Gems. They do not count toward completion. See{" "}
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
                                heading: "Effect",
                                lines: [
                                  "Approximate % increase in overall fish per hour for +1 level.",
                                  "Shown only where the formula applies.",
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
                      const marginalPct = !isMaxed ? enhanceMarginalGainsPct(def.id, stats, effectiveTickSec) : null;
                      return (
                        <tr key={def.id} className="fishingUpgradeRow">
                          <td className="fishingUpgradeTdName">
                            <img src={enhanceIconUrl(def.iconFile)} alt="" className="fishingUpgradeIcon" />
                            <span className="fishingUpgradeName">{def.name}</span>
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
                                heading: "Effect",
                                lines: [
                                  "Approximate % increase in overall fish per hour for +1 level.",
                                  "Shown only where the formula applies.",
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
                      const marginalPct = !isMaxed ? enhanceMarginalGainsPct(def.id, stats, effectiveTickSec) : null;
                      return (
                        <tr key={def.id} className="fishingUpgradeRow">
                          <td className="fishingUpgradeTdName">
                            <img src={enhanceIconUrl(def.iconFile)} alt="" className="fishingUpgradeIcon" />
                            <span className="fishingUpgradeName">{def.name}</span>
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Collapsible>
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
