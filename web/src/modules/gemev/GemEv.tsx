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
  calculateFreebiesPerHour,
  calculateGemBombGemsPerHour,
  calculateGiftEvBreakdown,
  calculateGiftEvPerGift,
  calculateGiftSushiPerHour,
  calculateStonksChestsPerHour,
  calculateTotalEvPerHour,
  defaultGameParameters,
  getEffectiveFreebieTimerMinutes,
  getFounderSupplyDropPerHour,
  getGameSpeedMultiplier,
  type GameParameters,
} from "../../lib/gemev/freebieEv";
import { ContribBarChart, ContribLegend } from "./ContribBarChart";
import { GiftEvChart } from "./GiftEvChart";

type SavedStateV1 = {
  params: Partial<GameParameters>;
  stonks_enabled: boolean;
  skill_shards_enabled: boolean;
  show_jackpot_refresh?: boolean;
  statue_soprano_level?: number;
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

function fmtPct(n: number, total: number): string {
  if (!Number.isFinite(n) || !Number.isFinite(total) || total <= 0) return "0.0%";
  return `${((n / total) * 100).toFixed(1)}%`;
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
}) {
  const { label, value, onChange, step = 1, min = -Infinity, max = Infinity, inputMode = "decimal", decimals = 2, disabled = false, showButtons = true } = props;
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
        <span className="mono">{Number.isFinite(value) ? value.toFixed(decimals) : "—"}</span>
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
    return { params: merged, stonks_enabled, skill_shards_enabled, show_jackpot_refresh, statue_soprano_level };
  }, []);

  const [params, setParams] = useState<GameParameters>(initial.params);
  const [stonksEnabled, setStonksEnabled] = useState<boolean>(initial.stonks_enabled);
  const [skillShardsEnabled, setSkillShardsEnabled] = useState<boolean>(initial.skill_shards_enabled);
  const [chartOpen, setChartOpen] = useState(false);
  const [giftChartOpen, setGiftChartOpen] = useState(false);
  const [showJackpotRefresh, setShowJackpotRefresh] = useState<boolean>(initial.show_jackpot_refresh);
  const [statueSopranoLevel, setStatueSopranoLevel] = useState<number>(initial.statue_soprano_level);
  const [lootbugNetGemsPerHour, setLootbugNetGemsPerHour] = useState(0);
  useEffect(() => {
    const ext = loadJson<{ lootbugNetGemsPerHour?: number }>(GEMEV_EXTERNAL_KEY);
    setLootbugNetGemsPerHour(typeof ext?.lootbugNetGemsPerHour === "number" ? ext.lootbugNetGemsPerHour : 0);
  }, []);
  // autosave
  useEffect(() => {
    const t = window.setTimeout(() => {
      const payload: SavedStateV1 = { params, stonks_enabled: stonksEnabled, skill_shards_enabled: skillShardsEnabled, show_jackpot_refresh: showJackpotRefresh, statue_soprano_level: statueSopranoLevel };
      saveJson(STORAGE_KEY, payload);
    }, 250);
    return () => window.clearTimeout(t);
  }, [params, stonksEnabled, skillShardsEnabled, showJackpotRefresh, statueSopranoLevel]);

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
      fishPerSushiEvForGift?: number;
    }>(GEMEV_EXTERNAL_KEY);
    const lootbug10x = typeof ext?.lootbugBomb10xMinPerHour === "number" ? ext.lootbugBomb10xMinPerHour : 0;
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
    const fishPerSushiEvForGift = typeof ext?.fishPerSushiEvForGift === "number" ? ext.fishPerSushiEvForGift : undefined;
    return {
      lootbug10x, drone10x, total10x: lootbug10x + drone10x, lootbugNetGemsPerHour, lootbugGainsGross, lootbug10xGemEvPerHour, lootbugChestGemEvPerHour, lootbugTotalGemCostPerHour, droneFuelGemsPerHour, chaosTotemUptimePct, chaosTotem100FromBombs, chaosTotemImpactFromItems, chargeMagnetImpact, lootbugItemChestsPerHour, itemsPerChest, gemBombGemsPerHourFromBombs, gemBomb10xImpactFromBombs, chaosTotemImpactFromBombs, valueOfOneChestForLootbug, chaosTotemValuePerTotemForGift, fishingUnlocked, giftFishingTickValue, fishPerSushiEvForGift,
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

    // Fixed desktop constants
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
    p.freebie_claim_percentage = clamp(p.freebie_claim_percentage, 0, 100);
    p.skill_shard_chance = clamp(p.skill_shard_chance, 0, 1);
    p.jackpot_chance = clamp(p.jackpot_chance, 0, 1);
    p.instant_refresh_chance = clamp(p.instant_refresh_chance, 0, 1);
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
    p.gift_charge_magnet_value_per_magnet = !external.fishingUnlocked
      ? calculateChargeMagnetGemsPerHour(p, 20)
      : undefined;
    p.gift_drone_fuel_gems_per_fuel = 5;
    p.gift_sushi_fish_per_sushi = external.fishPerSushiEvForGift;

    return p;
  }, [params, stonksEnabled, skillShardsEnabled, statueSopranoLevel, external10x.total, external.chaosTotemUptimePct, external.chaosTotem100FromBombs, external.valueOfOneChestForLootbug, external.chaosTotemValuePerTotemForGift, external.fishingUnlocked, external.giftFishingTickValue, external.fishPerSushiEvForGift]);

  const ev = useMemo(() => calculateTotalEvPerHour(effectiveParams), [effectiveParams]);
  const freebiesPerHour = useMemo(() => calculateFreebiesPerHour(effectiveParams), [effectiveParams]);
  const freebieChestsPerHour = useMemo(() => calculateFreebieChestsPerHour(effectiveParams), [effectiveParams]);
  const breakdown = useMemo(() => calculateEvBreakdown(effectiveParams), [effectiveParams]);
  const giftEv = useMemo(() => calculateGiftEvPerGift(effectiveParams), [effectiveParams]);
  const giftBreakdown = useMemo(() => calculateGiftEvBreakdown(effectiveParams), [effectiveParams]);

  const gemBomb10xImpact = useMemo(() => {
    const without10x = calculateGemBombGemsPerHour({ ...effectiveParams, bomb_recharge_10x_min_per_hour: 0 });
    return Math.max(0, ev.gem_bomb_gems - without10x);
  }, [effectiveParams, ev.gem_bomb_gems]);

  const chaosTotemImpact = useMemo(() => {
    const withoutChaos = calculateGemBombGemsPerHour({ ...effectiveParams, chaos_totem_uptime: 0 });
    return Math.max(0, ev.gem_bomb_gems - withoutChaos);
  }, [effectiveParams, ev.gem_bomb_gems]);

  /** Bomb contribution: from Bombs module when present, else from own params. */
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

  /** Charge Magnet impact: from Items (external) when set, else computed here. Includes founder supply drop chests; founder share is moved to Founder bar. */
  const chargeMagnetImpactResolved = useMemo(() => {
    const ext = loadJson<{ chargeMagnetImpact?: number; lootbugItemChestsPerHour?: number; founderSupplyDropItemChestsPerHour?: number; itemsPerChest?: number }>(GEMEV_EXTERNAL_KEY);
    if (typeof ext?.chargeMagnetImpact === "number") return ext.chargeMagnetImpact;
    const founderChests = ext?.founderSupplyDropItemChestsPerHour ?? founderSupplyDrop.itemChestsPerHour;
    const chestsPerHour = freebieChestsPerHour + stonksChestsPerHour + (ext?.lootbugItemChestsPerHour ?? 0) + founderChests;
    const itemsPerChest = typeof ext?.itemsPerChest === "number" ? ext.itemsPerChest : 1;
    const chargeMagnetsPerHour = chestsPerHour * itemsPerChest * 0.026;
    const valuePerMagnet = calculateChargeMagnetGemsPerHour(effectiveParams, 20);
    return chargeMagnetsPerHour * valuePerMagnet;
  }, [effectiveParams, freebieChestsPerHour, stonksChestsPerHour, founderSupplyDrop.itemChestsPerHour]);

  /** Founder supply drop item chests → Charge Magnet + Chaos Totem value. Shown in Founder bar; excluded from Gem Bomb bar. */
  const { founderSupplyDropItemsGemValue, chargeMagnetForChart, chaosTotemForChart } = useMemo(() => {
    const ext = loadJson<{ lootbugItemChestsPerHour?: number; founderSupplyDropItemChestsPerHour?: number; itemsPerChest?: number }>(GEMEV_EXTERNAL_KEY);
    const founderChests = ext?.founderSupplyDropItemChestsPerHour ?? founderSupplyDrop.itemChestsPerHour;
    const totalChests = freebieChestsPerHour + stonksChestsPerHour + (ext?.lootbugItemChestsPerHour ?? 0) + founderChests;
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
  }, [effectiveParams, freebieChestsPerHour, stonksChestsPerHour, founderSupplyDrop.itemChestsPerHour, chargeMagnetImpactResolved, chaosTotemImpactForChart]);

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
      chaosTotemImpact?: number;
      stonksChestsPerHour?: number;
      game_speed_multiplier?: number;
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
    ext.game_speed_multiplier = getGameSpeedMultiplier(effectiveParams);
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [effectiveParams, gemBomb10xImpact, freebiesPerHour, freebieChestsPerHour, chaosTotemImpact, stonksChestsPerHour, founderSupplyDrop.itemChestsPerHour, external.gemBombGemsPerHourFromBombs, external.chaosTotem100FromBombs]);

  const STARGAZING_EXTERNAL_KEY = "obeliskfarm:web:stargazing_external.json";
  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(STARGAZING_EXTERNAL_KEY) ?? {};
    ext.founderSupplyDrop2xStarMinPerHour = founderSupplyDrop.starSpawn2xMinPerHour;
    ext.founderSupplyDropAutoCatch100MinPerHour = founderSupplyDrop.starAutoCatch100MinPerHour;
    saveJson(STARGAZING_EXTERNAL_KEY, ext);
  }, [founderSupplyDrop.starSpawn2xMinPerHour, founderSupplyDrop.starAutoCatch100MinPerHour]);

  useEffect(() => {
    const giftSushiPerHour = calculateGiftSushiPerHour(effectiveParams);
    const ext = loadJson<Record<string, unknown>>(FISHING_EXTERNAL_KEY) ?? {};
    ext.giftSushiPerHour = giftSushiPerHour;
    saveJson(FISHING_EXTERNAL_KEY, ext);
  }, [effectiveParams]);

  const lootbugNetContribution = typeof external.lootbugGainsGross === "number"
    ? external.lootbugGainsGross - (external.lootbugTotalGemCostPerHour ?? 0)
    : (external.lootbugNetGemsPerHour ?? 0);
  const totalWithLootbugAndDroneFuel = (ev.total - ev.gem_bomb_gems) + bombContribution + lootbugNetContribution - external.droneFuelGemsPerHour + chargeMagnetImpactResolved;

  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(GEMEV_EXTERNAL_KEY) ?? {};
    ext.totalGemsPerHour = totalWithLootbugAndDroneFuel;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [totalWithLootbugAndDroneFuel]);

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

  const giftTooltip = useMemo(() => {
    const total = giftBreakdown.total || 0;
    const entries: Array<{ label: string; key: keyof typeof giftBreakdown; unit: "gems" | "fish" }> = [
      { label: "Gems (20-40)", key: "gems_20_40", unit: "gems" },
      { label: "Gems (30-65)", key: "gems_30_65", unit: "gems" },
      { label: "Skill Shards", key: "skill_shards", unit: "gems" },
      { label: "Item Chests", key: "item_chests", unit: "gems" },
      { label: "Chaos Totem", key: "chaos_totem", unit: "gems" },
      { label: "Charge Magnet", key: "charge_magnet", unit: "gems" },
      { label: "5× Fishing Tick Chance", key: "fishing_tick", unit: "gems" },
      { label: "Rare Roll Gems", key: "rare_gems", unit: "gems" },
      { label: "Drone Fuel", key: "drone_fuel", unit: "gems" },
      { label: "Skin (80-130 Gems)", key: "skin", unit: "gems" },
      { label: "Sushi (fish)", key: "sushi_fish", unit: "fish" },
      { label: "Recursive Gifts", key: "recursive_gifts", unit: "gems" },
    ];
    return {
      title: "Gift-EV (per 1 opened gift)",
      sections: [
        {
          heading: "Breakdown (value + share)",
          lines: entries
            .filter(({ key }) => (giftBreakdown[key] ?? 0) > 0)
            .map(({ label, key, unit }) => {
              const v = Number(giftBreakdown[key] ?? 0);
              return unit === "fish"
                ? `• ${label}: ${fmt1(v)} fish`
                : `• ${label}: ${fmt1(v)} Gems (${fmtPct(v, total)})`;
            }),
        },
        {
          heading: "Total",
          lines: [`• ${fmt1(total)} Gems per Gift`],
        },
      ],
    };
  }, [giftBreakdown]);

  const freebieInfo = useMemo(
    () => ({
      title: "FREEBIE Parameters",
      sections: [
        { heading: "Base", lines: ["Freebie Gems (Base), Freebie Timer, Claim % (per day)."] },
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
        { heading: "Rewards (assumptions)", lines: ["Founder Gems: fixed 10 Gems/drop", "Founder Speed: 2× for 5 minutes (time saved → more freebies)", "1/1234 chance: 10 gifts per supply drop"] },
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
          <div className="badge">Freebies • Founder</div>
        </div>

        <div className="panel panelResults">
            <div className="panelHeader">
              <h2 className="panelTitle">Results</h2>
              <p className="panelHint">Updates instantly.</p>
            </div>

            <div className="kv" style={{ background: "rgba(227,242,253,0.65)" }}>
              <kbd>TOTAL</kbd>
              <div className="mono" style={{ fontWeight: 900 }}>
                {fmt1(totalWithLootbugAndDroneFuel)} Gem-Equivalent/h
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
                <span style={{ fontWeight: 900 }}>{fmt1(giftEv)} Gems per Gift</span>
                <Tooltip content={giftTooltip} label="?" />
              </div>
            </div>

            {!params.founder_enabled ? <div className="small" style={{ marginTop: 10 }}>FOUNDER is disabled: all founder-related contributions are set to 0.</div> : null}

            <div className="btnRow" style={{ marginTop: 12, alignItems: "center" }}>
              <button className="btn" type="button" onClick={() => setChartOpen(true)}>
                Overview chart
              </button>
              <Tooltip
                content={{
                  title: "Overview chart",
                  lines: ["Opens the stacked contributions bar chart (Base / Jackpot / Refresh). Bars left to right for readability on mobile."],
                }}
                label="?"
              />
            </div>
          </div>

        <div id="gemev-game-speed" className="gemEvSection gemEvGameObeliskSection">
            <div className="gemEvSectionHeader">
              <span className="gemEvSectionTitle">Game speed</span>
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
                  ],
                }}
                label="?"
              />
            </div>
            <div className="gemEvSectionBody gemEvGameSpeedSection">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1", minWidth: "200px" }}>
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
                  />
                </div>
                <div style={{ flex: "1", minWidth: "200px", display: "flex", alignItems: "center", gap: 6 }}>
                  <Stepper
                    label="Obelisk Level"
                    value={params.obelisk_level}
                    onChange={(v) => setParams((s) => ({ ...s, obelisk_level: clampInt(v, 0, 999) }))}
                    step={1}
                    min={0}
                    max={999}
                    inputMode="numeric"
                    decimals={0}
                  />
                  <Tooltip
                    content={{
                      title: "Obelisk Level",
                      lines: ["Affects bonus gems and Gift-EV multipliers (1 + Level × 0.08)."],
                    }}
                    label="?"
                  />
                </div>
              </div>
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
                    <span className="gemEvMarginal">+1 EV: {fmt1(marginal)} Gems/h</span>
                  </>
                }
                value={params.freebie_gems_base}
                onChange={(v) => setParams((s) => ({ ...s, freebie_gems_base: v }))}
                step={1}
                min={0}
                max={9999}
                decimals={1}
              />
              <div className="gemEvInlineHead">
                <span className="mono">Freebie timer</span>
              </div>
              <Stepper
                label="Freebie Timer (min) base"
                value={params.freebie_timer_minutes}
                onChange={(v) => setParams((s) => ({ ...s, freebie_timer_minutes: v }))}
                step={0.5}
                min={0.1}
                max={9999}
                decimals={1}
              />
              <div className="gemEvRow gemEvEffectiveTimerGlow">
                <span className="mono small">→ Effective freebie timer</span>
                <span className="mono small">{getEffectiveFreebieTimerMinutes(effectiveParams).toFixed(1)} min</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1", minWidth: 0 }}>
                  <Stepper
                    label="Freebie Claim (% per Day)"
                    value={params.freebie_claim_percentage}
                    onChange={(v) => setParams((s) => ({ ...s, freebie_claim_percentage: v }))}
                    step={1}
                    min={0}
                    max={100}
                    decimals={1}
                    showButtons={false}
                  />
                </div>
                <Tooltip
                  content={{
                    title: "Freebie Claim %",
                    lines: [
                      "Affects only the Freebie Gems (base) bar. Other bars use full freebie rate.",
                      "Example: enter 66 if you do not claim freebies at night (premise: 8 h sleep → 16 h claim per day ≈ 66%).",
                    ],
                  }}
                  label="?"
                />
              </div>

              <div className="gemEvDivider" />

              <div className="gemEvInlineHead">
                <span className="mono">Jackpot (Freebie)</span>
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

                  {/* Tier 2: Super Stonks (medium green) */}
                  <div className="gemEvStonksTier gemEvStonksTier2">
                    <div className="gemEvInlineHead">
                      <span className="mono">Super Stonks</span>
                      <Tooltip
                        content={{
                          title: "Super Stonks",
                          lines: ["Only rolls when Stonks triggered on the same claim (first roll)."],
                        }}
                        label="?"
                      />
                    </div>
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

                  {/* Tier 3: Ultra Stonks (darkest green) */}
                  <div className="gemEvStonksTier gemEvStonksTier3">
                    <div className="gemEvInlineHead">
                      <span className="mono">Ultra Stonks</span>
                      <Tooltip
                        content={{
                          title: "Ultra Stonks",
                          lines: ["Only rolls when Super Stonks triggered on the same claim."],
                        }}
                        label="?"
                      />
                    </div>
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
            </div>
          </Collapsible>

          <Collapsible
            id="gemev-founder"
            title="Founder / VIP"
            defaultExpanded={false}
            className="gemEvSection tierHeader2"
            headerRight={
              <>
                <Sprite path="sprites/event/founderbomb.png" alt="Founder" className="iconSmall" />
                <Tooltip content={founderInfo} />
                <label className="toggle" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(params.founder_enabled)}
                    onChange={(e) => setParams((s) => ({ ...s, founder_enabled: e.target.checked }))}
                  />
                  FOUNDER enabled
                </label>
              </>
            }
          >
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
            </div>
          </Collapsible>

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
                <div className="modalWindow" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="modalHeader">
                    <div>
                      <div id="gift-ev-modal-title" className="mono" style={{ fontWeight: 900 }}>
                        Gift EV breakdown — {fmt1(giftEv)} Gems per Gift
                      </div>
                      <div className="small">Bars sorted by Gem EV (descending). All values include Obelisk × Lucky multipliers.</div>
                    </div>
                    <button className="btn btnSecondary" type="button" onClick={() => setGiftChartOpen(false)}>
                      Close
                    </button>
                  </div>
                  <div className="modalBody">
                    <div className="gemEvChartBlock">
                      <GiftEvChart breakdown={giftBreakdown} />
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

