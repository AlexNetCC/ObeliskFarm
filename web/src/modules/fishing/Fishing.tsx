import { useEffect, useMemo, useState } from "react";
import "./fishing.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
import { loadJson, saveJson } from "../../lib/storage";
import {
  AQUARIUM,
  DOCKS,
  catchChancePercent,
  dockIconUrl,
  effectiveFishingTickSec,
  expectedCatchesPerRoll,
  fishIconUrl,
  FISHING_UPGRADES_T1,
  FISHING_UPGRADES_T2,
  getFishById,
  upgradeIconUrl,
  UPGRADE_COSTS,
  type DockId,
  type FishingUpgradeId,
} from "../../lib/fishing";

/** User-editable fishing stats (from game Stats / Fishing). */
type FishingStats = {
  /** Boat level (T1) 1–5. Gates which upgrades are shown. */
  boat_level: number;
  /** Tier 2 boat level 0–5. Gates T2 upgrades (0 = T2 not unlocked). */
  t2_boat_level: number;
  fishing_rod_power: number;
  fishing_drone_cap: number;
  drone_base_power: number;
  fish_income_multi: number;
  fishing_tick_reduction: number; // seconds, e.g. -40
  token_gain_multi: number; // 1 = 1x
  notice_fish_req: number; // 1 = 1x
  shiny_multiplier: number; // 5 = 5x
  super_shiny_multiplier: number; // 3 = 3x
};

type SavedState = {
  stats: Partial<FishingStats>;
  dronesPerDock?: Partial<Record<DockId, number>>;
  activeDockId?: DockId | null;
  showDisabledFishGrayed?: boolean;
  upgradeLevels?: Partial<Record<FishingUpgradeId, number>>;
};

const STORAGE_KEY = "obeliskfarm:web:fishing_save.json:v1";
const FISHING_EXTERNAL_KEY = "obeliskfarm:web:fishing_external.json";

/** Elixir 3× Fishing Tick Speed buff icon (same as Drone module). */
const ELIXIR_3X_FISHING_BUFF_ICON = "https://static.wikitide.net/shminerwiki/8/87/Triple_Fish_Tick_Chance.png";

const FISHING_ICON = "https://static.wikitide.net/shminerwiki/f/fb/Fishing_Button.png";

function defaultStats(): FishingStats {
  return {
    boat_level: 1,
    t2_boat_level: 0,
    fishing_rod_power: 1,
    fishing_drone_cap: 1,
    drone_base_power: 3,
    fish_income_multi: 1,
    fishing_tick_reduction: 0,
    token_gain_multi: 1,
    notice_fish_req: 1,
    shiny_multiplier: 5,
    super_shiny_multiplier: 3,
  };
}

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

const statsTooltip = {
  title: "Fishing stats",
  sections: [
    {
      heading: "Source",
      lines: ["Enter values from the game Stats menu, Fishing section (wiki: Stats#Fishing)."],
    },
    {
      heading: "Tick reduction",
      lines: ["Seconds reduced from base 60s per tick. Example: -40 means 20s per tick."],
    },
    {
      heading: "Elixir 3× Fishing Tick Speed",
      lines: ["Buff uptime is calculated in the Drone module and applied to fish/h. Open Drone to sync."],
    },
  ],
};

