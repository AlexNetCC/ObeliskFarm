import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./gemev.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
import { assetUrl } from "../../lib/assets";
import { loadJson, saveJson } from "../../lib/storage";
import {
  calculateChargeMagnetGemsPerHour,
  calculateEvBreakdown,
  calculateFreebieChestsPerHour,
  calculateFreebieRelicChestsPerHour,
  calculateFreebiesPerHour,
  calculateGemBombGemsPerHour,
  calculateGiftEvBreakdown,
  calculateGiftEvPerGift,
  calculateGiftSushiPerHour,
  calculateGiftSushiPerHourBySource,
  calculateStatueSopranoGiftsPerHour,
  calculateStonksChestsPerHour,
  calculateStonksRelicChestsPerHour,
  calculateTotalEvPerHour,
  defaultGameParameters,
  getExpectedItemChestsPerGift,
  getExpectedRelicChestsPerGift,
  getEffectiveGameSpeedMultiplierForTime,
  getFounderDropIntervalMinutes,
  getFounderSupplyDropGemsEvPerHour,
  getFounderSupplyDropPerHour,
  getGameSpeedMultiplier,
  type GameParameters,
} from "../../lib/gemev/freebieEv";
import { runVarianceSim, type VarianceMetricStats, type VarianceOverviewInputs, type VarianceSimResult } from "../../lib/gemev/gemevVarianceSim";
import { ContribBarChart, ContribLegend } from "./ContribBarChart";
import { GiftEvChart } from "./GiftEvChart";

type SavedStateV1 = {
  params: Partial<GameParameters>;
  stonks_enabled: boolean;
  skill_shards_enabled: boolean;
  show_jackpot_refresh?: boolean;
  statue_soprano_level?: number;
  /** Banked freebies cap (for overnight). Written to gemev_external for Overnight Gains. */
  bankedFreebies?: number;
  /** Variance MC simulation: number of runs (1 run = 1 realtime hour). */
  varianceSimRuns?: number;
  /** Variance table: show P10–P90 percentile columns. */
  varianceShowPercentiles?: boolean;
};

const STORAGE_KEY = "obeliskfarm:web:gemev_save.json:v1";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";
const FISHING_EXTERNAL_KEY = "obeliskfarm:web:fishing_external.json";
function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
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

function fmt1(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

/** Like fmt1, but ≥1000: no decimals, thousands separator; <1000: one decimal. */
function fmt1OrIntOver1k(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toFixed(1);
}

function fmtPct(n: number, total: number): string {
  if (!Number.isFinite(n) || !Number.isFinite(total) || total <= 0) return "0.0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

/** Format decimal minutes as MM:SS min (e.g. 7.2 → "07:12 min"). */
function formatMinSecWithUnit(minDecimal: number): string {
  if (!Number.isFinite(minDecimal) || minDecimal < 0) return "00:00 min";
  let m = Math.floor(minDecimal);
  let s = Math.round((minDecimal - m) * 60);
  if (s >= 60) {
    s = 0;
    m += 1;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} min`;
}

/** Decimal minutes → "m:ss" for input display (e.g. 6.5 → "6:30"). */
function decimalMinutesToMinSecStr(minDecimal: number): string {
  if (!Number.isFinite(minDecimal) || minDecimal < 0) return "0:00";
  const m = Math.floor(minDecimal);
  const s = Math.round((minDecimal - m) * 60);
  return s < 60 ? `${m}:${String(s).padStart(2, "0")}` : `${m + 1}:00`;
}

/** Parse "m:ss" or "m" string to decimal minutes, or null if invalid. */
function parseMinSecStr(str: string): number | null {
  const t = str.trim().replaceAll(",", ".");
  if (!t) return null;
  const parts = t.split(/[:\s]+/);
  if (parts.length === 1) {
    const n = Number(parts[0]);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (parts.length >= 2) {
    const min = Number(parts[0]);
    const sec = Number(parts[1]);
    if (!Number.isFinite(min) || !Number.isFinite(sec) || min < 0 || sec < 0 || sec >= 60) return null;
    return min + sec / 60;
  }
  return null;
}

function Sprite(props: { path: string | null; alt: string; className?: string; label?: string }) {
  const { path, alt, className, label } = props;
  const [ok, setOk] = useState(true);
  if (!path || !ok) return <span className="iconPlaceholder" title={`Missing sprite: ${label ?? alt}`}>?</span>;
  return <img className={className ?? "icon"} src={assetUrl(path)} alt={alt} onError={() => setOk(false)} title={alt} />;
}

function Stepper(props: {
  label: React.ReactNode;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  inputMode?: "decimal" | "numeric";
  decimals?: number;
  disabled?: boolean;
  /** When false, no −/+ buttons, only the number input. */
  showButtons?: boolean;
  /** Rendered after the stepper (e.g. Tooltip ?) so it sits next to the value. */
  tooltipAfter?: React.ReactNode;
}) {
  const { label, value, onChange, step = 1, min = -Infinity, max = Infinity, inputMode = "decimal", decimals = 2, disabled = false, showButtons = true, tooltipAfter } = props;
  const isEditingRef = useRef(false);
  const formatDisplay = (v: number) => (Number.isFinite(v) ? v.toFixed(decimals) : "");
  const [raw, setRaw] = useState<string>(() => formatDisplay(value));

  useEffect(() => {
    // Keep input in sync with external value, but don't fight the user's typing.
    if (isEditingRef.current) return;
    setRaw(formatDisplay(value));
  }, [value, decimals]);

  function commit() {
    const n = parseNumber(raw);
    const next = clamp(n, min, max);
    const rounded = Number.isFinite(next) ? Number(next.toFixed(decimals)) : next;
    onChange(rounded);
    isEditingRef.current = false;
    setRaw(formatDisplay(rounded));
  }

  return (
    <div className="gemEvRow">
      <div className="label">
        <span>{label}</span>
      </div>
      <div className={`gemEvStepper ${!showButtons ? "gemEvStepperNoButtons" : ""}`}>
        {showButtons && (
          <button className="btn btnSecondary gemEvStepBtn" type="button" disabled={disabled} onClick={() => onChange(clamp(value - step, min, max))}>
            −
          </button>
        )}
        <input
          className="input gemEvInput"
          inputMode={inputMode}
          value={raw}
          disabled={disabled}
          onFocus={() => {
            isEditingRef.current = true;
          }}
          onChange={(e) => {
            isEditingRef.current = true;
            setRaw(e.target.value);
          }}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        {showButtons && (
          <button className="btn gemEvStepBtn" type="button" disabled={disabled} onClick={() => onChange(clamp(value + step, min, max))}>
            +
          </button>
        )}
      </div>
      {tooltipAfter}
    </div>
  );
}

function MinSecStepper(props: {
  label: React.ReactNode;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  stepMinutes?: number;
  disabled?: boolean;
}) {
  const { label, value, onChange, min = 0.1, max = 9999, stepMinutes = 0.5, disabled = false } = props;
  const isEditingRef = useRef(false);
  const [raw, setRaw] = useState<string>(() => decimalMinutesToMinSecStr(value));

  useEffect(() => {
    if (isEditingRef.current) return;
    setRaw(decimalMinutesToMinSecStr(value));
  }, [value]);

  function commit() {
    const parsed = parseMinSecStr(raw);
    if (parsed != null) {
      const next = clamp(parsed, min, max);
      onChange(next);
      setRaw(decimalMinutesToMinSecStr(next));
    } else {
      setRaw(decimalMinutesToMinSecStr(value));
    }
    isEditingRef.current = false;
  }

  return (
    <div className="gemEvRow">
      <div className="label">
        <span>{label}</span>
      </div>
      <div className="gemEvStepper">
        <button className="btn btnSecondary gemEvStepBtn" type="button" disabled={disabled} onClick={() => onChange(clamp(value - stepMinutes, min, max))}>
          −
        </button>
        <input
          className="input gemEvInput"
          inputMode="numeric"
          placeholder="min:sec"
          value={raw}
          disabled={disabled}
          onFocus={() => {
            isEditingRef.current = true;
          }}
          onChange={(e) => {
            isEditingRef.current = true;
            setRaw(e.target.value);
          }}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        <button className="btn gemEvStepBtn" type="button" disabled={disabled} onClick={() => onChange(clamp(value + stepMinutes, min, max))}>
          +
        </button>
      </div>
    </div>
  );
}

function CardToggles(props: { value: number; onChange: (lvl: number) => void; disabled?: boolean }) {
  const { value, onChange, disabled = false } = props;
  const cur = clampInt(value, 0, 3);
  const mk = (lvl: 1 | 2 | 3, label: string) => (
    <button
      type="button"
      className={`btn btnSecondary gemEvCardBtn ${cur === lvl ? "cardBtnActive" : ""}`}
      disabled={disabled}
      onClick={() => onChange(cur === lvl ? 0 : lvl)}
    >
      {label} {cur === lvl ? "✓" : ""}
    </button>
  );
  return (
    <div className="gemEvCardRow">
      <span className="small">Recharge:</span>
      {mk(1, "Card")}
      {mk(2, "Gild")}
      {mk(3, "Poly")}
    </div>
  );
}

export function GemEv() {
  const initial = useMemo(() => {
    const base = defaultGameParameters();
    const saved = loadJson<SavedStateV1>(STORAGE_KEY);
    const merged: GameParameters = { ...base, ...(saved?.params ?? {}) };
    const stonks_enabled = saved?.stonks_enabled ?? true;
    const skill_shards_enabled = saved?.skill_shards_enabled ?? true;
    const show_jackpot_refresh = saved?.show_jackpot_refresh ?? true;
    const statue_soprano_level = Math.max(0, Math.min(3, saved?.statue_soprano_level ?? 0));
    const bankedFreebies = Math.max(0, Math.min(999, saved?.bankedFreebies ?? 0));
    const varianceSimRuns = Math.max(1, Math.min(100000, Math.trunc(saved?.varianceSimRuns ?? 48)));
    const varianceShowPercentiles = saved?.varianceShowPercentiles ?? false;
    return { params: merged, stonks_enabled, skill_shards_enabled, show_jackpot_refresh, statue_soprano_level, bankedFreebies, varianceSimRuns, varianceShowPercentiles };
  }, []);

  const [params, setParams] = useState<GameParameters>(initial.params);
  const [stonksEnabled, setStonksEnabled] = useState<boolean>(initial.stonks_enabled);
  const [skillShardsEnabled, setSkillShardsEnabled] = useState<boolean>(initial.skill_shards_enabled);
  const [chartOpen, setChartOpen] = useState(false);
  const [giftChartOpen, setGiftChartOpen] = useState(false);
  const [giftsPerHourChartOpen, setGiftsPerHourChartOpen] = useState(false);
  const [founderSupplyDropChartOpen, setFounderSupplyDropChartOpen] = useState(false);
  const [varianceSimRuns, setVarianceSimRuns] = useState(initial.varianceSimRuns);
  const [varianceSimResult, setVarianceSimResult] = useState<VarianceSimResult | null>(null);
  const [varianceSimRunning, setVarianceSimRunning] = useState(false);
  const [varianceShowPercentiles, setVarianceShowPercentiles] = useState(initial.varianceShowPercentiles);
  const [showJackpotRefresh, setShowJackpotRefresh] = useState<boolean>(initial.show_jackpot_refresh);
  const [statueSopranoLevel, setStatueSopranoLevel] = useState<number>(initial.statue_soprano_level);
  const [bankedFreebies, setBankedFreebies] = useState<number>(initial.bankedFreebies);
  const [lootbugNetGemsPerHour, setLootbugNetGemsPerHour] = useState(0);
  useEffect(() => {
    const ext = loadJson<{ lootbugNetGemsPerHour?: number }>(GEMEV_EXTERNAL_KEY);
    setLootbugNetGemsPerHour(typeof ext?.lootbugNetGemsPerHour === "number" ? ext.lootbugNetGemsPerHour : 0);
  }, []);
  // autosave
  useEffect(() => {
    const t = window.setTimeout(() => {
      const payload: SavedStateV1 = { params, stonks_enabled: stonksEnabled, skill_shards_enabled: skillShardsEnabled, show_jackpot_refresh: showJackpotRefresh, statue_soprano_level: statueSopranoLevel, bankedFreebies, varianceSimRuns, varianceShowPercentiles };
      saveJson(STORAGE_KEY, payload);
    }, 250);
    return () => window.clearTimeout(t);
  }, [params, stonksEnabled, skillShardsEnabled, showJackpotRefresh, statueSopranoLevel, bankedFreebies, varianceSimRuns, varianceShowPercentiles]);

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") setChartOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const external = (() => {
    const ext = loadJson<{
      lootbugBomb10xMinPerHour?: number;
      lootbugSpawnsPerHour?: number;
      droneBomb10xMinPerHour?: number;
      lootbugNetGemsPerHour?: number;
      lootbugGainsGross?: number;
      lootbug10xGemEvPerHour?: number;
      lootbugChestGemEvPerHour?: number;
      lootbugTotalGemCostPerHour?: number;
      droneFuelGemsPerHour?: number;
      chaosTotemUptimePct?: number;
      chaosTotem100FromBombs?: boolean;
      chaosTotemImpact?: number;
      chargeMagnetImpact?: number;
      lootbugItemChestsPerHour?: number;
      itemsPerChest?: number;
      gemBombGemsPerHourFromBombs?: number;
      gemBomb10xImpactFromBombs?: number;
      chaosTotemImpactFromBombs?: number;
      valueOfOneChestForLootbug?: number;
      chaosTotemValuePerTotemForGift?: number;
      fishingUnlocked?: boolean;
      giftFishingTickValue?: number;
      giftFishPerHourDuring5xBuff?: number;
      fishPerSushiEvForGift?: number;
      /** Fishing tick reduction (from Fishing). Founder supply drop wiki table: 0.5× this per drop. */
      founder_fishing_tick_reduction?: number;
      chainBomberGoldenFloorBonusPct?: number;
      chainBomberBuffUptimeFraction?: number;
      w3_debuff_fish_pct_loss?: number;
      lootfrogsUnlocked?: boolean;
      lootfrogValuePerFrogspawn?: number;
      /** When true, Gift rare 1/25 Frogspawn (wiki Store#Gifts) is included. Same as Lootfrogs unlocked (Black Hole = Lootfrogs). */
      blackHoleUnlocked?: boolean;
    }>(GEMEV_EXTERNAL_KEY);
    const lootbug10x = typeof ext?.lootbugBomb10xMinPerHour === "number" ? ext.lootbugBomb10xMinPerHour : 0;
    const lootbugSpawnsPerHour = typeof ext?.lootbugSpawnsPerHour === "number" ? ext.lootbugSpawnsPerHour : 0;
    const drone10x = typeof ext?.droneBomb10xMinPerHour === "number" ? ext.droneBomb10xMinPerHour : 0;
    const lootbugNetGemsPerHour = typeof ext?.lootbugNetGemsPerHour === "number" ? ext.lootbugNetGemsPerHour : 0;
    const lootbugGainsGross = typeof ext?.lootbugGainsGross === "number" ? ext.lootbugGainsGross : undefined;
    const lootbug10xGemEvPerHour = typeof ext?.lootbug10xGemEvPerHour === "number" ? ext.lootbug10xGemEvPerHour : 0;
    const lootbugChestGemEvPerHour = typeof ext?.lootbugChestGemEvPerHour === "number" ? ext.lootbugChestGemEvPerHour : 0;
    const lootbugTotalGemCostPerHour = typeof ext?.lootbugTotalGemCostPerHour === "number" ? ext.lootbugTotalGemCostPerHour : undefined;
    const droneFuelGemsPerHour = typeof ext?.droneFuelGemsPerHour === "number" ? ext.droneFuelGemsPerHour : 0;
    const chaosTotemUptimePct = typeof ext?.chaosTotemUptimePct === "number" ? ext.chaosTotemUptimePct : undefined;
    const chaosTotem100FromBombs = Boolean(ext?.chaosTotem100FromBombs);
    const chargeMagnetImpact = typeof ext?.chargeMagnetImpact === "number" ? ext.chargeMagnetImpact : 0;
    const lootbugItemChestsPerHour = typeof ext?.lootbugItemChestsPerHour === "number" ? ext.lootbugItemChestsPerHour : 0;
    const itemsPerChest = typeof ext?.itemsPerChest === "number" ? ext.itemsPerChest : 1;
    const gemBombGemsPerHourFromBombs = typeof ext?.gemBombGemsPerHourFromBombs === "number" ? ext.gemBombGemsPerHourFromBombs : undefined;
    const gemBomb10xImpactFromBombs = typeof ext?.gemBomb10xImpactFromBombs === "number" ? ext.gemBomb10xImpactFromBombs : undefined;
    const chaosTotemImpactFromItems = typeof ext?.chaosTotemImpact === "number" ? ext.chaosTotemImpact : undefined;
    const chaosTotemImpactFromBombs = typeof ext?.chaosTotemImpactFromBombs === "number" ? ext.chaosTotemImpactFromBombs : undefined;
    const valueOfOneChestForLootbug = typeof ext?.valueOfOneChestForLootbug === "number" ? ext.valueOfOneChestForLootbug : undefined;
    const chaosTotemValuePerTotemForGift = typeof ext?.chaosTotemValuePerTotemForGift === "number" ? ext.chaosTotemValuePerTotemForGift : undefined;
    const fishingUnlocked = Boolean(ext?.fishingUnlocked);
    const giftFishingTickValue = typeof ext?.giftFishingTickValue === "number" ? ext.giftFishingTickValue : undefined;
    const giftFishPerHourDuring5xBuff = typeof ext?.giftFishPerHourDuring5xBuff === "number" ? ext.giftFishPerHourDuring5xBuff : undefined;
    const fishPerSushiEvForGift = typeof ext?.fishPerSushiEvForGift === "number" ? ext.fishPerSushiEvForGift : undefined;
    const founderFishingTickReduction = typeof ext?.founder_fishing_tick_reduction === "number" ? ext.founder_fishing_tick_reduction : undefined;
    const chainBomberGoldenFloorBonusPct = typeof ext?.chainBomberGoldenFloorBonusPct === "number" ? ext.chainBomberGoldenFloorBonusPct : undefined;
    const chainBomberBuffUptimeFraction = typeof ext?.chainBomberBuffUptimeFraction === "number" ? ext.chainBomberBuffUptimeFraction : undefined;
    const w3DebuffFishPctLoss = typeof ext?.w3_debuff_fish_pct_loss === "number" ? ext.w3_debuff_fish_pct_loss : undefined;
    const lootfrogsUnlocked = Boolean(ext?.lootfrogsUnlocked);
    const lootfrogValuePerFrogspawn = typeof ext?.lootfrogValuePerFrogspawn === "number" ? Math.max(0, ext.lootfrogValuePerFrogspawn) : 0;
    const blackHoleUnlocked = Boolean(ext?.blackHoleUnlocked);
    return {
      lootbug10x, lootbugSpawnsPerHour, drone10x, total10x: lootbug10x + drone10x, lootbugNetGemsPerHour, lootbugGainsGross, lootbug10xGemEvPerHour, lootbugChestGemEvPerHour, lootbugTotalGemCostPerHour, droneFuelGemsPerHour, chaosTotemUptimePct, chaosTotem100FromBombs, chaosTotemImpactFromItems, chargeMagnetImpact, lootbugItemChestsPerHour, itemsPerChest, gemBombGemsPerHourFromBombs, gemBomb10xImpactFromBombs, chaosTotemImpactFromBombs, valueOfOneChestForLootbug, chaosTotemValuePerTotemForGift, fishingUnlocked, giftFishingTickValue, giftFishPerHourDuring5xBuff, fishPerSushiEvForGift, founderFishingTickReduction, chainBomberGoldenFloorBonusPct, chainBomberBuffUptimeFraction, w3DebuffFishPctLoss, lootfrogsUnlocked, lootfrogValuePerFrogspawn, blackHoleUnlocked,
    };
  })();
  const external10x = { lootbug: external.lootbug10x, drone: external.drone10x, total: external.total10x };

  // Apply desktop semantics: stonks is a checkbox and uses fixed chance/bonus when enabled.
  // Also keep "fixed" desktop constants (they exist in params but are not editable in the UI).
  const effectiveParams = useMemo<GameParameters>(() => {
    const p: GameParameters = { ...params };

    // Stonks semantics (toggle sets base chance; multipliers from params)
    p.stonks_chance = stonksEnabled ? 0.01 : 0.0;
    p.stonks_bonus_gems = 200.0;
    p.stonks_multiplier = clamp(p.stonks_multiplier ?? 1.0, 0, 999);
    p.super_stonks_chance = clamp(p.super_stonks_chance ?? 0, 0, 1);
    p.super_stonks_bonus_gems = clamp(p.super_stonks_bonus_gems ?? 0, 0, 99999);
    p.super_stonks_multiplier = clamp(p.super_stonks_multiplier ?? 1.0, 0, 999);
    p.ultra_stonks_chance = clamp(p.ultra_stonks_chance ?? 0, 0, 1);
    p.ultra_stonks_bonus_gems = clamp(p.ultra_stonks_bonus_gems ?? 0, 0, 99999);
    p.ultra_stonks_multiplier = clamp(p.ultra_stonks_multiplier ?? 1.0, 0, 999);
    p.stonks_all_multiplier = clamp(p.stonks_all_multiplier ?? 1.0, 0, 999);

    // Skill shards: include in EV only when toggle on
    if (!skillShardsEnabled) p.skill_shard_chance = 0;

    // Statue of Soprano
    p.statue_soprano_level = Math.max(0, Math.min(3, statueSopranoLevel));

    // Founder supply drop: wiki table (Founder#Founder_Supply_Drop) when founder_worlds_unlocked set; else legacy
    p.founder_worlds_unlocked = typeof p.founder_worlds_unlocked === "number" && p.founder_worlds_unlocked >= 1 && p.founder_worlds_unlocked <= 4
      ? Math.trunc(p.founder_worlds_unlocked)
      : (p.founder_enabled ? 2 : undefined);
    p.founder_gems_base = 10.0;
    p.founder_gems_chance = 0.01;
    p.founder_speed_multiplier = 2.0;
    p.founder_speed_duration_minutes = 5.0;
    p.battery_bomb_charges_per_charge = 2.0;
    p.battery_bomb_cap_increase_chance = 0.001;
    p.founder_bomb_charges_per_drop = 2.0;
    // Founder bomb speed: fixed 10% chance, 2× for 10 seconds (not editable)
    p.founder_bomb_speed_chance = 0.10;
    p.founder_bomb_speed_multiplier = 2.0;
    p.founder_bomb_speed_duration_seconds = 10.0;
    // Jackpot: rolls always 5 (not editable)
    p.jackpot_rolls = 5;

    // Total bomb types: derived from checkboxes (10 + founder + veinmorph + megabomb, max 13)
    const includeFounder = p.include_founder_bomb_in_total ?? p.founder_enabled;
    const hasVeinmorph = "has_veinmorph_bomb" in p ? p.has_veinmorph_bomb : true;
    const hasMegabomb = "has_megabomb" in p ? p.has_megabomb : false;
    p.total_bomb_types = 10 + (includeFounder ? 1 : 0) + (hasVeinmorph ? 1 : 0) + (hasMegabomb ? 1 : 0);

    // Clamp common percent inputs
    p.skill_shard_chance = clamp(p.skill_shard_chance, 0, 1);
    p.jackpot_chance = clamp(p.jackpot_chance, 0, 1);
    p.instant_refresh_chance = clamp(p.instant_refresh_chance, 0, 1);
    p.freebie_relic_chance = clamp(p.freebie_relic_chance ?? 0, 0, 1);
    p.freebie_bonus_relic_chance = clamp(p.freebie_bonus_relic_chance ?? 0, 0, 1);
    p.free_bomb_chance = clamp(p.free_bomb_chance, 0, 0.99);
    p.gem_bomb_gem_chance = clamp(p.gem_bomb_gem_chance, 0, 1);
    p.cherry_bomb_triple_charge_chance = clamp(p.cherry_bomb_triple_charge_chance, 0, 1);
    p.d20_bomb_refill_chance = clamp(p.d20_bomb_refill_chance, 0, 1);

    // Clamp "levels"
    p.vip_lounge_level = clampInt(p.vip_lounge_level, 1, 12);
    p.d20_bomb_charges_distributed = clampInt(p.d20_bomb_charges_distributed, 0, 9999);
    p.obelisk_level = clampInt(p.obelisk_level, 0, 999);
    p.founder_enabled = Boolean(p.founder_enabled);

    // Recharge card levels
    p.gem_bomb_recharge_card_level = clampInt(p.gem_bomb_recharge_card_level, 0, 3);
    p.cherry_bomb_recharge_card_level = clampInt(p.cherry_bomb_recharge_card_level, 0, 3);
    p.battery_bomb_recharge_card_level = clampInt(p.battery_bomb_recharge_card_level, 0, 3);
    p.d20_bomb_recharge_card_level = clampInt(p.d20_bomb_recharge_card_level, 0, 3);
    p.founder_bomb_recharge_card_level = clampInt(p.founder_bomb_recharge_card_level, 0, 3);

    // Game speed multiplier (1 = use VIP T10–T12; >1 = override, e.g. 2.1 = 2.1×). Migrate old game_speed_pct.
    let mult = "game_speed_multiplier" in p ? p.game_speed_multiplier : 1.0;
    const gameSpeedPct = (p as { game_speed_pct?: number }).game_speed_pct;
    if (mult === 1.0 && typeof gameSpeedPct === "number" && gameSpeedPct > 0)
      mult = 1.0 + clampInt(gameSpeedPct, 0, 12) / 100.0;
    p.game_speed_multiplier = clamp(Number(mult), 1.0, 10.0);
    p.w3_floor_debuff = Boolean(p.w3_floor_debuff);

    p.bomb_recharge_10x_min_per_hour = external10x.total;
    // Chaos Totem: when 100% from Bombs, recharge params are in-game (already /2), so do not apply Chaos again (= 0).
    // Otherwise use Items uptime %, or Gem EV param / fallback so the chart bar is visible when 100% is unchecked.
    p.chaos_totem_uptime = external.chaosTotem100FromBombs
      ? 0
      : typeof external.chaosTotemUptimePct === "number"
        ? Math.max(0, Math.min(1, external.chaosTotemUptimePct / 100))
        : Math.max(0, Math.min(1, p.chaos_totem_uptime ?? 0.2));

    // Ensure positive time values
    p.freebie_timer_minutes = clamp(p.freebie_timer_minutes, 0.1, 10_000);
    p.freebie_timer_upgrade_level = Math.max(0, Math.min(999, Math.trunc(p.freebie_timer_upgrade_level ?? 0)));
    p.gem_bomb_recharge_seconds = clamp(p.gem_bomb_recharge_seconds, 0.1, 10_000);
    p.cherry_bomb_recharge_seconds = clamp(p.cherry_bomb_recharge_seconds, 0.1, 10_000);
    p.battery_bomb_recharge_seconds = clamp(p.battery_bomb_recharge_seconds, 0.1, 10_000);
    p.d20_bomb_recharge_seconds = clamp(p.d20_bomb_recharge_seconds, 0.1, 10_000);
    p.founder_bomb_interval_seconds = clamp(p.founder_bomb_interval_seconds, 0.1, 10_000);
    p.founder_bomb_speed_multiplier = clamp(p.founder_bomb_speed_multiplier, 0.1, 100);
    p.founder_bomb_speed_duration_seconds = clamp(p.founder_bomb_speed_duration_seconds, 0, 10_000);

    // Gift EV overrides (from Items, Drone, Bombs)
    p.gift_item_chest_value = external.valueOfOneChestForLootbug;
    p.gift_chaos_totem_100_from_bombs = external.chaosTotem100FromBombs;
    p.gift_chaos_totem_value_per_totem = external.chaosTotemValuePerTotemForGift;
    p.gift_fishing_unlocked = external.fishingUnlocked;
    p.gift_fishing_tick_value = external.giftFishingTickValue;
    p.gift_fish_per_hour_during_5x_buff = external.giftFishPerHourDuring5xBuff;
    if (typeof external.founderFishingTickReduction === "number") {
      p.founder_fishing_tick_reduction = external.founderFishingTickReduction;
    }
    p.gift_charge_magnet_value_per_magnet = !external.fishingUnlocked
      ? calculateChargeMagnetGemsPerHour(p, 20)
      : undefined;
    p.gift_drone_fuel_gems_per_fuel = 5;
    p.gift_sushi_fish_per_sushi = external.fishPerSushiEvForGift;

    p.chain_bomber_golden_floor_bonus_pct = external.chainBomberGoldenFloorBonusPct;
    p.chain_bomber_buff_uptime_fraction = external.chainBomberBuffUptimeFraction;
    p.lootfrogs_unlocked = external.lootfrogsUnlocked;
    // Black Hole unlocked = Lootfrogs unlocked (same unlock). Gift 1/25 Frogspawn when either is set.
    p.gift_black_hole_unlocked = external.blackHoleUnlocked ?? external.lootfrogsUnlocked;
    // Gift Frogspawn EV: use Drone value per frogspawn (1 frogspawn = capacity Lootfrogs, each with recursive EV) when available.
    p.gift_frogspawn_gem_value =
      typeof external.lootfrogValuePerFrogspawn === "number" && external.lootfrogValuePerFrogspawn > 0
        ? external.lootfrogValuePerFrogspawn
        : (p.gift_frogspawn_gem_value ?? 0);

    return p;
  }, [params, stonksEnabled, skillShardsEnabled, statueSopranoLevel, external10x.total, external.chaosTotemUptimePct, external.chaosTotem100FromBombs, external.valueOfOneChestForLootbug, external.chaosTotemValuePerTotemForGift, external.fishingUnlocked, external.giftFishingTickValue, external.giftFishPerHourDuring5xBuff, external.fishPerSushiEvForGift, external.founderFishingTickReduction, external.chainBomberGoldenFloorBonusPct, external.chainBomberBuffUptimeFraction, external.lootfrogsUnlocked, external.blackHoleUnlocked, external.lootfrogValuePerFrogspawn]);

  const ev = useMemo(() => calculateTotalEvPerHour(effectiveParams), [effectiveParams]);
  const freebiesPerHour = useMemo(() => calculateFreebiesPerHour(effectiveParams), [effectiveParams]);
  const freebieChestsPerHour = useMemo(() => calculateFreebieChestsPerHour(effectiveParams), [effectiveParams]);
  const breakdown = useMemo(() => calculateEvBreakdown(effectiveParams), [effectiveParams]);
  const giftEv = useMemo(() => calculateGiftEvPerGift(effectiveParams), [effectiveParams]);
  const giftBreakdown = useMemo(() => calculateGiftEvBreakdown(effectiveParams), [effectiveParams]);
  const statueSopranoGiftsPerHour = useMemo(() => calculateStatueSopranoGiftsPerHour(effectiveParams), [effectiveParams]);
  /** Gifts/h by source (for chart and total). */
  const giftsPerHourBySource = useMemo(
    () => calculateGiftSushiPerHourBySource(effectiveParams),
    [effectiveParams],
  );
  /** Total Gifts/h from Soprano (freebie) + Founder supply drop. Shown in Results when > 0. */
  const totalGiftsPerHour = giftsPerHourBySource.giftPerHourFreebie + giftsPerHourBySource.giftPerHourFounder;

  /** Item Chests per hour from Gifts. Written to external for Items module (Gift bar segment). */
  const giftItemChestsPerHour = useMemo(
    () => totalGiftsPerHour * getExpectedItemChestsPerGift(effectiveParams),
    [totalGiftsPerHour, effectiveParams],
  );

  /** Relic Chests per hour from Gifts (basic outcomes 10–15 and 3–5 per gift). Written to external for Items module. */
  const giftRelicChestsPerHour = useMemo(
    () => totalGiftsPerHour * getExpectedRelicChestsPerGift(effectiveParams),
    [totalGiftsPerHour, effectiveParams],
  );

  /** Relic Chests per hour from Stonks (base 10 per proc). Written to external for Items module. */
  const stonksRelicChestsPerHour = useMemo(() => {
    if (!stonksEnabled) return 0;
    return calculateStonksRelicChestsPerHour(effectiveParams);
  }, [stonksEnabled, effectiveParams]);

  /** Relic Chests per hour from Freebie (Construct): Relic Chance + Bonus Relic Chance per claim; jackpot = 10; refresh same as Item Chests. Written to external for Items module. */
  const freebieRelicChestsPerHour = useMemo(
    () => calculateFreebieRelicChestsPerHour(effectiveParams),
    [effectiveParams],
  );

  const gemBomb10xImpact = useMemo(() => {
    const without10x = calculateGemBombGemsPerHour({ ...effectiveParams, bomb_recharge_10x_min_per_hour: 0 });
    return Math.max(0, ev.gem_bomb_gems - without10x);
  }, [effectiveParams, ev.gem_bomb_gems]);

  const chaosTotemImpact = useMemo(() => {
    const withoutChaos = calculateGemBombGemsPerHour({ ...effectiveParams, chaos_totem_uptime: 0 });
    return Math.max(0, ev.gem_bomb_gems - withoutChaos);
  }, [effectiveParams, ev.gem_bomb_gems]);

  /** Bomb contribution: from Bombs module when present, else from own params. Use external when set so Bombs' calculation is shown; total updates after opening Bombs (e.g. after toggling W3). */
  const bombContribution = typeof external.gemBombGemsPerHourFromBombs === "number" ? external.gemBombGemsPerHourFromBombs : ev.gem_bomb_gems;
  const gemBomb10xImpactForChart = typeof external.gemBomb10xImpactFromBombs === "number" ? external.gemBomb10xImpactFromBombs : gemBomb10xImpact;
  /** Chaos Totem in chart: when 100% from Bombs use Bombs' impact; otherwise use Items (Tier 1) value so the chart shows the proportional Chaos Totem. */
  const chaosTotemImpactForChart = external.chaosTotem100FromBombs
    ? (typeof external.chaosTotemImpactFromBombs === "number" ? external.chaosTotemImpactFromBombs : chaosTotemImpact)
    : (typeof external.chaosTotemImpactFromItems === "number" ? external.chaosTotemImpactFromItems : chaosTotemImpact);

  /** When stonks is enabled: expected chests/h from stonks procs (base + super + ultra, all multis). */
  const stonksChestsPerHour = useMemo(() => {
    if (!stonksEnabled) return 0;
    return calculateStonksChestsPerHour(effectiveParams);
  }, [stonksEnabled, effectiveParams]);

  const founderSupplyDrop = useMemo(() => getFounderSupplyDropPerHour(effectiveParams), [effectiveParams]);

  /** Charge Magnet impact: from Items (external) when set, else computed here. Includes founder supply drop and Gift chests; founder share is moved to Founder bar. */
  const chargeMagnetImpactResolved = useMemo(() => {
    const ext = loadJson<{ chargeMagnetImpact?: number; lootbugItemChestsPerHour?: number; giftItemChestsPerHour?: number; founderSupplyDropItemChestsPerHour?: number; itemsPerChest?: number }>(GEMEV_EXTERNAL_KEY);
    if (typeof ext?.chargeMagnetImpact === "number") return ext.chargeMagnetImpact;
    const founderChests = ext?.founderSupplyDropItemChestsPerHour ?? founderSupplyDrop.itemChestsPerHour;
    const giftChests = ext?.giftItemChestsPerHour ?? giftItemChestsPerHour;
    const chestsPerHour = freebieChestsPerHour + stonksChestsPerHour + (ext?.lootbugItemChestsPerHour ?? 0) + giftChests + founderChests;
    const itemsPerChest = typeof ext?.itemsPerChest === "number" ? ext.itemsPerChest : 1;
    const chargeMagnetsPerHour = chestsPerHour * itemsPerChest * 0.026;
    const valuePerMagnet = calculateChargeMagnetGemsPerHour(effectiveParams, 20);
    return chargeMagnetsPerHour * valuePerMagnet;
  }, [effectiveParams, freebieChestsPerHour, stonksChestsPerHour, giftItemChestsPerHour, founderSupplyDrop.itemChestsPerHour]);

  /** Founder supply drop item chests → Charge Magnet + Chaos Totem value. Shown in Founder bar; excluded from Gem Bomb bar. */
  const { founderSupplyDropItemsGemValue, chargeMagnetForChart, chaosTotemForChart } = useMemo(() => {
    const ext = loadJson<{ lootbugItemChestsPerHour?: number; giftItemChestsPerHour?: number; founderSupplyDropItemChestsPerHour?: number; itemsPerChest?: number }>(GEMEV_EXTERNAL_KEY);
    const founderChests = ext?.founderSupplyDropItemChestsPerHour ?? founderSupplyDrop.itemChestsPerHour;
    const giftChests = ext?.giftItemChestsPerHour ?? giftItemChestsPerHour;
    const totalChests = freebieChestsPerHour + stonksChestsPerHour + (ext?.lootbugItemChestsPerHour ?? 0) + giftChests + founderChests;
    const itemsPerChest = typeof ext?.itemsPerChest === "number" ? ext.itemsPerChest : 1;
    const valuePerMagnet = calculateChargeMagnetGemsPerHour(effectiveParams, 20);
    const founderChargeMagnetPart = founderChests * itemsPerChest * 0.026 * valuePerMagnet;
    const founderChaosTotemPart = totalChests > 0 ? (founderChests / totalChests) * chaosTotemImpactForChart : 0;
    const itemsValue = founderChargeMagnetPart + founderChaosTotemPart;
    return {
      founderSupplyDropItemsGemValue: itemsValue,
      chargeMagnetForChart: Math.max(0, chargeMagnetImpactResolved - founderChargeMagnetPart),
      chaosTotemForChart: Math.max(0, chaosTotemImpactForChart - founderChaosTotemPart),
    };
  }, [effectiveParams, freebieChestsPerHour, stonksChestsPerHour, giftItemChestsPerHour, founderSupplyDrop.itemChestsPerHour, chargeMagnetImpactResolved, chaosTotemImpactForChart]);

  /** Founder supply drop: Frogspawn (1/500 × 5 per drop) → capacity Lootfrogs each with recursive EV. Value from Drone (lootfrogValuePerFrogspawn). */
  const founderSupplyDropFrogspawnGemValue = founderSupplyDrop.frogspawnPerHour * (external.lootfrogValuePerFrogspawn ?? 0);

  /** Rows for Founder Supply Drop breakdown chart (per hour). Wiki Founder#Founder_Supply_Drop + Jackpots. */
  const founderSupplyDropChartRows = useMemo(() => {
    const sd = founderSupplyDrop;
    const gemsEv = getFounderSupplyDropGemsEvPerHour(effectiveParams);
    const founderDropsPerHour = effectiveParams.founder_enabled
      ? 60 / getFounderDropIntervalMinutes(effectiveParams)
      : 0;
    const sushiFromJackpotPerHour =
      effectiveParams.founder_enabled && effectiveParams.gift_fishing_unlocked
        ? founderDropsPerHour * (1 / 750) * 100
        : 0;
    return [
      { key: "gems", label: "Gems (EV)", value: gemsEv, color: "#ffc107" },
      { key: "itemChests", label: "Item Chests", value: sd.itemChestsPerHour, color: "#ffa726" },
      { key: "relicChests", label: "Relic Chests", value: sd.relicChestsPerHour, color: "#ab47bc" },
      { key: "cherry", label: "Cherry", value: sd.cherryChargesPerHour, color: "#ef5350" },
      { key: "fuel", label: "Fuel", value: sd.fuelPerHour, color: "#5c6bc0" },
      { key: "fishingTicks", label: "Fishing Ticks", value: sd.fishingTicksPerHour, color: "#42a5f5" },
      { key: "archTicks", label: "Arch Ticks", value: sd.archaeologyTicksPerHour, color: "#66bb6a" },
      { key: "star2x", label: "Star 2× (min/h)", value: sd.starSpawn2xMinPerHour, color: "#ffeb3b" },
      { key: "starAutoCatch", label: "Star Auto-Catch 100% (min/h)", value: sd.starAutoCatch100MinPerHour, color: "#fdd835" },
      { key: "frogspawn", label: "Frogspawn (1/500 jackpot)", value: sd.frogspawnPerHour, color: "#2e7d32" },
      { key: "sushiJackpot", label: "Sushi (1/750 jackpot)", value: sushiFromJackpotPerHour, color: "#26a69a" },
    ];
  }, [founderSupplyDrop, effectiveParams]);

  useEffect(() => {
    const ext = loadJson<{
      lootbugBomb10xMinPerHour?: number;
      droneBomb10xMinPerHour?: number;
      lootbugNetGemsPerHour?: number;
      gemBomb10xImpact?: number;
      total10xMinPerHour?: number;
      freebiesPerHour?: number;
      freebieChestsPerHour?: number;
      founderSupplyDropItemChestsPerHour?: number;
      founderSupplyDropRelicChestsPerHour?: number;
      founderSupplyDropFrogspawnPerHour?: number;
      chaosTotemImpact?: number;
      stonksChestsPerHour?: number;
      game_speed_multiplier?: number;
      giftItemChestsPerHour?: number;
      giftRelicChestsPerHour?: number;
      freebieRelicChestsPerHour?: number;
      stonksRelicChestsPerHour?: number;
      w3_floor_debuff?: boolean;
    }>(GEMEV_EXTERNAL_KEY) ?? {};
    if (typeof external.gemBombGemsPerHourFromBombs !== "number") {
      ext.gemBomb10xImpact = gemBomb10xImpact;
      ext.chaosTotemImpact = chaosTotemImpact;
    } else if (!external.chaosTotem100FromBombs) {
      // When 100% is unchecked, persist our computed Chaos Totem impact so the chart bar is visible.
      ext.chaosTotemImpact = chaosTotemImpact;
    }
    ext.total10xMinPerHour = (ext.lootbugBomb10xMinPerHour ?? 0) + (ext.droneBomb10xMinPerHour ?? 0);
    ext.freebiesPerHour = freebiesPerHour;
    ext.freebieChestsPerHour = freebieChestsPerHour;
    ext.stonksChestsPerHour = stonksChestsPerHour;
    ext.founderSupplyDropItemChestsPerHour = founderSupplyDrop.itemChestsPerHour;
    ext.founderSupplyDropRelicChestsPerHour = founderSupplyDrop.relicChestsPerHour;
    ext.founderSupplyDropFrogspawnPerHour = founderSupplyDrop.frogspawnPerHour;
    ext.game_speed_multiplier = getGameSpeedMultiplier(effectiveParams);
    (ext as Record<string, unknown>).w3_floor_debuff = Boolean(effectiveParams.w3_floor_debuff);
    ext.giftItemChestsPerHour = giftItemChestsPerHour;
    ext.giftRelicChestsPerHour = giftRelicChestsPerHour;
    ext.freebieRelicChestsPerHour = freebieRelicChestsPerHour;
    ext.stonksRelicChestsPerHour = stonksRelicChestsPerHour;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [effectiveParams, gemBomb10xImpact, freebiesPerHour, freebieChestsPerHour, chaosTotemImpact, stonksChestsPerHour, founderSupplyDrop.itemChestsPerHour, founderSupplyDrop.relicChestsPerHour, founderSupplyDrop.frogspawnPerHour, giftItemChestsPerHour, giftRelicChestsPerHour, freebieRelicChestsPerHour, stonksRelicChestsPerHour, external.gemBombGemsPerHourFromBombs, external.chaosTotem100FromBombs]);

  const STARGAZING_EXTERNAL_KEY = "obeliskfarm:web:stargazing_external.json";
  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(STARGAZING_EXTERNAL_KEY) ?? {};
    ext.founderSupplyDrop2xStarMinPerHour = founderSupplyDrop.starSpawn2xMinPerHour;
    ext.founderSupplyDropAutoCatch100MinPerHour = founderSupplyDrop.starAutoCatch100MinPerHour;
    saveJson(STARGAZING_EXTERNAL_KEY, ext);
  }, [founderSupplyDrop.starSpawn2xMinPerHour, founderSupplyDrop.starAutoCatch100MinPerHour]);

  useEffect(() => {
    const gemevExt = loadJson<{ fishingUnlocked?: boolean }>(GEMEV_EXTERNAL_KEY);
    const fishingUnlocked = gemevExt?.fishingUnlocked !== false;
    const raw = calculateGiftSushiPerHour(effectiveParams);
    const giftSushiPerHour = fishingUnlocked ? raw : 0;
    const ext = loadJson<Record<string, unknown>>(FISHING_EXTERNAL_KEY) ?? {};
    ext.giftSushiPerHour = giftSushiPerHour;
    saveJson(FISHING_EXTERNAL_KEY, ext);
  }, [effectiveParams]);

  const lootbugNetContribution = typeof external.lootbugGainsGross === "number"
    ? external.lootbugGainsGross - (external.lootbugTotalGemCostPerHour ?? 0)
    : (external.lootbugNetGemsPerHour ?? 0);
  const totalWithLootbugAndDroneFuel = (ev.total - ev.gem_bomb_gems) + bombContribution + lootbugNetContribution - external.droneFuelGemsPerHour + chargeMagnetImpactResolved;

  /** Inputs for Variance MC so the sim can compute total (Overview chart). */
  const varianceOverviewInputs = useMemo((): VarianceOverviewInputs => {
    const totalChests = freebieChestsPerHour + stonksChestsPerHour + (external.lootbugItemChestsPerHour ?? 0) + giftItemChestsPerHour + founderSupplyDrop.itemChestsPerHour;
    return {
      expectedTotalChestsPerHour: totalChests,
      chargeMagnetImpact: chargeMagnetImpactResolved,
      expectedGemBombPerHour: bombContribution,
      expected10xMinPerHour: external.total10x ?? 0,
      gemBomb10xImpact: gemBomb10xImpactForChart,
      droneFuelCostPerHour: external.droneFuelGemsPerHour ?? 0,
      drone10xMinPerHour: external.drone10x ?? 0,
      expectedItemChestsPerGift: getExpectedItemChestsPerGift(effectiveParams),
      lootbugItemChestsPerHour: external.lootbugItemChestsPerHour ?? 0,
      itemsPerChest: external.itemsPerChest ?? 1,
    };
  }, [freebieChestsPerHour, stonksChestsPerHour, external.lootbugItemChestsPerHour, giftItemChestsPerHour, founderSupplyDrop.itemChestsPerHour, chargeMagnetImpactResolved, bombContribution, external.total10x, gemBomb10xImpactForChart, external.droneFuelGemsPerHour, external.drone10x, effectiveParams, external.itemsPerChest]);

  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(GEMEV_EXTERNAL_KEY) ?? {};
    ext.totalGemsPerHour = totalWithLootbugAndDroneFuel;
    ext.bankedFreebies = bankedFreebies;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [totalWithLootbugAndDroneFuel, bankedFreebies]);

  const evForChart = useMemo(() => ({
    ...ev,
    gem_bomb_gems: bombContribution,
    total: (ev.total - ev.gem_bomb_gems) + bombContribution,
  }), [ev, bombContribution]);

  const breakdownForChart = useMemo(() => ({
    ...breakdown,
    gem_bomb_gems: { base: bombContribution, jackpot: 0.0, refresh_base: 0.0, refresh_jackpot: 0.0 },
  }), [breakdown, bombContribution]);

  const marginal = useMemo(() => {
    const p2: GameParameters = { ...effectiveParams, freebie_gems_base: effectiveParams.freebie_gems_base + 1.0 };
    const ev2 = calculateTotalEvPerHour(p2);
    return ev2.total - ev.total;
  }, [effectiveParams, ev.total]);

  const freebieInfo = useMemo(
    () => ({
      title: "FREEBIE Parameters",
      sections: [
        { heading: "Base", lines: ["Freebie Gems (Base), Freebie Timer."] },
        {
          heading: "Special drops",
          lines: [
            "Skill Shards: chance only (value is fixed).",
            "Stonks: collapsible section. Stonks (1% chance, 200 Gems base) + multiplier. Super Stonks only when Stonks hit; Ultra only when Super hit. Each tier has its own multiplier; Stonks all multiplier applies to the sum.",
          ],
        },
        { heading: "Multipliers", lines: ["Jackpot: chance for additional rolls.", "Refresh: chance for instant refresh (geometric series)."] },
      ],
    }),
    [],
  );

  const founderInfo = useMemo(
    () => ({
      title: "Founder / VIP",
      sections: [
        {
          heading: "VIP Lounge (Tiers 1–12)",
          lines: [
            "Interval: 60 − 2×(Level−1) min. Double: 12% at T2, +6% per tier. Triple: 16% at T7, +8% per tier.",
            "T10: Game Speed +10%, +1% per tier. Multiplicative with bomb recharge times and freebie cooldown (not supply drop).",
            "T11: Golden Supply Drop 10%, +2% per tier. 5× normal drops; rare rewards (Obelisk bonus, Gifts, etc.) unchanged.",
            "T12: Gem Bomb Gem Chance +0.5%.",
          ],
        },
        {
          heading: "Supply drop (per crate)",
          lines: [
            "Amounts scale with Worlds Unlocked (W). Default W=2. Gems 10×W, Item 2×W, Relic 1×W, Cherry max(50, 5×W×Level), Fuel 1×W.",
            "Star 2×: 4 min×W. Star Auto-Catch 100%: 8 min×W (when Auto-Catch <100%). Arch: (3×stage)+50. Fishing: 0.5×tick reduction.",
            "Golden crate (T11): 10% at T11, 12% at T12. Golden gives 5× normal crate contents.",
          ],
        },
        {
          heading: "Jackpots (per crate)",
          lines: [
            "1/100: Level×10+50 Gems. 1/500: Relic Level×3+10, or Frogspawn 5 (Lootfrogs). 1/750: 100 Sushi (Fishing). 1/1234: 10 Gifts.",
            "1/2000: 1 Mythic Chest. 1/69696: 1 Divine, 100 Relic, 1000 Gems.",
          ],
        },
        {
          heading: "Founder Speed",
          lines: ["2× for 5 minutes. Time saved increases freebie claims per hour; supply drop interval is not affected by game speed."],
        },
      ],
    }),
    [],
  );

  return (
    <div className="container">
      <div className="gemEvGrid">
        <div className="header">
          <div>
            <h1 className="title">Gem EV Calculator</h1>
          </div>
        </div>

        <div className="panel panelResults">
            <div className="panelHeader">
              <h2 className="panelTitle">Results</h2>
            </div>

            <div className="kv">
              <kbd style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Sprite path="sprites/common/gem.png" alt="" className="iconSmall" />
                TOTAL
                <button className="btn gemEvOverviewChartBtnSmall" type="button" onClick={() => setChartOpen(true)} title="Overview chart">
                  Overview chart
                </button>
              </kbd>
              <div className="mono" style={{ fontWeight: 900, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {fmt1OrIntOver1k(totalWithLootbugAndDroneFuel)} Gem-Equivalent/h
                <Tooltip
                  content={{
                    title: "What the total assumes",
                    sections: [
                      {
                        heading: "Elixir Drone (Drone module)",
                        lines: [
                          "When Elixir is ON and fueled, it adds 10× Bomb Recharge buff min/h to the bomb cycle.",
                          "That uptime speeds up bomb recharge → more Gem Bomb clicks → more gems. Open Drone to sync; if Elixir is OFF or not fueled, the calc uses 0 min/h from Drone.",
                        ],
                      },
                      {
                        heading: "Lootbug",
                        lines: [
                          "10× Bomb Recharge min/h is only counted when you buy that buff with gems in Lootbug (Gem Buffs).",
                          "Lootbug spawn rate and weights set how often you get the buff; duration is 2 min (gem). Open Lootbug and enable \"10x Bomb Recharge\" in Gem Buffs so the calc includes it.",
                        ],
                      },
                      {
                        heading: "Chaos Totem",
                        lines: [
                          "When active: 2× Bomb Recharge Rate. Uptime comes from Items (Tier 1 Chaos Totems/h) or from Bombs (\"Chaos Totem 100% from Bombs\" = recharge times already reflect 2×, so no extra % here).",
                          "If you do not have near-100% Chaos uptime in-game, the total can overstate gem gain from bombs.",
                        ],
                      },
                      {
                        heading: "If your actual gems are lower",
                        lines: [
                          "Check: claim every freebie on cooldown? Game speed and bomb recharge times match your Stats? Elixir ON + fueled, Lootbug 10× bought, Chaos Totem uptime correct.",
                        ],
                      },
                    ],
                  }}
                  label="?"
                />
              </div>
              <kbd style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <img src="https://static.wikitide.net/shminerwiki/2/24/Gift.png" alt="" width={14} height={14} style={{ display: "block" }} />
                Gift-EV
                <button
                  type="button"
                  className="giftEvChartIconBtn"
                  onClick={() => setGiftChartOpen(true)}
                  title="Gift EV breakdown chart"
                  aria-label="Open Gift EV breakdown chart"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="14" width="4" height="6" rx="1" />
                    <rect x="10" y="10" width="4" height="10" rx="1" />
                    <rect x="17" y="6" width="4" height="14" rx="1" />
                  </svg>
                </button>
              </kbd>
              <div className="mono" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 900 }}>{fmt1OrIntOver1k(giftEv)} Gems per Gift</span>
              </div>
              {totalGiftsPerHour > 0 ? (
                <>
                  <kbd style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <img src="https://static.wikitide.net/shminerwiki/2/24/Gift.png" alt="" width={14} height={14} style={{ display: "block" }} />
                    Gifts/h
                    <button
                      type="button"
                      className="giftEvChartIconBtn"
                      onClick={() => setGiftsPerHourChartOpen(true)}
                      title="Gifts per hour by source"
                      aria-label="Open Gifts/h by source chart"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="3" y="14" width="4" height="6" rx="1" />
                        <rect x="10" y="10" width="4" height="10" rx="1" />
                        <rect x="17" y="6" width="4" height="14" rx="1" />
                      </svg>
                    </button>
                  </kbd>
                  <div className="mono" style={{ fontWeight: 700 }}>
                    {Number.isFinite(totalGiftsPerHour) ? totalGiftsPerHour.toFixed(2) : "—"}
                  </div>
                </>
              ) : null}
            </div>

            <Collapsible
              id="gemev-variance"
              title={
                <>
                  <span className="gemEvChartArrow gemEvChartArrowLeft" aria-hidden>←</span>
                  {" "}
                  Variance (MC Simulation)
                </>
              }
              defaultExpanded={false}
              className="gemEvSection gemEvVarianceSection"
              headerRight={
                <Tooltip
                  content={{
                    title: "Variance (MC simulation)",
                    sections: [
                      {
                        heading: "What it simulates",
                        lines: [
                          "Full game in one hour: freebies (jackpot, refresh, stonks, gifts), Founder supply drop (gems, jackpots: 1/100 gems, 1/500 relic/frogspawn, 1/750 sushi, 1/1234 gifts, 1/2000 mythic, 1/69696 mega), Lootbug, gifts opened (Soprano + Founder), Item chests → Charge Magnet, Gem Bomb gems, Drone fuel cost.",
                          "Same components as the Overview chart. Open Lootbug, Drone, Items, and Bombs so rates are synced.",
                        ],
                      },
                      {
                        heading: "Results",
                        lines: [
                          "Percentiles per simulated hour. Total = freebie + founder + gift + lootfrog + lootbug net + charge magnet + gem bomb − drone fuel.",
                        ],
                      },
                    ],
                  }}
                  label="?"
                />
              }
            >
              <div className="gemEvSectionBody" style={{ paddingTop: 4, paddingBottom: 8 }}>
                <p className="small" style={{ margin: "0 0 6px", color: "rgba(15,23,42,0.7)" }}>
                  1 Run = 1 Realtime Hour
                </p>
                <div className="gemEvRow" style={{ flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <label className="small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>Runs</span>
                    <input
                      type="number"
                      className="input gemEvInput gemEvInputNoSpinner"
                      inputMode="numeric"
                      min={1}
                      max={100000}
                      step={1}
                      value={varianceSimRuns}
                      onChange={(e) => {
                        const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        if (Number.isFinite(v)) setVarianceSimRuns(Math.max(1, Math.min(100000, v)));
                      }}
                      style={{ width: "6em" }}
                      aria-label="Number of simulation runs"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btnSecondary"
                    disabled={varianceSimRunning}
                    onClick={() => {
                      setVarianceSimRunning(true);
                      setVarianceSimResult(null);
                      requestAnimationFrame(() => {
                        const result = runVarianceSim(
                          effectiveParams,
                          varianceSimRuns,
                          giftEv,
                          external.lootfrogValuePerFrogspawn ?? 0,
                          {
                            lootbug10xMinPerHour: external.lootbug10x ?? 0,
                            lootbugSpawnsPerHour: external.lootbugSpawnsPerHour ?? 0,
                            lootbugNetGemsPerHour: external.lootbugNetGemsPerHour ?? 0,
                          },
                          varianceOverviewInputs
                        );
                        setVarianceSimResult(result);
                        setVarianceSimRunning(false);
                      });
                    }}
                  >
                    {varianceSimRunning ? "Running…" : "Run simulation"}
                  </button>
                  <label className="small" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={varianceShowPercentiles}
                      onChange={(e) => setVarianceShowPercentiles(e.target.checked)}
                      aria-label="Show percentiles (P10–P90) in table"
                    />
                    Show percentiles
                  </label>
                </div>
                {varianceSimResult ? (
                  <>
                  {(() => {
                    const cv = (s: VarianceMetricStats) => (s.mean !== 0 && Number.isFinite(s.mean) ? s.sd / s.mean : 0);
                    const showSuperStonks = (params.super_stonks_chance ?? 0) > 0;
                    const showUltraStonks = (params.ultra_stonks_chance ?? 0) > 0;
                    const metrics: Array<{ key: string; s: VarianceMetricStats }> = [
                      { key: "freebieBaseGems", s: varianceSimResult.freebieBaseGems },
                      { key: "stonksGemsNormal", s: varianceSimResult.stonksGemsNormal },
                      ...(showSuperStonks ? [{ key: "stonksGemsSuper" as const, s: varianceSimResult.stonksGemsSuper }] : []),
                      ...(showUltraStonks ? [{ key: "stonksGemsUltra" as const, s: varianceSimResult.stonksGemsUltra }] : []),
                      { key: "giftsCount", s: varianceSimResult.giftsCount },
                      { key: "giftGems", s: varianceSimResult.giftGems },
                      { key: "giftSushi", s: varianceSimResult.giftSushi },
                      { key: "lootfrogGems", s: varianceSimResult.lootfrogGems },
                      { key: "lootbugNetGems", s: varianceSimResult.lootbugNetGems },
                      { key: "founderGems", s: varianceSimResult.founderGems },
                      { key: "chargeMagnetGems", s: varianceSimResult.chargeMagnetGems },
                      { key: "gemBombGems", s: varianceSimResult.gemBombGems },
                      { key: "droneFuelCost", s: varianceSimResult.droneFuelCost },
                      { key: "totalGems", s: varianceSimResult.totalGems },
                    ];
                    const cvs = metrics.map((m) => cv(m.s));
                    const maxCV = Math.max(0, ...cvs.filter((n) => Number.isFinite(n)));
                    const cvToBg = (cvVal: number) => {
                      const t = maxCV > 0 ? Math.min(1, Math.max(0, cvVal / maxCV)) : 0;
                      const r = Math.round(255 * (1 - t) + 220 * t);
                      const g = Math.round(255 * (1 - t) + 38 * t);
                      const b = Math.round(255 * (1 - t) + 38 * t);
                      return `rgb(${r},${g},${b})`;
                    };
                    const formatCvPct = (cvVal: number, mean: number) => {
                      if (mean === 0) return "—";
                      const absCv = Math.abs(cvVal);
                      return absCv >= 1 ? ">100% (unreliable!)" : `${Math.round(absCv * 100).toFixed(0)}%`;
                    };
                    const baseIdx = 2 + (showSuperStonks ? 1 : 0) + (showUltraStonks ? 1 : 0);
                    return (
                    <>
                    <p className="small gemEvVarianceMeanHint">
                      <span className="gemEvVarianceMeanHintIcon" role="img" aria-label="Hint">💡</span>
                      <strong>Mean</strong> = average hourly gain (per simulated hour).
                    </p>
                    <div className="gemEvVarianceTableWrap gemEvCompactBlock">
                      <table className="gemEvVarianceTable">
                        <thead>
                          <tr>
                            <th></th>
                            <th className="mono gemEvVarianceColMeanSd">Mean</th>
                            <th className="mono gemEvVarianceColMeanSd">SD</th>
                            <th className="mono gemEvVarianceColCV">
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                CV%
                                <Tooltip
                                  content={{
                                    title: "CV%",
                                    lines: [
                                      "Coefficient of variation (SD ÷ mean) as %. Measures relative variability (spread relative to the average).",
                                      "Higher CV% = more variable from run to run. >100% (unreliable!) = very high variability. Color: white = low, red = highest in this table.",
                                    ],
                                  }}
                                  label="?"
                                />
                              </span>
                            </th>
                            {varianceShowPercentiles && (
                              <>
                                <th className="mono">P10</th>
                                <th className="mono">P25</th>
                                <th className="mono">P50</th>
                                <th className="mono">P75</th>
                                <th className="mono">P90</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                Freebie (base + skill shards)
                                <Tooltip
                                  content={{
                                    title: "Freebie base gems",
                                    lines: [
                                      "Base gems: every roll (1 per claim, or more on jackpot) adds the base gem value.",
                                      ...(skillShardsEnabled ? ["Skill shards: when the roll hits, its gem value is added (Obelisk/Lucky applied)."] : []),
                                      "Excludes Stonks (normal/super/ultra) bonus gems.",
                                    ],
                                  }}
                                  label="?"
                                />
                              </span>
                            </td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.freebieBaseGems.mean)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.freebieBaseGems.sd)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[0]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[0], varianceSimResult.freebieBaseGems.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.freebieBaseGems.p10)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.freebieBaseGems.p25)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.freebieBaseGems.p50)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.freebieBaseGems.p75)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.freebieBaseGems.p90)}</td>
                              </>
                            )}
                          </tr>
                          <tr>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                Stonks (normal)
                                <Tooltip content={{ title: "Stonks (normal)", lines: ["Gems from normal Stonks procs (first roll per claim). Excludes Super and Ultra."] }} label="?" />
                              </span>
                            </td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.stonksGemsNormal.mean)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.stonksGemsNormal.sd)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[1]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[1], varianceSimResult.stonksGemsNormal.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsNormal.p10)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsNormal.p25)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsNormal.p50)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsNormal.p75)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsNormal.p90)}</td>
                              </>
                            )}
                          </tr>
                          {showSuperStonks && (
                          <tr>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                Stonks (super)
                                <Tooltip content={{ title: "Stonks (super)", lines: ["Gems from Super Stonks (when Stonks procs and then Super procs)."] }} label="?" />
                              </span>
                            </td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.stonksGemsSuper.mean)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.stonksGemsSuper.sd)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[2]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[2], varianceSimResult.stonksGemsSuper.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsSuper.p10)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsSuper.p25)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsSuper.p50)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsSuper.p75)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsSuper.p90)}</td>
                              </>
                            )}
                          </tr>
                          )}
                          {showUltraStonks && (
                          <tr>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                Stonks (ultra)
                                <Tooltip content={{ title: "Stonks (ultra)", lines: ["Gems from Ultra Stonks (when Stonks and Super proc, then Ultra procs)."] }} label="?" />
                              </span>
                            </td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.stonksGemsUltra.mean)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.stonksGemsUltra.sd)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[2 + (showSuperStonks ? 1 : 0)]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[2 + (showSuperStonks ? 1 : 0)], varianceSimResult.stonksGemsUltra.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsUltra.p10)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsUltra.p25)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsUltra.p50)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsUltra.p75)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.stonksGemsUltra.p90)}</td>
                              </>
                            )}
                          </tr>
                          )}
                          <tr>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <img src="https://static.wikitide.net/shminerwiki/2/24/Gift.png" alt="" width={12} height={12} style={{ display: "block", flexShrink: 0 }} />
                                Gifts (count)
                              </span>
                            </td>
                            <td className="mono gemEvVarianceColMeanSd">{varianceSimResult.giftsCount.mean.toFixed(1)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{varianceSimResult.giftsCount.sd.toFixed(1)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[baseIdx]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[baseIdx], varianceSimResult.giftsCount.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{varianceSimResult.giftsCount.p10.toFixed(0)}</td>
                                <td className="mono">{varianceSimResult.giftsCount.p25.toFixed(0)}</td>
                                <td className="mono">{varianceSimResult.giftsCount.p50.toFixed(0)}</td>
                                <td className="mono">{varianceSimResult.giftsCount.p75.toFixed(0)}</td>
                                <td className="mono">{varianceSimResult.giftsCount.p90.toFixed(0)}</td>
                              </>
                            )}
                          </tr>
                          <tr>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <img src="https://static.wikitide.net/shminerwiki/2/24/Gift.png" alt="" width={12} height={12} style={{ display: "block", flexShrink: 0 }} />
                                Gift gems
                              </span>
                            </td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.giftGems.mean)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.giftGems.sd)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[baseIdx + 1]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[baseIdx + 1], varianceSimResult.giftGems.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.giftGems.p10)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.giftGems.p25)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.giftGems.p50)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.giftGems.p75)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.giftGems.p90)}</td>
                              </>
                            )}
                          </tr>
                          <tr>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <img src="https://static.wikitide.net/shminerwiki/2/24/Gift.png" alt="" width={12} height={12} style={{ display: "block", flexShrink: 0 }} />
                                Sushi (from gifts)
                              </span>
                            </td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.giftSushi.mean)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.giftSushi.sd)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[baseIdx + 2]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[baseIdx + 2], varianceSimResult.giftSushi.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.giftSushi.p10)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.giftSushi.p25)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.giftSushi.p50)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.giftSushi.p75)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.giftSushi.p90)}</td>
                              </>
                            )}
                          </tr>
                          {external.lootfrogsUnlocked && (
                            <tr>
                              <td>Lootfrog gems</td>
                              <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.lootfrogGems.mean)}</td>
                              <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.lootfrogGems.sd)}</td>
                              <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[baseIdx + 3]) }} title="CV% (SD/mean)">
                                {formatCvPct(cvs[baseIdx + 3], varianceSimResult.lootfrogGems.mean)}
                              </td>
                              {varianceShowPercentiles && (
                                <>
                                  <td className="mono">{fmt1OrIntOver1k(varianceSimResult.lootfrogGems.p10)}</td>
                                  <td className="mono">{fmt1OrIntOver1k(varianceSimResult.lootfrogGems.p25)}</td>
                                  <td className="mono">{fmt1OrIntOver1k(varianceSimResult.lootfrogGems.p50)}</td>
                                  <td className="mono">{fmt1OrIntOver1k(varianceSimResult.lootfrogGems.p75)}</td>
                                  <td className="mono">{fmt1OrIntOver1k(varianceSimResult.lootfrogGems.p90)}</td>
                                </>
                              )}
                            </tr>
                          )}
                          <tr>
                            <td>Lootbug net gems</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.lootbugNetGems.mean)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.lootbugNetGems.sd)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[baseIdx + 4]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[baseIdx + 4], varianceSimResult.lootbugNetGems.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.lootbugNetGems.p10)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.lootbugNetGems.p25)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.lootbugNetGems.p50)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.lootbugNetGems.p75)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.lootbugNetGems.p90)}</td>
                              </>
                            )}
                          </tr>
                          <tr>
                            <td>Founder gems</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.founderGems.mean)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.founderGems.sd)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[baseIdx + 5]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[baseIdx + 5], varianceSimResult.founderGems.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.founderGems.p10)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.founderGems.p25)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.founderGems.p50)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.founderGems.p75)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.founderGems.p90)}</td>
                              </>
                            )}
                          </tr>
                          <tr>
                            <td>Charge Magnet</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.chargeMagnetGems.mean)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.chargeMagnetGems.sd)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[baseIdx + 6]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[baseIdx + 6], varianceSimResult.chargeMagnetGems.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.chargeMagnetGems.p10)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.chargeMagnetGems.p25)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.chargeMagnetGems.p50)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.chargeMagnetGems.p75)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.chargeMagnetGems.p90)}</td>
                              </>
                            )}
                          </tr>
                          <tr>
                            <td>Gem Bomb gems</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.gemBombGems.mean)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.gemBombGems.sd)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[baseIdx + 7]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[baseIdx + 7], varianceSimResult.gemBombGems.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.gemBombGems.p10)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.gemBombGems.p25)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.gemBombGems.p50)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.gemBombGems.p75)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.gemBombGems.p90)}</td>
                              </>
                            )}
                          </tr>
                          <tr>
                            <td>Drone fuel cost</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(-varianceSimResult.droneFuelCost.mean)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.droneFuelCost.sd)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[baseIdx + 8]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[baseIdx + 8], varianceSimResult.droneFuelCost.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{fmt1OrIntOver1k(-varianceSimResult.droneFuelCost.p10)}</td>
                                <td className="mono">{fmt1OrIntOver1k(-varianceSimResult.droneFuelCost.p25)}</td>
                                <td className="mono">{fmt1OrIntOver1k(-varianceSimResult.droneFuelCost.p50)}</td>
                                <td className="mono">{fmt1OrIntOver1k(-varianceSimResult.droneFuelCost.p75)}</td>
                                <td className="mono">{fmt1OrIntOver1k(-varianceSimResult.droneFuelCost.p90)}</td>
                              </>
                            )}
                          </tr>
                          <tr style={{ fontWeight: 700 }}>
                            <td>Total</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.totalGems.mean)}</td>
                            <td className="mono gemEvVarianceColMeanSd">{fmt1OrIntOver1k(varianceSimResult.totalGems.sd)}</td>
                            <td className="mono gemEvVarianceColCV" style={{ backgroundColor: cvToBg(cvs[baseIdx + 9]) }} title="CV% (SD/mean)">
                              {formatCvPct(cvs[baseIdx + 9], varianceSimResult.totalGems.mean)}
                            </td>
                            {varianceShowPercentiles && (
                              <>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.totalGems.p10)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.totalGems.p25)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.totalGems.p50)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.totalGems.p75)}</td>
                                <td className="mono">{fmt1OrIntOver1k(varianceSimResult.totalGems.p90)}</td>
                              </>
                            )}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                    </>
                    );
                  })()}
                  {(() => {
                      const giftIconSmall = <img src="https://static.wikitide.net/shminerwiki/2/24/Gift.png" alt="" width={12} height={12} style={{ display: "block", flexShrink: 0, marginRight: 4 }} />;
                      const showSuperStonksBox = (params.super_stonks_chance ?? 0) > 0;
                      const showUltraStonksBox = (params.ultra_stonks_chance ?? 0) > 0;
                      const rows: Array<{ key: string; label: React.ReactNode; s: VarianceMetricStats; isCount?: boolean }> = [
                        { key: "totalGems", label: "Total", s: varianceSimResult.totalGems },
                        { key: "freebieBaseGems", label: "Freebie (base + skill shards)", s: varianceSimResult.freebieBaseGems },
                        { key: "stonksGemsNormal", label: "Stonks (normal)", s: varianceSimResult.stonksGemsNormal },
                        ...(showSuperStonksBox ? [{ key: "stonksGemsSuper" as const, label: "Stonks (super)" as React.ReactNode, s: varianceSimResult.stonksGemsSuper }] : []),
                        ...(showUltraStonksBox ? [{ key: "stonksGemsUltra" as const, label: "Stonks (ultra)" as React.ReactNode, s: varianceSimResult.stonksGemsUltra }] : []),
                        { key: "giftsCount", label: <>{giftIconSmall}Gifts (count)</>, s: varianceSimResult.giftsCount, isCount: true },
                        { key: "giftGems", label: <>{giftIconSmall}Gift gems</>, s: varianceSimResult.giftGems },
                        { key: "giftSushi", label: <>{giftIconSmall}Sushi (from gifts)</>, s: varianceSimResult.giftSushi },
                        ...(external.lootfrogsUnlocked ? [{ key: "lootfrogGems" as const, label: "Lootfrog gems", s: varianceSimResult.lootfrogGems }] : []),
                        { key: "lootbugNetGems", label: "Lootbug net gems", s: varianceSimResult.lootbugNetGems },
                        { key: "founderGems", label: "Founder gems", s: varianceSimResult.founderGems },
                        { key: "chargeMagnetGems", label: "Charge Magnet", s: varianceSimResult.chargeMagnetGems },
                        { key: "gemBombGems", label: "Gem Bomb gems", s: varianceSimResult.gemBombGems },
                        { key: "droneFuelCost", label: "Drone fuel cost", s: { mean: -varianceSimResult.droneFuelCost.mean, sd: varianceSimResult.droneFuelCost.sd, min: -varianceSimResult.droneFuelCost.max, max: -varianceSimResult.droneFuelCost.min, p10: -varianceSimResult.droneFuelCost.p90, p25: -varianceSimResult.droneFuelCost.p75, p50: -varianceSimResult.droneFuelCost.p50, p75: -varianceSimResult.droneFuelCost.p25, p90: -varianceSimResult.droneFuelCost.p10 } },
                      ];
                      const fmtVal = (v: number, isCount?: boolean) => (isCount ? v.toFixed(1) : fmt1OrIntOver1k(v));
                      return (
                        <Collapsible id="gemev-variance-boxplots" title={<><span>Box plot (per factor)</span><Tooltip content={{ title: "Box plot", lines: ["min, Q1 (25th), median, Q3 (75th), max from the simulation. Triangle marks the mean.", "Each row uses its own scale so the distribution shape is visible."] }} label="?" /></>} defaultExpanded={false} className="gemEvVarianceBoxplotsCollapse">
                          <div className="gemEvVarianceBoxplots gemEvCompactBlock">
                          {rows.map(({ key, label, s, isCount }) => {
                            const { min, max } = s;
                            const span = max - min || 1;
                            const toPct = (v: number) => ((v - min) / span) * 100;
                            const pctMin = toPct(min);
                            const pctQ1 = toPct(s.p25);
                            const pctMed = toPct(s.p50);
                            const pctQ3 = toPct(s.p75);
                            const pctMax = toPct(max);
                            const pctMean = toPct(s.mean);
                            const isTotal = key === "totalGems";
                            return (
                              <div key={key} className={`gemEvVarianceBoxplotRow ${isTotal ? "gemEvVarianceBoxplotRowTotal" : ""}`}>
                                <div className="gemEvVarianceBoxplotHead">
                                  <span className="gemEvVarianceBoxplotName" style={{ display: "inline-flex", alignItems: "center" }}>{label}</span>
                                  <span className="gemEvVarianceBoxplotStats mono">
                                    min {fmtVal(s.min, isCount)} · Q1 {fmtVal(s.p25, isCount)} · mean {fmtVal(s.mean, isCount)} · Q3 {fmtVal(s.p75, isCount)} · max {fmtVal(s.max, isCount)}
                                  </span>
                                </div>
                                <div className="gemEvVarianceBoxplotMeanRow" role="presentation">
                                  <div className="gemEvVarianceBoxplotMeanLabel" style={{ left: `${pctMean}%` }} title={`mean ${fmtVal(s.mean, isCount)}`}>
                                    <span className="gemEvVarianceBoxplotMeanValue mono">{fmtVal(s.mean, isCount)}</span>
                                    <span className="gemEvVarianceBoxplotMeanArrow" aria-hidden>▼</span>
                                  </div>
                                </div>
                                <div className="gemEvVarianceBoxplotTrack">
                                  <div className="gemEvVarianceBoxplotWhiskerLeft" style={{ left: `${pctMin}%`, width: `${pctQ1 - pctMin}%` }} />
                                  <div className="gemEvVarianceBoxplotBox" style={{ left: `${pctQ1}%`, width: `${pctQ3 - pctQ1}%` }}>
                                    <div className="gemEvVarianceBoxplotMedian" style={{ left: `${(pctQ3 - pctQ1 > 0 ? (pctMed - pctQ1) / (pctQ3 - pctQ1) : 0.5) * 100}%` }} />
                                  </div>
                                  <div className="gemEvVarianceBoxplotWhiskerRight" style={{ left: `${pctQ3}%`, width: `${pctMax - pctQ3}%` }} />
                                </div>
                              </div>
                            );
                          })}
                          </div>
                        </Collapsible>
                      );
                    })()}
                  </>
                ) : null}
              </div>
            </Collapsible>
          </div>

        <div id="gemev-game-speed" className="gemEvSection gemEvGameObeliskSection">
            <div className="gemEvSectionHeader">
              <span className="gemEvSectionTitle">Game Speed & Obelisk Level</span>
            </div>
            <div className="gemEvSectionBody gemEvGameSpeedSection">
              <Stepper
                label={
                  <>
                    Game Speed
                    <span className="mono" style={{ marginLeft: 4 }}>×</span>
                  </>
                }
                value={getGameSpeedMultiplier(effectiveParams)}
                onChange={(v) => setParams((s) => ({ ...s, game_speed_multiplier: clamp(v, 1, 10) }))}
                step={0.01}
                min={1}
                max={10}
                decimals={2}
                showButtons={false}
                tooltipAfter={
                  <Tooltip
                    content={{
                      title: "Game Speed",
                      sections: [
                        {
                          heading: "Stats value",
                          lines: [
                            "Game speed as × (e.g. 2× = half freebie timer). Same value as in the Stats screen (Stats button).",
                            "Decimals allowed (e.g. 2.1×). Multiplicative with freebie cooldown and all bomb recharge times (not supply drop).",
                            "1× = use VIP T10–T12; set >1 to override.",
                          ],
                        },
                        {
                          heading: "W3 floor debuff",
                          lines: [
                            "When active: 70% game speed on W3 floors.",
                            "Slower / longer in real time (+42.9%): Freebie cooldown, Bomb recharge, Drone buff/fuel intervals, Lootbug spawn interval and buff duration.",
                            "Not affected: Founder supply drop, Stargazing.",
                          ],
                        },
                      ],
                    }}
                    label="?"
                  />
                }
              />
              <Stepper
                label="Obelisk Level"
                value={params.obelisk_level}
                onChange={(v) => setParams((s) => ({ ...s, obelisk_level: clampInt(v, 0, 999) }))}
                step={1}
                min={0}
                max={999}
                inputMode="numeric"
                decimals={0}
                tooltipAfter={
                  <Tooltip
                    content={{
                      title: "Obelisk Level",
                      sections: [
                        {
                          heading: "Bonus gems",
                          lines: [
                            "Founder supply drop: base 30 Gems/drop. When the bonus-gems roll hits, you get 50 + 10 × Level extra per drop.",
                          ],
                        },
                        {
                          heading: "Gift-EV multiplier",
                          lines: [
                            "Freebie and supply-drop gift outcomes (Gems, Item/Relic Chests, Stonks, rare rolls, etc.) are multiplied by (1 + Level × 0.08).",
                          ],
                        },
                      ],
                    }}
                    label="?"
                  />
                }
              />
              <div className="gemEvRow gemEvRowCompact">
                <label className="gemEvCheckboxLabel">
                  <input
                    type="checkbox"
                    checked={Boolean(params.w3_floor_debuff)}
                    onChange={(e) => setParams((s) => ({ ...s, w3_floor_debuff: e.target.checked }))}
                  />
                  <span>W3 Debuff (−30% Game Speed)</span>
                </label>
                {params.w3_floor_debuff ? (
                  <span className="mono" style={{ opacity: 0.85 }}>
                    Effective Game Speed: {getEffectiveGameSpeedMultiplierForTime(effectiveParams).toFixed(2)}×
                  </span>
                ) : null}
              </div>
              {params.w3_floor_debuff ? (
                <div className="gemEvW3DebuffTableWrap gemEvCompactBlock">
                  <table className="gemEvW3DebuffTable">
                    <thead>
                      <tr>
                        <th>Effect</th>
                        <th>What</th>
                        <th>Real time</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><span className="gemEvW3DebuffEffect gemEvW3DebuffBad">Slower</span></td>
                        <td>
                          <span className="gemEvW3DebuffWhat">
                            <Sprite path="sprites/event/gembomb.png" alt="" className="iconSmall" />
                            Bomb recharge
                          </span>
                        </td>
                        <td className="mono">42.9% longer</td>
                      </tr>
                      <tr>
                        <td><span className="gemEvW3DebuffEffect gemEvW3DebuffBad">Longer</span></td>
                        <td>
                          <span className="gemEvW3DebuffWhat">
                            <Sprite path="sprites/common/gem.png" alt="" className="iconSmall" />
                            Freebie cooldown
                          </span>
                        </td>
                        <td className="mono">42.9% longer</td>
                      </tr>
                      <tr>
                        <td><span className="gemEvW3DebuffEffect gemEvW3DebuffBad">Fewer</span></td>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {typeof external.w3DebuffFishPctLoss === "number" && external.w3DebuffFishPctLoss > 0
                              ? "Fish (total)"
                              : "Fish from freebie gifts"}
                            <Tooltip
                              content={{
                                title: typeof external.w3DebuffFishPctLoss === "number" && external.w3DebuffFishPctLoss > 0 ? "Fish (total)" : "Fish from freebie gifts",
                                lines:
                                  typeof external.w3DebuffFishPctLoss === "number" && external.w3DebuffFishPctLoss > 0
                                    ? [
                                        "Effective total fish/h reduction from W3 debuff (fewer freebie gifts). Computed from your Fishing gains; open Fishing to refresh.",
                                        "Freebie cooldown 42.9% longer → 30% fewer freebies/h; only the freebie-gift share of your total fish/h is reduced.",
                                      ]
                                    : [
                                        "Freebie cooldown is 42.9% longer → 30% fewer freebies/h. Fish (and Sushi) from Statue of Soprano gifts scale with freebies/h, so ~30% fewer fish/h from that source. Founder supply drop is unchanged.",
                                        "Open Fishing to see your effective total fish/h reduction here.",
                                      ],
                              }}
                              label="?"
                            />
                          </span>
                        </td>
                        <td className="mono">
                          {typeof external.w3DebuffFishPctLoss === "number" && external.w3DebuffFishPctLoss > 0
                            ? `−${external.w3DebuffFishPctLoss.toFixed(1)}% fish/h`
                            : "~30% fewer fish/h"}
                        </td>
                      </tr>
                      <tr>
                        <td><span className="gemEvW3DebuffEffect gemEvW3DebuffBad">Longer interval</span></td>
                        <td>Drone: time between buffs / autofires</td>
                        <td className="mono">42.9% longer</td>
                      </tr>
                      <tr>
                        <td><span className="gemEvW3DebuffEffect gemEvW3DebuffGood">Longer</span></td>
                        <td>Drone: buff / fuel duration</td>
                        <td className="mono">42.9% longer</td>
                      </tr>
                      <tr>
                        <td><span className="gemEvW3DebuffEffect gemEvW3DebuffBad">Longer interval</span></td>
                        <td>Lootbug spawn interval</td>
                        <td className="mono">42.9% longer</td>
                      </tr>
                      <tr>
                        <td><span className="gemEvW3DebuffEffect gemEvW3DebuffGood">Longer</span></td>
                        <td>Lootbug buff duration</td>
                        <td className="mono">42.9% longer</td>
                      </tr>
                      <tr>
                        <td><span className="gemEvW3DebuffEffect gemEvW3DebuffUnchanged">Unchanged</span></td>
                        <td>Supply drop, Stargazing</td>
                        <td className="mono">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>

        <Collapsible
            id="gemev-freebie"
            title="FREEBIE"
            defaultExpanded={false}
            className="gemEvSection tierHeader1"
            headerRight={
              <>
                <Sprite path="sprites/common/gem.png" alt="Freebie" className="iconSmall" />
                <Tooltip content={freebieInfo} />
              </>
            }
          >
            <div className="gemEvSectionBody">
              <Stepper
                label={
                  <>
                    Freebie Gems (Base)
                    <Tooltip
                      content={{
                        title: "Freebie Gems (Base)",
                        lines: [`+1 Freebie Base Gem adds ${fmt1(marginal)} Gems/h at current build.`],
                      }}
                      label="?"
                    />
                  </>
                }
                value={params.freebie_gems_base}
                onChange={(v) => setParams((s) => ({ ...s, freebie_gems_base: v }))}
                step={1}
                min={0}
                max={9999}
                decimals={1}
              />
              <MinSecStepper
                label="Freebie Timer (min:sec) base"
                value={params.freebie_timer_minutes}
                onChange={(v) => setParams((s) => ({ ...s, freebie_timer_minutes: v }))}
                min={0.1}
                max={9999}
                stepMinutes={0.5}
              />
              <div className="gemEvRow" style={{ flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                <div className="label">
                  <img src="https://static.wikitide.net/shminerwiki/4/4d/MVPD-1988_Bar.png" alt="" width={24} height={24} style={{ display: "block", objectFit: "contain" }} aria-hidden />
                  <span>Freebie Timer Upgrades</span>
                  <Tooltip
                    content={{
                      title: "Freebie Timer Upgrades",
                      lines: ["Each level reduces the freebie timer by 1 second. Applied to the base timer before game speed."],
                    }}
                    label="?"
                  />
                </div>
                <div className="gemEvStepper">
                  <button className="btn btnSecondary gemEvStepBtn" type="button" onClick={() => setParams((s) => ({ ...s, freebie_timer_upgrade_level: Math.max(0, (s.freebie_timer_upgrade_level ?? 0) - 1) }))}>
                    −
                  </button>
                  <input
                    className="input gemEvInput"
                    inputMode="numeric"
                    value={String(Math.max(0, Math.trunc(params.freebie_timer_upgrade_level ?? 0)))}
                    onChange={(e) => {
                      const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                      if (!Number.isFinite(v)) return;
                      setParams((s) => ({ ...s, freebie_timer_upgrade_level: Math.max(0, Math.min(999, v)) }));
                    }}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                      setParams((s) => ({ ...s, freebie_timer_upgrade_level: Number.isFinite(v) ? Math.max(0, Math.min(999, v)) : 0 }));
                    }}
                    style={{ width: "3em" }}
                    aria-label="Freebie Timer Upgrade level"
                  />
                  <button className="btn gemEvStepBtn" type="button" onClick={() => setParams((s) => ({ ...s, freebie_timer_upgrade_level: Math.min(999, (s.freebie_timer_upgrade_level ?? 0) + 1) }))}>
                    +
                  </button>
                </div>
                <span className="mono small" style={{ marginLeft: 4 }}>
                  → −{Math.max(0, Math.trunc(params.freebie_timer_upgrade_level ?? 0))}s freebie timer
                </span>
              </div>
              <Stepper
                label={
                  <>
                    Banked freebies
                    <Tooltip
                      content={{
                        title: "Banked freebies",
                        lines: [
                          "Cap for banked freebies (like Lootbug cap). Used by Overnight Gains: banked count × freebie EV per claim.",
                          "Set this in Gem EV; Overnight reads it from here.",
                        ],
                      }}
                      label="?"
                    />
                  </>
                }
                value={bankedFreebies}
                onChange={(v) => setBankedFreebies(Math.max(0, Math.min(999, v)))}
                step={1}
                min={0}
                max={999}
                decimals={0}
              />
              {freebiesPerHour > 0 && bankedFreebies > 0 && (
                <div className="gemEvRow gemEvEffectiveTimerGlow">
                  <span className="mono small">Time to hit Freebie cap:  </span>
                  <span className="mono small">
                    {(() => {
                      const totalMinutes = (bankedFreebies / freebiesPerHour) * 60;
                      const hours = totalMinutes / 60;
                      if (hours >= 1) {
                        const h = Math.floor(hours);
                        const remainderMinutes = (hours - h) * 60;
                        return remainderMinutes >= 0.01
                          ? `${h} h ${formatMinSecWithUnit(remainderMinutes)}`
                          : `${h} h`;
                      }
                      return formatMinSecWithUnit(totalMinutes);
                    })()}
                  </span>
                </div>
              )}

              <div className="gemEvDivider" />

              <div className="gemEvInlineHead">
                <span className="mono">Jackpot (Freebie)</span>
                <Tooltip
                  content={{
                    title: "Jackpot (Freebie)",
                    sections: [
                      {
                        heading: "Effect",
                        lines: [
                          "When Jackpot triggers, that claim gives 5 rolls instead of 1. More rolls = more outcomes from that single claim.",
                        ],
                      },
                      {
                        heading: "Affects",
                        lines: [
                          "Gems (base): 5× rolls on jackpot. Item Chests and Relic Chests from freebie: 5 chests when jackpot. Skill Shards: each roll can proc. Freebie Relic Chance: more rolls per claim.",
                        ],
                      },
                      {
                        heading: "Does not affect",
                        lines: [
                          "Stonks: procs only on the first roll per claim. Gifts (Statue of Soprano): one gift roll per claim, same as Stonks.",
                        ],
                      },
                    ],
                  }}
                  label="?"
                />
              </div>
              <Stepper
                label="Jackpot Chance (%)"
                value={params.jackpot_chance * 100}
                onChange={(v) => setParams((s) => ({ ...s, jackpot_chance: v / 100 }))}
                step={1}
                min={0}
                max={100}
                decimals={1}
              />

              <div className="gemEvDivider" />

              <div className="gemEvInlineHead">
                <span className="mono">Refresh (Freebie)</span>
                <Tooltip
                  content={{
                    title: "Refresh (Freebie)",
                    sections: [
                      {
                        heading: "Effect",
                        lines: [
                          "Instant Refresh Chance: when it triggers after a claim, the freebie refreshes immediately (no cooldown wait). Effectively more claims per hour.",
                        ],
                      },
                      {
                        heading: "Affects",
                        lines: [
                          "All freebie-based results: Gems (base), Item/Relic Chests, Stonks, Skill Shards, Gifts (Statue of Soprano), Freebie Relic Chance. Higher refresh = more claims per hour = more of everything from freebies.",
                        ],
                      },
                    ],
                  }}
                  label="?"
                />
              </div>
              <Stepper
                label="Instant Refresh Chance (%)"
                value={params.instant_refresh_chance * 100}
                onChange={(v) => setParams((s) => ({ ...s, instant_refresh_chance: v / 100 }))}
                step={1}
                min={0}
                max={99}
                decimals={1}
              />

              <div className="gemEvDivider" />

              <Collapsible
                id="gemev-skill-shards"
                title="Skill Shards (Freebie)"
                defaultExpanded={false}
                headerRight={
                  <>
                    <Sprite path="sprites/common/skill_shard.png" alt="Skill shards" className="iconSmall" />
                    <Tooltip
                      content={{
                        title: "Why include Skill Shards in EV",
                        sections: [
                          {
                            heading: "Value",
                            lines: [
                              "1 skill point = 125 Gems → 1 skill shard = 12.5 Gems (fixed).",
                              "Only the chance is editable.",
                            ],
                          },
                        ],
                      }}
                      label="?"
                    />
                  </>
                }
              >
                <div className="gemEvSectionBody" style={{ paddingTop: 4 }}>
                  <label className="toggle" style={{ marginBottom: 8 }}>
                    <input type="checkbox" checked={skillShardsEnabled} onChange={(e) => setSkillShardsEnabled(e.target.checked)} />
                    Include in EV
                  </label>
                  <Stepper
                    label="Skill Shard Chance (%)"
                    value={params.skill_shard_chance * 100}
                    onChange={(v) => setParams((s) => ({ ...s, skill_shard_chance: v / 100 }))}
                    step={1}
                    min={0}
                    max={100}
                    decimals={1}
                    disabled={!skillShardsEnabled}
                  />
                </div>
              </Collapsible>

              <div className="gemEvDivider" />

              <Collapsible
                id="gemev-stonks"
                title="Stonks (Freebie)"
                defaultExpanded={false}
                headerRight={
                  <>
                    <Sprite path="sprites/common/stonks_tree.png" alt="Stonks" className="iconSmall" />
                    <Tooltip
                      content={{
                        title: "Source of values",
                        lines: ["Take the chance, bonus, and multiplier values from the Chest Stats area (Stats button)."],
                      }}
                      label="?"
                    />
                  </>
                }
              >
                <div className="gemEvSectionBody" style={{ paddingTop: 4 }}>
                  {/* Tier 1: Stonks (lightest green) */}
                  <div className="gemEvStonksTier gemEvStonksTier1">
                    <div className="gemEvInlineHead">
                      <span className="mono">Stonks</span>
                    </div>
                    <label className="toggle" style={{ marginTop: 4 }}>
                      <input type="checkbox" checked={stonksEnabled} onChange={(e) => setStonksEnabled(e.target.checked)} />
                      Stonks enabled (1% chance, 200 Gems base)
                    </label>
                    <Stepper
                      label="Stonks multiplier (×)"
                      value={params.stonks_multiplier ?? 1}
                      onChange={(v) => setParams((s) => ({ ...s, stonks_multiplier: v }))}
                      step={0.1}
                      min={0}
                      max={999}
                      decimals={1}
                      disabled={!stonksEnabled}
                    />
                  </div>

                  {/* Tier 2: Super Stonks (medium green) – collapsible, default collapsed */}
                  <Collapsible
                    id="gemev-super-stonks"
                    title="Super Stonks"
                    defaultExpanded={false}
                    headerRight={
                      <Tooltip
                        content={{
                          title: "Super Stonks",
                          lines: ["Only rolls when Stonks triggered on the same claim (first roll)."],
                        }}
                        label="?"
                      />
                    }
                  >
                    <div className="gemEvStonksTier gemEvStonksTier2">
                      <Stepper
                        label="Super Stonks chance (%)"
                        value={(params.super_stonks_chance ?? 0) * 100}
                        onChange={(v) => setParams((s) => ({ ...s, super_stonks_chance: v / 100 }))}
                        step={0.5}
                        min={0}
                        max={100}
                        decimals={1}
                      />
                      <Stepper
                        label="Super Stonks bonus (Gems)"
                        value={params.super_stonks_bonus_gems ?? 0}
                        onChange={(v) => setParams((s) => ({ ...s, super_stonks_bonus_gems: v }))}
                        step={10}
                        min={0}
                        max={99999}
                        decimals={0}
                      />
                      <Stepper
                        label="Super Stonks multiplier (×)"
                        value={params.super_stonks_multiplier ?? 1}
                        onChange={(v) => setParams((s) => ({ ...s, super_stonks_multiplier: v }))}
                        step={0.1}
                        min={0}
                        max={999}
                        decimals={1}
                      />
                    </div>
                  </Collapsible>

                  {/* Tier 3: Ultra Stonks (darkest green) – collapsible, default collapsed */}
                  <Collapsible
                    id="gemev-ultra-stonks"
                    title="Ultra Stonks"
                    defaultExpanded={false}
                    headerRight={
                      <Tooltip
                        content={{
                          title: "Ultra Stonks",
                          lines: ["Only rolls when Super Stonks triggered on the same claim."],
                        }}
                        label="?"
                      />
                    }
                  >
                    <div className="gemEvStonksTier gemEvStonksTier3">
                      <Stepper
                        label="Ultra Stonks chance (%)"
                        value={(params.ultra_stonks_chance ?? 0) * 100}
                        onChange={(v) => setParams((s) => ({ ...s, ultra_stonks_chance: v / 100 }))}
                        step={0.5}
                        min={0}
                        max={100}
                        decimals={1}
                      />
                      <Stepper
                        label="Ultra Stonks bonus (Gems)"
                        value={params.ultra_stonks_bonus_gems ?? 0}
                        onChange={(v) => setParams((s) => ({ ...s, ultra_stonks_bonus_gems: v }))}
                        step={10}
                        min={0}
                        max={99999}
                        decimals={0}
                      />
                      <Stepper
                        label="Ultra Stonks multiplier (×)"
                        value={params.ultra_stonks_multiplier ?? 1}
                        onChange={(v) => setParams((s) => ({ ...s, ultra_stonks_multiplier: v }))}
                        step={0.1}
                        min={0}
                        max={999}
                        decimals={1}
                      />
                    </div>
                  </Collapsible>

                  {/* Stonks all multiplier */}
                  <div className="gemEvInlineHead" style={{ marginTop: 4 }}>
                    <span className="mono">Stonks all multiplier</span>
                    <Tooltip
                      content={{
                        title: "Stonks all multiplier",
                        lines: ["Applied to the sum of Stonks + Super Stonks + Ultra Stonks EV."],
                      }}
                      label="?"
                    />
                  </div>
                  <Stepper
                    label="Stonks all multiplier (×)"
                    value={params.stonks_all_multiplier ?? 1}
                    onChange={(v) => setParams((s) => ({ ...s, stonks_all_multiplier: v }))}
                    step={0.1}
                    min={0}
                    max={999}
                    decimals={1}
                  />
                </div>
              </Collapsible>

              <div className="gemEvDivider" />

              <Collapsible
                id="gemev-construct"
                title="Construct (World 3 Statues)"
                defaultExpanded={false}
                headerRight={
                  <Tooltip
                    content={{
                      title: "Statue of Soprano",
                      sections: [
                        { heading: "Normal", lines: ["Freebie Gift Chance +0.5%.", "100× Freebie Gifts Chance 1/50k."] },
                        { heading: "Gilded", lines: ["Freebie Gift Chance +0.75%.", "100× Freebie Gifts Chance 1/35k."] },
                        { heading: "Platinized", lines: ["Freebie Gift Chance +1%.", "100× Freebie Gifts Chance 1/25k."] },
                      ],
                    }}
                    label="?"
                  />
                }
              >
                <div className="gemEvSectionBody" style={{ paddingTop: 4 }}>
                  <div className="gemEvInlineHead" style={{ marginBottom: 4 }}>
                    <span>Statue of Soprano (Praed)</span>
                  </div>
                  <div className="gemEvCardRow" style={{ marginTop: 4 }}>
                    {[
                      { level: 1, label: "Normal", src: "https://static.wikitide.net/shminerwiki/0/00/18_Statue_Soprano_Normal.png", stats: "+0.5%, 1/50k" },
                      { level: 2, label: "Gilded", src: "https://static.wikitide.net/shminerwiki/3/3d/18_Statue_Soprano_Gilded.png", stats: "+0.75%, 1/35k" },
                      { level: 3, label: "Platinized", src: "https://static.wikitide.net/shminerwiki/5/5f/18_Statue_Soprano_Platinized.png", stats: "+1%, 1/25k" },
                    ].map((opt) => {
                      const cur = statueSopranoLevel === opt.level;
                      return (
                        <button
                          key={opt.level}
                          type="button"
                          className={`btn btnSecondary gemEvCardBtn ${cur ? "cardBtnActive" : ""}`}
                          onClick={() => setStatueSopranoLevel(cur ? 0 : opt.level)}
                          aria-label={`Statue of Soprano: ${opt.label}`}
                        >
                          <img src={opt.src} alt="" width={20} height={20} style={{ objectFit: "contain", verticalAlign: "middle" }} />
                          <span style={{ marginLeft: 4 }}>{opt.label}</span>
                          {cur ? " ✓" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Collapsible>

              <Collapsible
                id="gemev-relic-chests-freebie"
                title="Relic Chests (Freebie)"
                defaultExpanded={false}
                headerRight={
                  <Tooltip
                    content={{
                      title: "Relic Chests from Freebie",
                      sections: [
                        { heading: "Source", lines: ["Same freebie/refresh as Item Chests. One claim can hit both Relic Chance and Bonus Relic Chance (best case 2 relics)."] },
                        { heading: "Jackpot", lines: ["Jackpot roll gives 10 relics. Same jackpot chance and rolls as Freebie Gems."] },
                      ],
                    }}
                    label="?"
                  />
                }
              >
                <div className="gemEvSectionBody" style={{ paddingTop: 4 }}>
                  <div className="gemEvCardRow" style={{ gap: 8 }}>
                    <Stepper
                      label="Relic Chance (%)"
                      value={(params.freebie_relic_chance ?? 0) * 100}
                      onChange={(v) => setParams((s) => ({ ...s, freebie_relic_chance: v / 100 }))}
                      step={1}
                      min={0}
                      max={100}
                      decimals={1}
                    />
                    <Stepper
                      label="Bonus Relic Chance (%)"
                      value={(params.freebie_bonus_relic_chance ?? 0) * 100}
                      onChange={(v) => setParams((s) => ({ ...s, freebie_bonus_relic_chance: v / 100 }))}
                      step={1}
                      min={0}
                      max={100}
                      decimals={1}
                    />
                  </div>
                  <div className="gemEvRow" style={{ marginTop: 4, flexWrap: "nowrap", alignItems: "baseline" }}>
                    <span className="mono small">→ Relic Chests/h (Freebie) <span className="mono">{freebieRelicChestsPerHour.toFixed(2)}</span></span>
                  </div>
                </div>
              </Collapsible>
            </div>
          </Collapsible>

          <div className="gemEvSection tierHeader2" id="gemev-founder">
            <div className="gemEvSectionHeader gemEvFounderHeader">
              <span className="gemEvSectionTitle" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                Founder / VIP
                <Sprite path="sprites/event/founderbomb.png" alt="Founder" className="iconSmall" aria-hidden />
                <Tooltip content={founderInfo} />
                {params.founder_enabled ? (
                  <button
                    type="button"
                    className="gemEvChartIconBtn"
                    onClick={() => setFounderSupplyDropChartOpen(true)}
                    title="Supply drop breakdown"
                    aria-label="Open Supply drop breakdown"
                  >
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                      <rect x="5" y="14" width="4" height="6" rx="1.5" fill="currentColor" opacity={0.7} />
                      <rect x="11" y="10" width="4" height="10" rx="1.5" fill="currentColor" opacity={0.85} />
                      <rect x="17" y="6" width="4" height="14" rx="1.5" fill="currentColor" />
                    </svg>
                  </button>
                ) : null}
              </span>
              <label className="toggle" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={Boolean(params.founder_enabled)}
                  onChange={(e) => setParams((s) => ({ ...s, founder_enabled: e.target.checked }))}
                />
                FOUNDER enabled
              </label>
            </div>
            <div className="gemEvSectionBody">
              <Stepper
                label="VIP Lounge Level (1–12)"
                value={params.vip_lounge_level}
                onChange={(v) => setParams((s) => ({ ...s, vip_lounge_level: clampInt(v, 1, 12) }))}
                step={1}
                min={1}
                max={12}
                inputMode="numeric"
                decimals={0}
                disabled={!params.founder_enabled}
              />
              <div className="gemEvFounderWorldsRow">
                <span className="gemEvFounderWorldsLabel">Worlds Unlocked:</span>
                <span className="mono gemEvFounderWorldsValue">
                  {params.founder_worlds_unlocked ?? (params.founder_enabled ? 2 : 1)}
                </span>
                <div className="gemEvFounderWorldsButtons">
                  {([1, 2, 3, 4] as const).map((n) => {
                    const current = params.founder_worlds_unlocked ?? (params.founder_enabled ? 2 : 1);
                    return (
                      <button
                        key={n}
                        type="button"
                        className={current === n ? "btn" : "btn btnSecondary"}
                        onClick={() => setParams((s) => ({ ...s, founder_worlds_unlocked: n }))}
                        title={`${n} World${n === 1 ? "" : "s"} Unlocked`}
                        disabled={!params.founder_enabled}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                <Tooltip
                  content={{
                    title: "Worlds Unlocked",
                    sections: [
                      {
                        heading: "Supply drop scale",
                        lines: [
                          "Supply drop amounts scale with Worlds Unlocked (Gems 10×W, Item 2×W, Relic 1×W, etc.).",
                          "Set to the number of worlds you have unlocked (1–4).",
                        ],
                      },
                    ],
                  }}
                />
              </div>
            </div>
          </div>
          {founderSupplyDropChartOpen
            ? createPortal(
                <div
                  className="modalOverlay"
                  onMouseDown={() => setFounderSupplyDropChartOpen(false)}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="gemev-founder-supply-drop-chart-title"
                >
                  <div className="modalWindow gemEvFounderSupplyDropChartModal" onMouseDown={(e) => e.stopPropagation()}>
                    <div className="modalHeader">
                      <div id="gemev-founder-supply-drop-chart-title" className="mono" style={{ fontWeight: 900 }}>
                        Supply drop (per hour)
                      </div>
                      <button className="btn btnSecondary" type="button" onClick={() => setFounderSupplyDropChartOpen(false)}>
                        Close
                      </button>
                    </div>
                    <div className="modalBody">
                      <div className="gemEvFounderSupplyDropChartBlock">
                        <div className="gemEvFounderSupplyDropChartTitle">From Founder Supply Drop</div>
                        <table className="gemEvFounderSupplyDropTable">
                          <tbody>
                            {founderSupplyDropChartRows.map((row) => (
                              <tr key={row.key}>
                                <td className="gemEvFounderSupplyDropTableLabel">{row.label}</td>
                                <td className="mono gemEvFounderSupplyDropTableValue">
                                  {row.value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>,
                document.body
              )
            : null}

        {chartOpen ? (
          <div className="modalOverlay" onMouseDown={() => setChartOpen(false)}>
            <div className="modalWindow" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHeader">
                <div>
                  <div className="mono" style={{ fontWeight: 900 }}>
                    Overview chart
                  </div>
                  <div className="small">Stacked: Base / Jackpot / Refresh (Base) / Refresh (Jackpot)</div>
                </div>
                <button className="btn btnSecondary" type="button" onClick={() => setChartOpen(false)}>
                  Close
                </button>
              </div>
              <div className="modalBody">
                <div className="gemEvChartBlock">
                  <div className="gemEvChartLegendTop" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 16px", marginBottom: 8 }}>
                    {showJackpotRefresh ? <ContribLegend /> : null}
                    <label className="gemEvChartToggle" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 700, color: "rgba(15,23,42,0.85)" }}>
                      <input
                        type="checkbox"
                        checked={showJackpotRefresh}
                        onChange={(e) => setShowJackpotRefresh(e.target.checked)}
                        aria-label="Show Jackpot/Refresh contribution"
                      />
                      <span>Show Jackpot/Refresh contribution</span>
                    </label>
                  </div>
                  <ContribBarChart
                    ev={evForChart}
                    breakdown={breakdownForChart}
                    lootbugGainsGross={external.lootbugGainsGross}
                    lootbugTotalGemCostPerHour={external.lootbugTotalGemCostPerHour}
                    lootbug10xGemEvPerHour={external.lootbug10xGemEvPerHour}
                    droneFuelGemsPerHour={external.droneFuelGemsPerHour > 0 ? -external.droneFuelGemsPerHour : undefined}
                    gemBomb10xImpact={gemBomb10xImpactForChart}
                    chaosTotemImpact={chaosTotemForChart}
                    chargeMagnetImpact={chargeMagnetForChart}
                    founderSupplyDropItemsGemValue={founderSupplyDropItemsGemValue}
                    founderSupplyDropFrogspawnGemValue={founderSupplyDropFrogspawnGemValue}
                    showJackpotRefresh={showJackpotRefresh}
                    skillShardsEnabled={skillShardsEnabled}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {giftChartOpen
          ? createPortal(
              <div className="modalOverlay" onMouseDown={() => setGiftChartOpen(false)} role="dialog" aria-modal="true" aria-labelledby="gift-ev-modal-title">
                <div className="modalWindow gemEvGiftEvChartModal" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="modalHeader">
                    <div>
                      <div id="gift-ev-modal-title" className="mono" style={{ fontWeight: 900 }}>
                        Gift EV breakdown — {fmt1OrIntOver1k(giftEv)} Gems per Gift
                      </div>
                      <div className="small">Bars sorted by Gem EV (descending). All values include Obelisk × Lucky multipliers.</div>
                    </div>
                    <button className="btn btnSecondary" type="button" onClick={() => setGiftChartOpen(false)}>
                      Close
                    </button>
                  </div>
                  <div className="modalBody">
                    <div className="gemEvChartBlock">
                      <GiftEvChart breakdown={giftBreakdown} darkTheme />
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}

        {giftsPerHourChartOpen && totalGiftsPerHour > 0
          ? createPortal(
              <div className="modalOverlay" onMouseDown={() => setGiftsPerHourChartOpen(false)} role="dialog" aria-modal="true" aria-labelledby="gifts-per-hour-modal-title">
                <div className="modalWindow gemEvGiftsPerHourChartModal" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="modalHeader">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div>
                        <div id="gifts-per-hour-modal-title" className="mono" style={{ fontWeight: 900 }}>Gifts per hour by source</div>
                        <div className="small">Share of total Gifts/h from each source (absolute and %).</div>
                      </div>
                    </div>
                    <button className="btn btnSecondary" type="button" onClick={() => setGiftsPerHourChartOpen(false)}>
                      Close
                    </button>
                  </div>
                  <div className="modalBody">
                    <div className="gemEvGiftsContribBlock">
                      <div className="gemEvGiftsContribTitle">Gifts/h</div>
                      <div className="gemEvGiftsContribBars" role="img" aria-label="Gifts per hour by source bar chart">
                        {[
                          { label: "Statue of Soprano (normal roll)", value: giftsPerHourBySource.giftPerHourFreebieNormal ?? 0, color: "#fff59d" },
                          { label: "Statue of Soprano (100× roll)", value: giftsPerHourBySource.giftPerHourFreebie100 ?? 0, color: "#ffeb3b" },
                          { label: "Founder supply drop", value: giftsPerHourBySource.giftPerHourFounder, color: "#ffc107" },
                        ]
                          .filter((r) => r.value > 0)
                          .map(({ label, value, color }) => {
                            const pct = totalGiftsPerHour > 0 ? (value / totalGiftsPerHour) * 100 : 0;
                            const maxVal = Math.max(
                              giftsPerHourBySource.giftPerHourFreebie ?? 0,
                              giftsPerHourBySource.giftPerHourFounder,
                              1
                            );
                            const widthPct = maxVal > 0 ? (value / maxVal) * 100 : 0;
                            return (
                              <div key={label} className="gemEvGiftsContribRow">
                                <span className="gemEvGiftsContribLabel">{label}</span>
                                <div className="gemEvGiftsContribBarTrack">
                                  <div
                                    className="gemEvGiftsContribBarFill"
                                    style={{ width: `${widthPct}%`, backgroundColor: color }}
                                  />
                                </div>
                                <span className="mono gemEvGiftsContribValue" title={`${value.toFixed(2)}/h (${pct.toFixed(1)}%)`}>
                                  {value.toFixed(2)}
                                  <span className="gemEvGiftsContribPct"> ({pct.toFixed(1)}%)</span>
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}
      </div>
    </div>
  );
}