export function Fishing() {
  const initial = useMemo(() => {
    const base = defaultStats();
    const saved = loadJson<SavedState>(STORAGE_KEY);
    const merged: FishingStats = { ...base, ...(saved?.stats ?? {}) };
    const dronesPerDock: Record<DockId, number> = {} as Record<DockId, number>;
    DOCKS.forEach((d, i) => {
      dronesPerDock[d.id] = saved?.dronesPerDock?.[d.id] ?? (i === 0 ? Math.max(0, merged.fishing_drone_cap) : 0);
    });
    const showDisabledFishGrayed = saved?.showDisabledFishGrayed ?? false;
    const activeDockId: DockId = (saved?.activeDockId != null ? saved.activeDockId : "lake") as DockId;
    const upgradeLevels = saved?.upgradeLevels ?? {};
    return { stats: merged, dronesPerDock, showDisabledFishGrayed, activeDockId, upgradeLevels };
  }, []);

  const [stats, setStats] = useState<FishingStats>(initial.stats);
  const [dronesPerDock, setDronesPerDock] = useState<Record<DockId, number>>(initial.dronesPerDock);
  const [activeDockId, setActiveDockId] = useState<DockId>(initial.activeDockId);
  const [showDisabledFishGrayed, setShowDisabledFishGrayed] = useState<boolean>(initial.showDisabledFishGrayed);
  const [upgradeLevels, setUpgradeLevels] = useState<Partial<Record<FishingUpgradeId, number>>>(initial.upgradeLevels ?? {});

  useEffect(() => {
    const t = window.setTimeout(() => {
      saveJson(STORAGE_KEY, { stats, dronesPerDock, activeDockId, showDisabledFishGrayed, upgradeLevels });
    }, 250);
    return () => window.clearTimeout(t);
  }, [stats, dronesPerDock, activeDockId, showDisabledFishGrayed, upgradeLevels]);

  const totalDronesAssigned = useMemo(
    () => DOCKS.reduce((sum, d) => sum + (dronesPerDock[d.id] ?? 0), 0),
    [dronesPerDock],
  );
  const droneCap = stats.fishing_drone_cap;

  function setDockDrones(dockId: DockId, delta: number) {
    setDronesPerDock((prev) => {
      const cur = prev[dockId] ?? 0;
      const total = DOCKS.reduce((s, d) => s + (prev[d.id] ?? 0), 0);
      const others = total - cur;
      const maxThis = Math.max(0, droneCap - others);
      const next = cur + delta;
      const clamped = Math.max(0, Math.min(maxThis, next));
      return { ...prev, [dockId]: clamped };
    });
  }

  function setFishingUpgradeLevel(upgradeId: FishingUpgradeId, delta: number) {
    const costs = UPGRADE_COSTS[upgradeId];
    if (!costs?.length) return;
    const maxLvl = costs[costs.length - 1]!.level;
    setUpgradeLevels((prev) => {
      const cur = Math.max(0, Math.min(maxLvl, prev[upgradeId] ?? 0));
      const next = Math.max(0, Math.min(maxLvl, cur + delta));
      if (next === cur) return prev;
      return { ...prev, [upgradeId]: next };
    });
  }

  /** Power on a dock: rod only on the dock you're fishing at (active); else 0. Plus drones on this dock. */
  function powerForDock(dockId: DockId): number {
    const rod = activeDockId === dockId ? stats.fishing_rod_power : 0;
    const n = dronesPerDock[dockId] ?? 0;
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
    dronesPerDock,
    activeDockId,
  ]);

  /** Fish only where power > 0. Visible = show-grayed ? all (gray where !hasPower) : only hasPower. */
  const visibleGainsRows = useMemo(() => {
    if (showDisabledFishGrayed) return fishingGainsRows;
    return fishingGainsRows.filter((r) => r.hasPower);
  }, [fishingGainsRows, showDisabledFishGrayed]);

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

  const { heatMin, heatMax } = useMemo(() => {
    const enabled = visibleGainsRows.filter((r) => r.hasPower && r.fishPerHour > 0);
    if (enabled.length === 0) return { heatMin: 0, heatMax: 1 };
    const vals = enabled.map((r) => r.fishPerHour);
    return { heatMin: Math.min(...vals), heatMax: Math.max(...vals) };
  }, [visibleGainsRows]);

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
                  checked={showDisabledFishGrayed}
                  onChange={(e) => setShowDisabledFishGrayed(e.target.checked)}
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
            <NumberRow
              label="Boat level (T1)"
              iconUrl={upgradeIconUrl("Fishing_Boat_Upgrade.png")}
              value={stats.boat_level}
              onChange={(v) => setStats((s) => ({ ...s, boat_level: Math.round(v) }))}
              min={1}
              max={5}
            />
            <NumberRow
              label="T2 Boat level"
              iconUrl={upgradeIconUrl("Fishing_Boat_Upgrade_T2.png")}
              value={stats.t2_boat_level}
              onChange={(v) => setStats((s) => ({ ...s, t2_boat_level: Math.round(v) }))}
              min={0}
              max={5}
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
                <NumberRow
                  label="Fishing Rod Power"
                  iconUrl={upgradeIconUrl("Fishing_Rod_Power.png")}
                  value={stats.fishing_rod_power}
                  onChange={(v) => setStats((s) => ({ ...s, fishing_rod_power: Math.round(v) }))}
                  min={0}
                  max={999999}
                />
                <NumberRow
                  label="Fishing Drone Cap"
                  iconUrl={upgradeIconUrl("Fishing_Drone_Capacity.png")}
                  value={stats.fishing_drone_cap}
                  onChange={(v) => setStats((s) => ({ ...s, fishing_drone_cap: Math.round(v) }))}
                  min={0}
                  max={999}
                />
                <NumberRow
                  label="Drone Base Power"
                  iconUrl={upgradeIconUrl("Fishing_Drone_Base_Power.png")}
                  value={stats.drone_base_power}
                  onChange={(v) => setStats((s) => ({ ...s, drone_base_power: Math.round(v) }))}
                  min={0}
                  max={999}
                />
                <NumberRow
                  label="Fish Income Multiplier (×)"
                  iconUrl={upgradeIconUrl("Fish_Income_Multiplier.png")}
                  value={stats.fish_income_multi}
                  onChange={(v) => setStats((s) => ({ ...s, fish_income_multi: v }))}
                  min={0}
                  max={999999}
                  decimals={2}
                  inputMode="decimal"
                  suffix="×"
                />
                <NumberRow
                  label="Fishing Tick Reduction (s)"
                  iconUrl={upgradeIconUrl("Fishing_Tick_Reduction.png")}
                  value={stats.fishing_tick_reduction}
                  onChange={(v) => setStats((s) => ({ ...s, fishing_tick_reduction: v }))}
                  min={-60}
                  max={60}
                  decimals={1}
                  inputMode="decimal"
                  suffix="s"
                />
                <NumberRow
                  label="Token Gain Multiplier"
                  iconUrl={upgradeIconUrl("Fish_Token_Gain_Multiplier.png")}
                  value={stats.token_gain_multi}
                  onChange={(v) => setStats((s) => ({ ...s, token_gain_multi: v }))}
                  min={0}
                  max={999}
                  decimals={2}
                  inputMode="decimal"
                  suffix="×"
                />
                <NumberRow
                  label="Notice Fish Requirement"
                  value={stats.notice_fish_req}
                  onChange={(v) => setStats((s) => ({ ...s, notice_fish_req: v }))}
                  min={0}
                  max={999}
                  decimals={2}
                  inputMode="decimal"
                  suffix="×"
                />
                <NumberRow
                  label="Shiny Multiplier"
                  iconUrl={upgradeIconUrl("Shiny_Multiplier.png")}
                  value={stats.shiny_multiplier}
                  onChange={(v) => setStats((s) => ({ ...s, shiny_multiplier: v }))}
                  min={0}
                  max={999}
                  decimals={2}
                  inputMode="decimal"
                  suffix="×"
                />
                <NumberRow
                  label="Super Shiny Multiplier"
                  iconUrl={upgradeIconUrl("Super_Shiny_Multiplier.png")}
                  value={stats.super_shiny_multiplier}
                  onChange={(v) => setStats((s) => ({ ...s, super_shiny_multiplier: v }))}
                  min={0}
                  max={999}
                  decimals={2}
                  inputMode="decimal"
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
              const dockDrones = dronesPerDock[dock.id] ?? 0;
              const isActiveDock = activeDockId === dock.id;
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
                        onChange={() => setActiveDockId(dock.id)}
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
                <div className="fishingUpgradeHeaderRow">
                  <span className="fishingUpgradeHeaderSpacer" />
                  <span className="fishingUpgradeHeaderTime">
                    Time (hh:min)
                    <Tooltip
                      content={{
                        title: "Time (hh:min)",
                        lines: [
                          "If you had no fish of the required type, this is how long you would need to fish to reach the next upgrade level.",
                        ],
                      }}
                    />
                  </span>
                </div>
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
                  return (
                    <div key={def.id} className="fishingUpgradeRow">
                      <img src={upgradeIconUrl(def.iconFile)} alt="" className="fishingUpgradeIcon" />
                      <span className="fishingUpgradeName">{def.name}</span>
                      <div className="fishingUpgradeLevelWrap">
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
                      </div>
                      <div className="fishingUpgradeCostWrap">
                        {isMaxed ? (
                          <span className="fishingUpgradeMaxed">Maxed</span>
                        ) : nextCostEntry && fishDef ? (
                          <>
                            <span className="fishingUpgradeCostLabel">Cost:</span>{" "}
                            <span className="fishingUpgradeCostBox">
                              <img src={fishIconUrl(fishDef.iconFile)} alt="" className="fishingUpgradeCostFishIcon" />
                              <span className="mono">{nextCostEntry.amount.toLocaleString()}</span>
                            </span>
                          </>
                        ) : nextCostEntry ? (
                          <>
                            <span className="fishingUpgradeCostLabel">Cost:</span>{" "}
                            <span className="fishingUpgradeCostBox">
                              <span className="mono">{nextCostEntry.amount.toLocaleString()}</span>
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                      <span className="fishingUpgradeTimeToNext">
                        {!isMaxed && hoursToNext != null
                          ? formatHoursToHhMin(hoursToNext)
                          : isMaxed
                            ? ""
                            : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Collapsible>
            <Collapsible id="fishing-upgrades-t2" title="Tier 2" defaultExpanded={false} className="fishingUpgradesTier">
              <div className="fishingUpgradesList">
                <div className="fishingUpgradeHeaderRow">
                  <span className="fishingUpgradeHeaderSpacer" />
                  <span className="fishingUpgradeHeaderTime">
                    Time (hh:min)
                    <Tooltip
                      content={{
                        title: "Time (hh:min)",
                        lines: [
                          "If you had no fish of the required type, this is how long you would need to fish to reach the next upgrade level.",
                        ],
                      }}
                    />
                  </span>
                </div>
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
                  return (
                    <div key={def.id} className="fishingUpgradeRow">
                      <img src={upgradeIconUrl(def.iconFile)} alt="" className="fishingUpgradeIcon" />
                      <span className="fishingUpgradeName">{def.name}</span>
                      <div className="fishingUpgradeLevelWrap">
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
                      </div>
                      <div className="fishingUpgradeCostWrap">
                        {isMaxed ? (
                          <span className="fishingUpgradeMaxed">Maxed</span>
                        ) : nextCostEntry && fishDef ? (
                          <>
                            <span className="fishingUpgradeCostLabel">Cost:</span>{" "}
                            <span className="fishingUpgradeCostBox">
                              <img src={fishIconUrl(fishDef.iconFile)} alt="" className="fishingUpgradeCostFishIcon" />
                              <span className="mono">{nextCostEntry.amount.toLocaleString()}</span>
                            </span>
                          </>
                        ) : nextCostEntry ? (
                          <>
                            <span className="fishingUpgradeCostLabel">Cost:</span>{" "}
                            <span className="fishingUpgradeCostBox">
                              <span className="mono">{nextCostEntry.amount.toLocaleString()}</span>
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                      <span className="fishingUpgradeTimeToNext">
                        {!isMaxed && hoursToNext != null
                          ? formatHoursToHhMin(hoursToNext)
                          : isMaxed
                            ? ""
                            : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Collapsible>
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
