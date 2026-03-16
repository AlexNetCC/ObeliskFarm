// Ported from ObeliskGemEV/freebie_ev_calculator.py (Gem EV + Gift EV).
//
// Intent: match desktop math 1:1 (including the bomb refill recursion).
// Keep this file pure (no DOM / localStorage).
//
// NOTE: User-facing text should live in the React module; keep this file logic-only.
export type GameParameters = {
  // Master toggle for all founder-related contributions (supply drop + founder bomb + founder-speed effects)
  founder_enabled: boolean;

  // Base freebie parameters
  freebie_gems_base: number;
  freebie_timer_minutes: number;
  /** Freebie timer upgrades: each level reduces the freebie timer by 1 second. Applied to base before game speed. */
  freebie_timer_upgrade_level?: number;
  /** Game speed as × (e.g. 2 = 2×). 1 = use VIP T10–T12; >1 = override. Freebie/bomb time = base / multiplier. */
  game_speed_multiplier: number;

  // Skill shards
  skill_shard_chance: number; // 0..1
  skill_shard_value_gems: number;

  // Stonks (only on first roll per claim; Super only when Stonks hit, Ultra only when Super hit)
  stonks_chance: number; // 0..1
  stonks_bonus_gems: number;
  stonks_multiplier: number; // e.g. 2.1
  super_stonks_chance: number; // 0..1, conditional on Stonks
  super_stonks_bonus_gems: number;
  super_stonks_multiplier: number;
  ultra_stonks_chance: number; // 0..1, conditional on Super Stonks
  ultra_stonks_bonus_gems: number;
  ultra_stonks_multiplier: number;
  stonks_all_multiplier: number; // applied to sum of all three

  // Jackpot
  jackpot_chance: number; // 0..1
  jackpot_rolls: number; // int

  // Refresh
  instant_refresh_chance: number; // 0..1

  /** Relic Chests from freebie (Construct): chance per normal roll, bonus chance per normal roll (best case 2). Jackpot = 10 relics. Same freebie/refresh as Item Chests. */
  freebie_relic_chance?: number; // 0..1
  freebie_bonus_relic_chance?: number; // 0..1

  // Founder supply drop (VIP Lounge tiers 1..12)
  vip_lounge_level: number; // 1..12
  founder_gems_base: number; // per supply drop (e.g. 30)
  founder_gems_chance: number; // fixed 0.01 in desktop
  obelisk_level: number;
  founder_speed_multiplier: number; // fixed 2.0 in desktop
  founder_speed_duration_minutes: number; // fixed 5.0 in desktop

  // Bombs - general
  free_bomb_chance: number; // 0..1
  total_bomb_types: number; // int; derived from checkboxes when using UI (10 + founder + veinmorph + megabomb, max 13)
  include_founder_bomb_in_total: boolean;
  has_veinmorph_bomb: boolean;
  has_megabomb: boolean;
  bomb_cycle: "early" | "late"; // early: Cherry → Battery → D20 → Gem; late: Cherry → Gem → Battery → D20

  // Recharge cards (0 none, 1 card, 2 gilded, 3 polychrome)
  gem_bomb_recharge_card_level: number;
  cherry_bomb_recharge_card_level: number;
  battery_bomb_recharge_card_level: number;
  d20_bomb_recharge_card_level: number;
  founder_bomb_recharge_card_level: number;

  // Gem Bomb
  gem_bomb_recharge_seconds: number;
  gem_bomb_gem_chance: number; // 0..1

  // Cherry Bomb
  cherry_bomb_recharge_seconds: number;
  cherry_bomb_triple_charge_chance: number; // 0..1

  // Battery Bomb
  battery_bomb_recharge_seconds: number;
  battery_bomb_charges_per_charge: number; // fixed 2.0 in desktop
  battery_bomb_cap_increase_chance: number; // fixed 0.001 in desktop (tooltip only)

  // D20 Bomb
  d20_bomb_recharge_seconds: number;
  d20_bomb_refill_chance: number; // 0..1
  d20_bomb_charges_distributed: number; // int

  // Founder Bomb
  founder_bomb_interval_seconds: number;
  founder_bomb_charges_per_drop: number; // fixed 2.0 in desktop
  founder_bomb_speed_chance: number; // 0..1
  founder_bomb_speed_multiplier: number;
  founder_bomb_speed_duration_seconds: number;

  /** Optional: combined Lootbug + Drone 10× Bomb Recharge min/h. When set, effective bomb recharge is divided by (1 + 9×uptime) so 60 min/h ⇒ ÷10. */
  bomb_recharge_10x_min_per_hour?: number;

  /** Optional: Chaos Totem uptime fraction 0..1 (Bomb Recharge Rate 2× when active). Multiplicative with other bomb recharge effects. */
  chaos_totem_uptime?: number;

  /** Statue of Soprano (Praed): 0 = none, 1 = Normal, 2 = Gilded, 3 = Platinized. Adds Freebie Gift Chance and 100× chance on freebie claims. */
  statue_soprano_level?: number;

  /** Gift EV overrides (from external modules). Time boosts are no longer converted to Gems. */
  gift_item_chest_value?: number; // Value per 1 Item Chest (Gems/h), from Items
  gift_chaos_totem_100_from_bombs?: boolean; // When true, Chaos Totem from gift = 0
  gift_chaos_totem_value_per_totem?: number; // When chaos not 100%, value per totem (Gems/h)
  gift_fishing_unlocked?: boolean; // When true, use fishing tick value instead of Charge Magnet for 12–20 Charge Magnets outcome
  gift_charge_magnet_value_per_magnet?: number; // When fishing not unlocked, value per 1 Charge Magnet (Gems/h)
  gift_fishing_tick_value?: number; // When fishing unlocked: Gems value of 12.5 min of 5× Fishing Tick Chance. Must reflect actual fish gain during the buff (i.e. include the 5× tick effect, e.g. +25% or equivalent).
  /** Fish per hour during 5× Tick Chance buff (from Fishing). Used for Gift chart: fish gains from that buff per gift. */
  gift_fish_per_hour_during_5x_buff?: number;
  /** Drone Fuel: value per 1 Fuel in Gems. Default 5. */
  gift_drone_fuel_gems_per_fuel?: number;
  /** Founder supply drop: flat fishing ticks (28 per drop). Gems value per one fishing tick. When set, founder EV includes 28 × this per drop. */
  founder_fishing_tick_gem_value?: number;
  /** Sushi: fish EV per 1 Sushi (from Fishing module). Sushi only affects fish gain, not Gem EV total. */
  gift_sushi_fish_per_sushi?: number;

  /** Gift rare rolls (wiki Store#Gifts): Lootfrogs/Black Hole unlocked for Frogspawn 1/25 (same unlock). */
  gift_black_hole_unlocked?: boolean;
  /** Idol Tokens rare: quantity × (Ascension Level + 1). Default 1 if unset. */
  gift_ascension_level?: number;
  /** Gem value per Frogspawn for Gift rare (1–2, avg 1.5; 1/25 when Lootfrogs unlocked). 1 Frogspawn = max capacity Lootfrogs; from Drone (lootfrogValuePerFrogspawn) when available. */
  gift_frogspawn_gem_value?: number;
  gift_forbidden_sushi_gem_value?: number;
  gift_cosmic_candy_gem_value?: number;

  /** Chain Bomber Drone (from Drone module): +X% Golden Floor Multi during buff. When set, stonks mult is scaled by (1 + uptime × bonus/100). */
  chain_bomber_golden_floor_bonus_pct?: number;
  chain_bomber_buff_uptime_fraction?: number;

  /** W3 floor debuff: −30% game speed (70% effective) while on W3 floors. Only affects freebie cooldown and bomb recharge; not supply drop or Stargazing. */
  w3_floor_debuff?: boolean;

  /** Lootfrogs unlocked (from Drone). When true, supply drop can roll 1/500 for 5 Frogspawn; relevant for Lootfrog. */
  lootfrogs_unlocked?: boolean;

  /** Founder supply drop jackpots (wiki Founder#Jackpots). Optional gem value per chest for EV. */
  founder_mythic_chest_gem_value?: number;
  founder_relic_chest_gem_value?: number;
  founder_divine_chest_gem_value?: number;

  /** Founder supply drop base amounts (wiki Founder#Founder_Supply_Drop). When set, per-drop amounts use "× Worlds Unlocked" formulas. */
  founder_worlds_unlocked?: number; // 1–4
  /** Arch ticks per drop = (3 × stage) + 50 when Archaeology unlocked. */
  founder_arch_highest_stage?: number;
  /** Fishing ticks per drop = 0.5 × this (direct tick reduction stat). Tripled when 3× Fishing Tick Speed buff active. */
  founder_fishing_tick_reduction?: number;
  /** When true, supply drop gives 8 min Star Auto-Catch buff; when false, gives 5 min 3× Exp (Auto-Catch ≥ 100%). */
  founder_star_auto_catch_below_100?: boolean;
};

export function defaultGameParameters(): GameParameters {
  return {
    founder_enabled: false,
    freebie_gems_base: 9.0,
    freebie_timer_minutes: 7.0,
    game_speed_multiplier: 1.0,
    skill_shard_chance: 0.12,
    skill_shard_value_gems: 12.5,
    stonks_chance: 0.01,
    stonks_bonus_gems: 200.0,
    stonks_multiplier: 1.0,
    super_stonks_chance: 0.0,
    super_stonks_bonus_gems: 0.0,
    super_stonks_multiplier: 1.0,
    ultra_stonks_chance: 0.0,
    ultra_stonks_bonus_gems: 0.0,
    ultra_stonks_multiplier: 1.0,
    stonks_all_multiplier: 1.0,
    jackpot_chance: 0.08, // 5% + 3%
    jackpot_rolls: 5,
    instant_refresh_chance: 0.05,
    vip_lounge_level: 3,
    founder_gems_base: 30.0,
    founder_gems_chance: 0.01,
    obelisk_level: 29,
    founder_speed_multiplier: 2.0,
    founder_speed_duration_minutes: 5.0,
    free_bomb_chance: 0.16,
    total_bomb_types: 12,
    include_founder_bomb_in_total: true,
    has_veinmorph_bomb: true,
    has_megabomb: false,
    bomb_cycle: "early",
    gem_bomb_recharge_card_level: 0,
    cherry_bomb_recharge_card_level: 0,
    battery_bomb_recharge_card_level: 0,
    d20_bomb_recharge_card_level: 0,
    founder_bomb_recharge_card_level: 0,
    gem_bomb_recharge_seconds: 46.0,
    gem_bomb_gem_chance: 0.03,
    cherry_bomb_recharge_seconds: 48.0,
    cherry_bomb_triple_charge_chance: 0.0,
    battery_bomb_recharge_seconds: 31.0,
    battery_bomb_charges_per_charge: 2.0,
    battery_bomb_cap_increase_chance: 0.001,
    d20_bomb_recharge_seconds: 36.0,
    d20_bomb_refill_chance: 0.05,
    d20_bomb_charges_distributed: 42,
    founder_bomb_interval_seconds: 87.0,
    founder_bomb_charges_per_drop: 2.0,
    founder_bomb_speed_chance: 0.10,
  founder_bomb_speed_multiplier: 2.0,
  founder_bomb_speed_duration_seconds: 10.0,
  statue_soprano_level: 0,
  };
}

/** Statue of Soprano (Praed) config: Freebie Gift Chance (0..1) and 100× chance (0..1) per level. */
const STATUE_SOPRANO_CONFIG: Record<number, { freebieGiftChance: number; freebie100xChance: number }> = {
  0: { freebieGiftChance: 0, freebie100xChance: 0 },
  1: { freebieGiftChance: 0.005, freebie100xChance: 1 / 50000 },
  2: { freebieGiftChance: 0.0075, freebie100xChance: 1 / 35000 },
  3: { freebieGiftChance: 0.01, freebie100xChance: 1 / 25000 },
};

/** Gifts per hour from Statue of Soprano. Gift rolls once per freebie claim (like Stonks), not per roll; jackpot does not multiply gift rolls. 1-Gift and 100-Gift are separate rolls (both can hit → max 101). */
export function calculateStatueSopranoGiftsPerHour(params: GameParameters): number {
  const level = Math.max(0, Math.min(3, clampInt(params.statue_soprano_level ?? 0, 0)));
  const cfg = STATUE_SOPRANO_CONFIG[level];
  if (!cfg || (cfg.freebieGiftChance === 0 && cfg.freebie100xChance === 0)) return 0;
  const freebiesPerHour = calculateFreebiesPerHour(params);
  const refreshMult = calculateRefreshMultiplier(params);
  const giftRollsPerHour = freebiesPerHour * refreshMult;
  const expectedGiftsPerClaim = cfg.freebieGiftChance * 1 + cfg.freebie100xChance * 100;
  return giftRollsPerHour * expectedGiftsPerClaim;
}

/** Gem EV per hour from Statue of Soprano (Freebie Gift Chance + 100× on freebie claims). Returns 0 when level 0. */
export function calculateStatueSopranoGiftEvPerHour(params: GameParameters): number {
  const giftsPerHour = calculateStatueSopranoGiftsPerHour(params);
  if (giftsPerHour <= 0) return 0;
  const giftEvPerGift = calculateGiftEvPerGift(params);
  return giftsPerHour * giftEvPerGift;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function clampPositive(x: number, fallback = 0): number {
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, x);
}

function clampInt(x: number, fallback = 0): number {
  if (!Number.isFinite(x)) return fallback;
  return Math.trunc(x);
}

function rechargeChargeMultiplier(cardLevel: number): number {
  // Matches FreebieEVCalculator._get_recharge_charge_multiplier
  const lvl = clampInt(cardLevel, 0);
  if (lvl === 1) return 1.5;
  if (lvl === 2) return 2.0;
  if (lvl === 3) return 3.0;
  return 1.0;
}

export function getFounderDropIntervalMinutes(params: GameParameters): number {
  const lvl = Math.max(1, Math.min(12, clampInt(params.vip_lounge_level, 3)));
  return 60.0 - 2.0 * (lvl - 1);
}

/**
 * Linear VIP multiplier for supply drop quantities when NOT using wiki worlds-unlocked table.
 * mult = 1 + (level - 1) * SUPPLY_DROP_QUANTITY_PER_LEVEL.
 */
const SUPPLY_DROP_QUANTITY_PER_LEVEL = 0.05;

export function getSupplyDropQuantityMultiplier(params: GameParameters): number {
  const lvl = Math.max(1, Math.min(12, clampInt(params.vip_lounge_level, 3)));
  return 1.0 + (lvl - 1) * SUPPLY_DROP_QUANTITY_PER_LEVEL;
}

/** Per-drop quantities when founder_worlds_unlocked is not set (legacy VIP-scaled). */
const FOUNDER_SUPPLY_DROP_CHERRY_BASE = 315;
const FOUNDER_SUPPLY_DROP_CHERRY_PER_LEVEL = 135;
const FOUNDER_SUPPLY_DROP_FISHING_BASE = 16;
const FOUNDER_SUPPLY_DROP_FISHING_PER_LEVEL = 4;
const FOUNDER_SUPPLY_DROP_ARCH_BASE = 167;
const FOUNDER_SUPPLY_DROP_ARCH_PER_LEVEL = 9;

const FOUNDER_SUPPLY_DROP_CHERRY_PER_DROP_LEGACY = (lvl: number) =>
  FOUNDER_SUPPLY_DROP_CHERRY_BASE + (lvl - 1) * FOUNDER_SUPPLY_DROP_CHERRY_PER_LEVEL;
const FOUNDER_SUPPLY_DROP_FISHING_TICKS_PER_DROP_LEGACY = (lvl: number) =>
  FOUNDER_SUPPLY_DROP_FISHING_BASE + (lvl - 1) * FOUNDER_SUPPLY_DROP_FISHING_PER_LEVEL;
const FOUNDER_SUPPLY_DROP_ARCH_TICKS_PER_DROP_LEGACY = (lvl: number) =>
  FOUNDER_SUPPLY_DROP_ARCH_BASE + (lvl - 1) * FOUNDER_SUPPLY_DROP_ARCH_PER_LEVEL;

/**
 * Per supply drop (wiki Founder#Founder_Supply_Drop). When founder_worlds_unlocked is set (1–4), amounts use
 * "× Worlds Unlocked" formulas. Otherwise legacy VIP-scaled values. Golden crates (T11): 5× each reward.
 * Jackpot: 1/500 Relic (Obelisk×3+10), 1/500 Frogspawn (5), etc.
 */
export interface FounderSupplyDropPerHour {
  itemChestsPerHour: number;
  cherryChargesPerHour: number;
  relicChestsPerHour: number;
  fuelPerHour: number;
  fishingTicksPerHour: number;
  archaeologyTicksPerHour: number;
  /** Expected frogspawn per hour from supply drop (1/500 × 5 per drop), only when lootfrogs_unlocked. */
  frogspawnPerHour: number;
  starSpawn2xMinPerHour: number;
  starAutoCatch100MinPerHour: number;
}

export function getFounderSupplyDropPerHour(params: GameParameters): FounderSupplyDropPerHour {
  const zero = {
    itemChestsPerHour: 0,
    cherryChargesPerHour: 0,
    relicChestsPerHour: 0,
    fuelPerHour: 0,
    fishingTicksPerHour: 0,
    archaeologyTicksPerHour: 0,
    frogspawnPerHour: 0,
    starSpawn2xMinPerHour: 0,
    starAutoCatch100MinPerHour: 0,
  };
  if (!params.founder_enabled) return zero;
  const founderDropInterval = getFounderDropIntervalMinutes(params);
  const founderDropsPerHour = 60.0 / founderDropInterval;
  const doubleChance = clamp01(getDoubleDropChance(params));
  const tripleChance = clamp01(getTripleDropChance(params));
  const singleChance = 1.0 - doubleChance - tripleChance;
  const expectedDropsPerEvent = 1.0 * singleChance + 2.0 * doubleChance + 3.0 * tripleChance;
  const eventsPerHour = founderDropsPerHour * expectedDropsPerEvent;
  const goldenChance = getGoldenSupplyDropChance(params);
  const goldenMult = 1.0 + 4.0 * goldenChance;
  const obelisk = Math.max(0, Math.trunc(params.obelisk_level ?? 0));
  const relicJackpotPerDrop = (1 / 500) * (obelisk * 3 + 10);

  const useWiki =
    typeof params.founder_worlds_unlocked === "number" &&
    params.founder_worlds_unlocked >= 1 &&
    params.founder_worlds_unlocked <= 4;
  const w = useWiki ? Math.max(1, Math.min(4, Math.trunc(params.founder_worlds_unlocked ?? 2))) : 1;

  let itemChestsPerDrop: number;
  let relicBasePerDrop: number;
  let cherryPerDrop: number;
  let fuelPerDrop: number;
  let fishingPerDrop: number;
  let archPerDrop: number;
  let star2xMinPerDrop: number;
  let starAutoCatch100MinPerDrop: number;

  if (useWiki) {
    itemChestsPerDrop = 2 * w;
    relicBasePerDrop = 1 * w;
    cherryPerDrop = Math.max(50, 5 * w * obelisk);
    fuelPerDrop = 1 * w;
    star2xMinPerDrop = 4 * w;
    starAutoCatch100MinPerDrop = params.founder_star_auto_catch_below_100 === true ? 8 * w : 0;
    archPerDrop =
      typeof params.founder_arch_highest_stage === "number" && params.founder_arch_highest_stage >= 0
        ? 3 * params.founder_arch_highest_stage + 50
        : 0;
    const directReduction = params.founder_fishing_tick_reduction ?? 0;
    fishingPerDrop = 0.5 * directReduction;
  } else {
    const qtyMult = getSupplyDropQuantityMultiplier(params);
    const lvl = Math.max(1, Math.min(12, clampInt(params.vip_lounge_level, 3)));
    itemChestsPerDrop = 6 * qtyMult;
    relicBasePerDrop = 3 * qtyMult;
    cherryPerDrop = FOUNDER_SUPPLY_DROP_CHERRY_PER_DROP_LEGACY(lvl);
    fuelPerDrop = 3 * qtyMult;
    fishingPerDrop = FOUNDER_SUPPLY_DROP_FISHING_TICKS_PER_DROP_LEGACY(lvl);
    archPerDrop = FOUNDER_SUPPLY_DROP_ARCH_TICKS_PER_DROP_LEGACY(lvl);
    star2xMinPerDrop = 12;
    starAutoCatch100MinPerDrop = 0;
  }

  const relicChestsPerDrop = relicBasePerDrop + relicJackpotPerDrop;
  const lootfrogsUnlocked = Boolean(params.lootfrogs_unlocked);
  const frogspawnPerHour = lootfrogsUnlocked ? eventsPerHour * (1 / 500) * 5 * goldenMult : 0;

  return {
    itemChestsPerHour: eventsPerHour * itemChestsPerDrop * goldenMult,
    cherryChargesPerHour: eventsPerHour * cherryPerDrop * goldenMult,
    relicChestsPerHour: eventsPerHour * relicChestsPerDrop * goldenMult,
    fuelPerHour: eventsPerHour * fuelPerDrop * goldenMult,
    fishingTicksPerHour: eventsPerHour * fishingPerDrop * goldenMult,
    archaeologyTicksPerHour: eventsPerHour * archPerDrop * goldenMult,
    frogspawnPerHour,
    starSpawn2xMinPerHour: eventsPerHour * star2xMinPerDrop * goldenMult,
    starAutoCatch100MinPerHour: eventsPerHour * starAutoCatch100MinPerDrop * goldenMult,
  };
}

export function getDoubleDropChance(params: GameParameters): number {
  const lvl = Math.max(1, Math.min(12, clampInt(params.vip_lounge_level, 3)));
  if (lvl < 2) return 0.0;
  return 0.12 + 0.06 * (lvl - 2);
}

export function getTripleDropChance(params: GameParameters): number {
  const lvl = Math.max(1, Math.min(12, clampInt(params.vip_lounge_level, 3)));
  if (lvl < 7) return 0.0;
  return 0.16 + 0.08 * (lvl - 7); // T7=16%, T8=24%, ..., T12=56%
}

/** VIP T10: Game speed bonus (0.10–0.12). Used when user multiplier is 1×. */
function getVIPGameSpeedBonus(params: GameParameters): number {
  const lvl = Math.max(1, Math.min(12, clampInt(params.vip_lounge_level, 3)));
  if (lvl < 10) return 0.0;
  return (10 + (lvl - 10)) / 100.0; // T10=10%, T11=11%, T12=12%
}

/** Game speed as (multiplier - 1) for formulas: effectiveTime = base / (1 + bonus) = base / multiplier. Uses effective multiplier for time-affected systems (includes W3 debuff when active). Can be negative when W3 debuff is on. */
export function getGameSpeedBonus(params: GameParameters): number {
  const effectiveMult = getEffectiveGameSpeedMultiplierForTime(params);
  return effectiveMult - 1.0;
}

/** Effective game speed multiplier for display (1× = no bonus or VIP). Does not apply W3 floor debuff. */
export function getGameSpeedMultiplier(params: GameParameters): number {
  const mult = "game_speed_multiplier" in params ? clampPositive(params.game_speed_multiplier, 1.0) : 1.0;
  if (mult > 1.0) return mult;
  return 1.0 + getVIPGameSpeedBonus(params);
}

/** Effective game speed for time-affected systems (freebie cooldown, bomb recharge). Applies W3 floor debuff (×0.7) when active. Not used for supply drop or Stargazing. */
export function getEffectiveGameSpeedMultiplierForTime(params: GameParameters): number {
  const base = getGameSpeedMultiplier(params);
  const w3 = params.w3_floor_debuff === true;
  return base * (w3 ? 0.7 : 1.0);
}

/** Effective freebie timer (min): (base − upgrade_level×1s) / effective game speed (includes W3 debuff when active). */
export function getEffectiveFreebieTimerMinutes(params: GameParameters): number {
  const baseMinutes = clampPositive(params.freebie_timer_minutes, 7.0);
  const reductionSeconds = Math.max(0, Math.trunc(params.freebie_timer_upgrade_level ?? 0)) * 1;
  const base = Math.max(0.1 / 60, baseMinutes - reductionSeconds / 60);
  const mult = getEffectiveGameSpeedMultiplierForTime(params);
  return base / mult;
}

/** VIP T11: Golden Supply Drop 10%, +2% per tier. 5× normal drops, not rare rewards. Returns 0..0.12. */
export function getGoldenSupplyDropChance(params: GameParameters): number {
  const lvl = Math.max(1, Math.min(12, clampInt(params.vip_lounge_level, 3)));
  if (lvl < 11) return 0.0;
  return (10 + 2 * (lvl - 11)) / 100.0; // T11=10%, T12=12%
}

/** VIP T12: +0.5% Gem Bomb Gem Chance. */
export function getGemBombGemChanceT12Bonus(params: GameParameters): number {
  const lvl = Math.max(1, Math.min(12, clampInt(params.vip_lounge_level, 3)));
  return lvl >= 12 ? 0.005 : 0.0;
}

export function calculateExpectedRollsPerClaim(params: GameParameters): number {
  const normalRolls = 1.0;
  const jackpotRolls = clampPositive(params.jackpot_rolls, 5);
  const pJackpot = clamp01(params.jackpot_chance);
  return (1 - pJackpot) * normalRolls + pJackpot * jackpotRolls;
}

export function calculateRefreshMultiplier(params: GameParameters): number {
  const p = clamp01(params.instant_refresh_chance);
  if (p >= 1.0) return Number.POSITIVE_INFINITY;
  return 1.0 / (1.0 - p);
}

export function calculateTotalMultiplier(params: GameParameters): number {
  return calculateExpectedRollsPerClaim(params) * calculateRefreshMultiplier(params);
}

/** Freebie claims per hour at 100% claim rate (used for all bars except gems_base; gems_base applies claim %). */
export function calculateFreebiesPerHour(params: GameParameters): number {
  const minutesPerHour = 60.0;
  const baseMinutes = clampPositive(params.freebie_timer_minutes, 7.0);
  const reductionSeconds = Math.max(0, Math.trunc(params.freebie_timer_upgrade_level ?? 0)) * 1;
  const timer = Math.max(0.1 / 60, baseMinutes - reductionSeconds / 60);
  const gameSpeedBonus = getGameSpeedBonus(params); // VIP T10+: shortens freebie cooldown multiplicatively
  const effectiveTimer = timer / (1.0 + gameSpeedBonus);
  return minutesPerHour / effectiveTimer;
}

/** Expected freebie chests per hour: 1 roll = 1 chest, jackpot = 5 chests, refresh = +1 chest (extra roll). So freebiesPerHour × expectedRolls × refreshMult. */
export function calculateFreebieChestsPerHour(params: GameParameters): number {
  const freebiesPerHour = calculateFreebiesPerHour(params);
  const refreshMult = calculateRefreshMultiplier(params);
  const expectedRolls = calculateExpectedRollsPerClaim(params);
  return freebiesPerHour * expectedRolls * refreshMult;
}

/** Expected Relic Chests per hour from freebie (Construct). Normal roll: Relic Chance + Bonus Relic Chance (best case 2). Jackpot = 10 relics. Refresh same as Item Chests. */
export function calculateFreebieRelicChestsPerHour(params: GameParameters): number {
  const relicChance = clamp01(params.freebie_relic_chance ?? 0);
  const bonusChance = clamp01(params.freebie_bonus_relic_chance ?? 0);
  if (relicChance <= 0 && bonusChance <= 0) return 0;
  const freebiesPerHour = calculateFreebiesPerHour(params);
  const refreshMult = calculateRefreshMultiplier(params);
  const normalRolls = 1.0;
  const jackpotRolls = clampPositive(params.jackpot_rolls, 5);
  const pJackpot = clamp01(params.jackpot_chance);
  const expectedRelicPerClaim =
    (1 - pJackpot) * normalRolls * (relicChance + bonusChance) + pJackpot * jackpotRolls * 10;
  return freebiesPerHour * refreshMult * expectedRelicPerClaim;
}

export function calculateGemsBasePerHour(params: GameParameters): number {
  const freebiesPerHour = calculateFreebiesPerHour(params);
  const expectedRolls = calculateExpectedRollsPerClaim(params);
  const refreshMult = calculateRefreshMultiplier(params);
  return freebiesPerHour * refreshMult * expectedRolls * clampPositive(params.freebie_gems_base, 9.0);
}

export function calculateStonksEvPerHour(params: GameParameters): number {
  const freebiesPerHour = calculateFreebiesPerHour(params);
  const refreshMult = calculateRefreshMultiplier(params);
  const sc = clamp01(params.stonks_chance);
  const ssc = clamp01(params.super_stonks_chance ?? 0);
  const usc = clamp01(params.ultra_stonks_chance ?? 0);
  const stonksPerClaim =
    sc * clampPositive(params.stonks_bonus_gems, 200.0) * clampPositive(params.stonks_multiplier ?? 1.0, 0);
  const superPerClaim =
    sc * ssc * clampPositive(params.super_stonks_bonus_gems ?? 0, 0) * clampPositive(params.super_stonks_multiplier ?? 1.0, 0);
  const ultraPerClaim =
    sc * ssc * usc * clampPositive(params.ultra_stonks_bonus_gems ?? 0, 0) * clampPositive(params.ultra_stonks_multiplier ?? 1.0, 0);
  const sumPerClaim = stonksPerClaim + superPerClaim + ultraPerClaim;
  const allMult = clampPositive(params.stonks_all_multiplier ?? 1.0, 0);
  const bonusPct = params.chain_bomber_golden_floor_bonus_pct ?? 0;
  const uptime = Math.max(0, Math.min(1, params.chain_bomber_buff_uptime_fraction ?? 0));
  const chainBomberMult = 1 + (bonusPct / 100) * uptime;
  return freebiesPerHour * refreshMult * sumPerClaim * allMult * chainBomberMult;
}

/** Expected Item Chests per hour from stonks procs. In-game: base stonks 20 chests; super/ultra same base per proc, each tier uses its multiplier. */
const STONKS_CHESTS_BASE = 20;

/** Base relic chests per stonks proc (in-game: 10). Same formula as item chests but with 10 instead of 20. */
const STONKS_RELIC_CHESTS_BASE = 10;

/** Refresh: instant refresh gives extra rolls per hour (more stonks chances), same as stonks gems. Stonks has no jackpot (procs on first roll per claim). */
export function calculateStonksChestsPerHour(params: GameParameters): number {
  const freebiesPerHour = calculateFreebiesPerHour(params);
  const refreshMult = calculateRefreshMultiplier(params);
  const sc = clamp01(params.stonks_chance);
  const ssc = clamp01(params.super_stonks_chance ?? 0);
  const usc = clamp01(params.ultra_stonks_chance ?? 0);
  const stonksMult = clampPositive(params.stonks_multiplier ?? 1.0, 0);
  const superMult = clampPositive(params.super_stonks_multiplier ?? 1.0, 0);
  const ultraMult = clampPositive(params.ultra_stonks_multiplier ?? 1.0, 0);
  const allMult = clampPositive(params.stonks_all_multiplier ?? 1.0, 0);
  const effectiveRate = freebiesPerHour * refreshMult;
  const baseChests = effectiveRate * sc * STONKS_CHESTS_BASE * stonksMult;
  const superChests = effectiveRate * sc * ssc * STONKS_CHESTS_BASE * superMult;
  const ultraChests = effectiveRate * sc * ssc * usc * STONKS_CHESTS_BASE * ultraMult;
  const bonusPct = params.chain_bomber_golden_floor_bonus_pct ?? 0;
  const uptime = Math.max(0, Math.min(1, params.chain_bomber_buff_uptime_fraction ?? 0));
  const chainBomberMult = 1 + (bonusPct / 100) * uptime;
  return (baseChests + superChests + ultraChests) * allMult * chainBomberMult;
}

/** Expected Relic Chests per hour from stonks procs. In-game: base 10 relic chests per stonks proc; super/ultra same base, each tier uses its multiplier. */
export function calculateStonksRelicChestsPerHour(params: GameParameters): number {
  const freebiesPerHour = calculateFreebiesPerHour(params);
  const refreshMult = calculateRefreshMultiplier(params);
  const sc = clamp01(params.stonks_chance);
  const ssc = clamp01(params.super_stonks_chance ?? 0);
  const usc = clamp01(params.ultra_stonks_chance ?? 0);
  const stonksMult = clampPositive(params.stonks_multiplier ?? 1.0, 0);
  const superMult = clampPositive(params.super_stonks_multiplier ?? 1.0, 0);
  const ultraMult = clampPositive(params.ultra_stonks_multiplier ?? 1.0, 0);
  const allMult = clampPositive(params.stonks_all_multiplier ?? 1.0, 0);
  const effectiveRate = freebiesPerHour * refreshMult;
  const baseRelics = effectiveRate * sc * STONKS_RELIC_CHESTS_BASE * stonksMult;
  const superRelics = effectiveRate * sc * ssc * STONKS_RELIC_CHESTS_BASE * superMult;
  const ultraRelics = effectiveRate * sc * ssc * usc * STONKS_RELIC_CHESTS_BASE * ultraMult;
  const bonusPct = params.chain_bomber_golden_floor_bonus_pct ?? 0;
  const uptime = Math.max(0, Math.min(1, params.chain_bomber_buff_uptime_fraction ?? 0));
  const chainBomberMult = 1 + (bonusPct / 100) * uptime;
  return (baseRelics + superRelics + ultraRelics) * allMult * chainBomberMult;
}

export function calculateSkillShardsEvPerHour(params: GameParameters): number {
  const freebiesPerHour = calculateFreebiesPerHour(params);
  const expectedRolls = calculateExpectedRollsPerClaim(params);
  const refreshMult = calculateRefreshMultiplier(params);
  return (
    freebiesPerHour *
    refreshMult *
    expectedRolls *
    clamp01(params.skill_shard_chance) *
    clampPositive(params.skill_shard_value_gems, 12.5)
  );
}

/** Founder supply drop 2× speed boost: no longer in EV (user sets Game Speed at top). */
export function calculateFounderSpeedBoostPerHour(_params: GameParameters): number {
  return 0;
}

export function calculateObeliskMultiplier(params: GameParameters): number {
  return 1.0 + clampPositive(params.obelisk_level, 29) * 0.08;
}

export function calculateLuckyMultiplier(): number {
  // Matches python: two independent rolls (1/20 for 3x, 1/2500 for 50x)
  const neither = (19 / 20) * (2499 / 2500);
  const threeX = (1 / 20) * (2499 / 2500);
  const fiftyX = (19 / 20) * (1 / 2500);
  const both = (1 / 20) * (1 / 2500);
  return neither * 1.0 + threeX * 3.0 + fiftyX * 50.0 + both * 150.0;
}

export function convertTimeBoostToGemEquivalent(params: GameParameters, minutes2xSpeed: number): number {
  // Matches python convert_time_boost_to_gem_equivalent (simplified: treat minutes as time saved).
  const timeSavedMinutes = clampPositive(minutes2xSpeed, 0);
  const timeSavedHours = timeSavedMinutes / 60.0;
  const additionalFreebies = timeSavedHours * (60.0 / clampPositive(params.freebie_timer_minutes, 7.0));
  const expectedRolls = calculateExpectedRollsPerClaim(params);
  const refreshMult = calculateRefreshMultiplier(params);
  return additionalFreebies * refreshMult * expectedRolls * clampPositive(params.freebie_gems_base, 9.0);
}

/** Expected Item Chests per Gift (wiki Store#Gifts). One of 12 basic outcomes: 25–40 Item Chests (avg 32.5). [1] Obelisk and Lucky apply. */
export function getExpectedItemChestsPerGift(params: GameParameters): number {
  const obelisk = clampPositive(params.obelisk_level ?? 0, 0);
  const probBasicRoll = getBasicRollProbability(obelisk, params.gift_black_hole_unlocked);
  const obeliskMult = calculateObeliskMultiplier(params);
  const luckyMult = calculateLuckyMultiplier();
  const chancePerItem = 1 / 12;
  const itemChestsAvg = 32.5;
  return probBasicRoll * chancePerItem * itemChestsAvg * obeliskMult * luckyMult;
}

/** Expected Relic Chests per Gift from basic outcomes (wiki Store#Gifts). Two of 12 basic outcomes: 3–5 (avg 4) and 5–10 (avg 7.5). [1] Obelisk mult applies. */
export function getExpectedRelicChestsPerGift(params: GameParameters): number {
  const obelisk = clampPositive(params.obelisk_level ?? 0, 0);
  const probBasicRoll = getBasicRollProbability(obelisk, params.gift_black_hole_unlocked);
  const obeliskMult = calculateObeliskMultiplier(params);
  const luckyMult = calculateLuckyMultiplier();
  const chancePerItem = 1 / 12;
  const avg3_5 = 4;
  const avg5_10 = 7.5;
  return probBasicRoll * chancePerItem * (avg3_5 + avg5_10) * obeliskMult * luckyMult;
}

/**
 * Probability that no rare wins (so the gift gives a basic-roll outcome). Same p array as computeRareRollWinProbs.
 * Wiki Store#Gifts: rare chain order and chances.
 */
export function getBasicRollProbability(obelisk: number, blackHoleUnlocked?: boolean): number {
  const p = getRareChanceArray(obelisk, blackHoleUnlocked);
  return p.reduce((acc, pi) => acc * (1 - pi), 1);
}

/** Rare chance array in wiki order (Store#Gifts). [3] Star: 23 ≤ Ob ≤ 59. [5] Frogspawn: Lootfrogs/Black Hole unlocked. */
function getRareChanceArray(obelisk: number, blackHoleUnlocked?: boolean): number[] {
  const starOk = obelisk >= 23 && obelisk <= 59;
  return [
    starOk ? 1 / 20 : 0, // 1. 60-90 min 2x Star Spawn
    1 / 40, // 2. 3 Gifts
    1 / 45, // 3. 80-130 Gems [1]
    1 / 100, // 4. Mythic Chest
    blackHoleUnlocked ? 1 / 25 : 0, // 5. 1-2 Frogspawn
    obelisk >= 37 ? 1 / 37 : 0, // 6. 6-12 Tier 2 Items
    obelisk >= 18 ? 1 / 30 : 0, // 7. Drone Fuel [4]
    obelisk >= 30 ? 1 / 33 : 0, // 8. 1-3 Idol Tokens [6]
    obelisk >= 37 ? 1 / 45 : 0, // 9. 15-24 Sushi [5]
    obelisk >= 37 ? 1 / 175 : 0, // 10. 50-60 Sushi [5]
    obelisk >= 60 ? 1 / 25 : 0, // 11. 15k-25k Gems
    obelisk >= 60 ? 1 / 1000 : 0, // 12. 1 Forbidden Sushi
    obelisk >= 60 ? 1 / 30 : 0, // 13. 1-2 Cosmic Candy
    1 / 200, // 14. Skin [7][8]
    1 / 2000, // 15. Gilded Skin [7][9]
    1 / 2500, // 16. Divine Chest
  ];
}

/** Rare roll chain: order matters, later replaces earlier. P(roll i wins) = p_i * ∏_{j>i}(1-p_j). Wiki Store#Gifts. */
function computeRareRollWinProbs(obelisk: number, blackHoleUnlocked?: boolean): {
  gifts3: number;
  gems80_130: number;
  droneFuel: number;
  sushi15_24: number;
  sushi50_60: number;
  skin: number;
  gildedSkin: number;
  gems15k_25k: number;
  frogspawn: number;
  forbiddenSushi: number;
  cosmicCandy: number;
} {
  const p = getRareChanceArray(obelisk, blackHoleUnlocked);
  const noReplace = p.map((_, i) => p.slice(i + 1).reduce((acc, pj) => acc * (1 - pj), 1));
  return {
    gifts3: p[1] * noReplace[1],
    gems80_130: p[2] * noReplace[2],
    droneFuel: p[6] * noReplace[6],
    sushi15_24: p[8] * noReplace[8],
    sushi50_60: p[9] * noReplace[9],
    skin: p[13] * noReplace[13],
    gildedSkin: p[14] * noReplace[14],
    gems15k_25k: p[10] * noReplace[10],
    frogspawn: p[4] * noReplace[4],
    forbiddenSushi: p[11] * noReplace[11],
    cosmicCandy: p[12] * noReplace[12],
  };
}

export function calculateGiftEvPerGift(params: GameParameters): number {
  const obeliskMult = calculateObeliskMultiplier(params);
  const luckyMult = calculateLuckyMultiplier();
  const skillShardValue = clampPositive(params.skill_shard_value_gems, 12.5);
  const chancePerItem = 1.0 / 12.0;
  const obelisk = clampPositive(params.obelisk_level, 0);
  const probBasicRoll = getBasicRollProbability(obelisk, params.gift_black_hole_unlocked);

  // 1) Base roll EV (wiki Store#Gifts first table). [1] = 1 + Obelisk×0.08. Rare replaces basic.
  const gems20_40 = 30.0;
  const gems20_50 = 35.0;
  const skillShardsBase = 3.5;
  const baseRollGems = probBasicRoll * chancePerItem * (gems20_40 + gems20_50);
  const baseRollShards = probBasicRoll * chancePerItem * skillShardsBase * skillShardValue;

  const itemChestsAvg = 32.5;
  const itemChestsEv = probBasicRoll * chancePerItem * itemChestsAvg * (params.gift_item_chest_value ?? 0);

  const chaosTotemAvg = 12.5;
  const chaosTotemEv = params.gift_chaos_totem_100_from_bombs
    ? 0
    : probBasicRoll * chancePerItem * chaosTotemAvg * (params.gift_chaos_totem_value_per_totem ?? 0);

  const chargeMagnetAvg = 16.0;
  const fishingTickEv = params.gift_fishing_unlocked ? probBasicRoll * chancePerItem * (params.gift_fishing_tick_value ?? 0) : 0;
  const chargeMagnetEv = !params.gift_fishing_unlocked
    ? probBasicRoll * chancePerItem * chargeMagnetAvg * (params.gift_charge_magnet_value_per_magnet ?? 0)
    : 0;

  // 2) Rare rolls (wiki Store#Gifts second table). [4] Drone Fuel = 5+2×Ob + random(-10..10) → avg 5+2×Ob.
  const rare = computeRareRollWinProbs(obelisk, params.gift_black_hole_unlocked);
  const gemsPerFuel = params.gift_drone_fuel_gems_per_fuel ?? 5;
  const droneFuelAvgQty = 5 + 2 * obelisk;
  const rareGemsEv = rare.gems80_130 * 105.0 * obeliskMult * luckyMult;
  const droneFuelEv = rare.droneFuel * droneFuelAvgQty * gemsPerFuel * obeliskMult * luckyMult;
  const skinEv = rare.skin * 105.0 * obeliskMult;

  const gems15k25kAvg = 20000.0;
  const gems15k25kEv = rare.gems15k_25k * gems15k25kAvg * obeliskMult * luckyMult;
  const frogspawnEv = rare.frogspawn * 1.5 * (params.gift_frogspawn_gem_value ?? 0);
  const forbiddenSushiEv = rare.forbiddenSushi * (params.gift_forbidden_sushi_gem_value ?? 0);
  const cosmicCandyAvgQty = 1.5;
  const cosmicCandyEv = rare.cosmicCandy * cosmicCandyAvgQty * (params.gift_cosmic_candy_gem_value ?? 0);

  const baseGemsWithMult = baseRollGems * obeliskMult * luckyMult;
  const baseShardsWithMult = baseRollShards * obeliskMult * luckyMult;
  const itemChestsWithMult = itemChestsEv * obeliskMult * luckyMult;
  const chaosTotemWithMult = chaosTotemEv * obeliskMult * luckyMult;
  const chargeMagnetWithMult = chargeMagnetEv * obeliskMult * luckyMult;
  const fishingTickWithMult = fishingTickEv * obeliskMult * luckyMult;

  const recursiveCoeff =
    rare.gifts3 * 3.0 * obeliskMult * luckyMult + rare.gildedSkin * 25.0 * obeliskMult * luckyMult;
  const A =
    baseGemsWithMult +
    baseShardsWithMult +
    itemChestsWithMult +
    chaosTotemWithMult +
    chargeMagnetWithMult +
    fishingTickWithMult +
    rareGemsEv +
    droneFuelEv +
    skinEv +
    gems15k25kEv +
    frogspawnEv +
    forbiddenSushiEv +
    cosmicCandyEv;
  if (recursiveCoeff >= 1.0) return A * 10.0;
  return A / (1.0 - recursiveCoeff);
}

export function calculateGiftEvBreakdown(params: GameParameters): Record<string, number> {
  const obeliskMult = calculateObeliskMultiplier(params);
  const luckyMult = calculateLuckyMultiplier();
  const skillShardValue = clampPositive(params.skill_shard_value_gems, 12.5);
  const chancePerItem = 1.0 / 12.0;
  const obelisk = clampPositive(params.obelisk_level, 0);
  const probBasicRoll = getBasicRollProbability(obelisk, params.gift_black_hole_unlocked);
  const gems20_40 = 30.0;
  const gems20_50 = 35.0;
  const skillShardsBase = 3.5;
  const itemChestsAvg = 32.5;
  const chaosTotemAvg = 12.5;
  const chargeMagnetAvg = 16.0;

  const gems20_40_final = probBasicRoll * chancePerItem * gems20_40 * obeliskMult * luckyMult;
  const gems20_50_final = probBasicRoll * chancePerItem * gems20_50 * obeliskMult * luckyMult;
  const skillShards_final = probBasicRoll * chancePerItem * skillShardsBase * skillShardValue * obeliskMult * luckyMult;
  const item_chests_final =
    probBasicRoll * chancePerItem * itemChestsAvg * (params.gift_item_chest_value ?? 0) * obeliskMult * luckyMult;
  const chaos_totem_final = params.gift_chaos_totem_100_from_bombs
    ? 0
    : probBasicRoll * chancePerItem * chaosTotemAvg * (params.gift_chaos_totem_value_per_totem ?? 0) * obeliskMult * luckyMult;
  const charge_magnet_final = !params.gift_fishing_unlocked
    ? probBasicRoll * chancePerItem * chargeMagnetAvg * (params.gift_charge_magnet_value_per_magnet ?? 0) * obeliskMult * luckyMult
    : 0;
  const fishing_tick_final = params.gift_fishing_unlocked
    ? probBasicRoll * chancePerItem * (params.gift_fishing_tick_value ?? 0) * obeliskMult * luckyMult
    : 0;

  const rare = computeRareRollWinProbs(obelisk, params.gift_black_hole_unlocked);
  const gemsPerFuel = params.gift_drone_fuel_gems_per_fuel ?? 5;
  const droneFuelAvgQty = 5 + 2 * obelisk;
  const rare_gems_final = rare.gems80_130 * 105.0 * obeliskMult * luckyMult;
  const drone_fuel_final = rare.droneFuel * droneFuelAvgQty * gemsPerFuel * obeliskMult * luckyMult;
  const skin_final = rare.skin * 105.0 * obeliskMult;

  const gems15k25k_final = rare.gems15k_25k * 20000.0 * obeliskMult * luckyMult;
  const frogspawn_final = rare.frogspawn * 1.5 * (params.gift_frogspawn_gem_value ?? 0);
  const forbidden_sushi_final = rare.forbiddenSushi * (params.gift_forbidden_sushi_gem_value ?? 0);
  const cosmic_candy_final = rare.cosmicCandy * 1.5 * (params.gift_cosmic_candy_gem_value ?? 0);

  const fishPerSushi = params.gift_sushi_fish_per_sushi ?? 0;
  const sushi_fish_final =
    (rare.sushi15_24 * 19.5 + rare.sushi50_60 * 55) * luckyMult * fishPerSushi;

  const giftEvTotal = calculateGiftEvPerGift(params);
  const A =
    gems20_40_final +
    gems20_50_final +
    skillShards_final +
    item_chests_final +
    chaos_totem_final +
    charge_magnet_final +
    fishing_tick_final +
    rare_gems_final +
    drone_fuel_final +
    skin_final +
    gems15k25k_final +
    frogspawn_final +
    forbidden_sushi_final +
    cosmic_candy_final;
  const recursiveGiftsContribution = giftEvTotal - A;

  const gems20_40_qty = probBasicRoll * chancePerItem * gems20_40 * obeliskMult * luckyMult;
  const gems20_50_qty = probBasicRoll * chancePerItem * gems20_50 * obeliskMult * luckyMult;
  const skillShards_qty = probBasicRoll * chancePerItem * skillShardsBase * obeliskMult * luckyMult;
  const itemChests_qty = probBasicRoll * chancePerItem * itemChestsAvg * obeliskMult * luckyMult;
  const chaosTotem_qty = params.gift_chaos_totem_100_from_bombs ? 0 : probBasicRoll * chancePerItem * chaosTotemAvg * obeliskMult * luckyMult;
  const chargeMagnet_qty = !params.gift_fishing_unlocked ? probBasicRoll * chancePerItem * chargeMagnetAvg * obeliskMult * luckyMult : 0;
  const fishingTick_min = params.gift_fishing_unlocked ? probBasicRoll * chancePerItem * 12.5 * obeliskMult * luckyMult : 0;
  const fishPerHourDuring5x = params.gift_fish_per_hour_during_5x_buff ?? 0;
  const fishing_tick_fish = fishPerHourDuring5x > 0 ? (fishingTick_min / 60) * fishPerHourDuring5x : 0;
  const rareGems_qty = rare.gems80_130 * 105 * obeliskMult * luckyMult;
  const droneFuel_qty = rare.droneFuel * droneFuelAvgQty * obeliskMult * luckyMult;
  const skin_qty = rare.skin * 105 * obeliskMult;
  const sushi_qty = (rare.sushi15_24 * 19.5 + rare.sushi50_60 * 55) * luckyMult;
  const recursiveGifts_qty = rare.gifts3 * 3 * obeliskMult * luckyMult + rare.gildedSkin * 25 * obeliskMult * luckyMult;
  const gems15k25k_qty = rare.gems15k_25k * 20000 * obeliskMult * luckyMult;

  const basicDropPct = (probBasicRoll * 100) / 12;
  return {
    gems_20_40: gems20_40_final,
    gems_20_50: gems20_50_final,
    skill_shards: skillShards_final,
    item_chests: item_chests_final,
    chaos_totem: chaos_totem_final,
    charge_magnet: charge_magnet_final,
    fishing_tick: fishing_tick_final,
    rare_gems: rare_gems_final,
    drone_fuel: drone_fuel_final,
    skin: skin_final,
    gems_15k_25k: gems15k25k_final,
    frogspawn: frogspawn_final,
    forbidden_sushi: forbidden_sushi_final,
    cosmic_candy: cosmic_candy_final,
    sushi_fish: sushi_fish_final,
    recursive_gifts: recursiveGiftsContribution,
    total: giftEvTotal,
    _qty: {
      gems_20_40: gems20_40_qty,
      gems_20_50: gems20_50_qty,
      skill_shards: skillShards_qty,
      item_chests: itemChests_qty,
      chaos_totem: chaosTotem_qty,
      charge_magnet: chargeMagnet_qty,
      fishing_tick: fishingTick_min,
      fishing_tick_fish: fishing_tick_fish,
      rare_gems: rareGems_qty,
      drone_fuel: droneFuel_qty,
      skin: skin_qty,
      sushi_fish: sushi_qty,
      recursive_gifts: recursiveGifts_qty,
      gems_15k_25k: gems15k25k_qty,
    } as Record<string, number>,
    _multipliers: {
      obeliskMult,
      luckyMult,
      obeliskLevel: obelisk,
    },
    _dropChancePct: {
      gems_20_40: basicDropPct,
      gems_20_50: basicDropPct,
      skill_shards: basicDropPct,
      item_chests: basicDropPct,
      chaos_totem: basicDropPct,
      charge_magnet: basicDropPct,
      fishing_tick: basicDropPct,
      rare_gems: rare.gems80_130 * 100,
      drone_fuel: rare.droneFuel * 100,
      skin: rare.skin * 100,
      gems_15k_25k: rare.gems15k_25k * 100,
      frogspawn: rare.frogspawn * 100,
      forbidden_sushi: rare.forbiddenSushi * 100,
      cosmic_candy: rare.cosmicCandy * 100,
      recursive_gifts: rare.gifts3 * 100,
    } as Record<string, number>,
  } as unknown as Record<string, number>;
}

/** Sushi per hour from gifts, split by source (Freebie = Statue of Soprano, Founder = supply drop). Also raw gifts per hour by source. */
export interface GiftSushiPerHourBySource {
  freebie: number;
  founder: number;
  /** Gifts per hour from Statue of Soprano (freebie). */
  giftPerHourFreebie: number;
  /** Gifts per hour from Statue of Soprano normal roll (1 gift). */
  giftPerHourFreebieNormal: number;
  /** Gifts per hour from Statue of Soprano 100× roll. */
  giftPerHourFreebie100: number;
  /** Gifts per hour from Founder supply drop. */
  giftPerHourFounder: number;
}

export function calculateGiftSushiPerHourBySource(params: GameParameters): GiftSushiPerHourBySource {
  const luckyMult = calculateLuckyMultiplier();
  const obelisk = clampPositive(params.obelisk_level, 0);
  const rare = computeRareRollWinProbs(obelisk, params.gift_black_hole_unlocked);
  const sushiPerGift = (rare.sushi15_24 * 19.5 + rare.sushi50_60 * 55) * luckyMult;

  let freebieGiftsPerHour = 0;
  let founderGiftsPerHour = 0;

  let freebieGiftsPerHourNormal = 0;
  let freebieGiftsPerHour100 = 0;
  // Statue of Soprano (freebie gift chance)
  const level = Math.max(0, Math.min(3, clampInt(params.statue_soprano_level ?? 0, 0)));
  const cfg = STATUE_SOPRANO_CONFIG[level];
  if (cfg && (cfg.freebieGiftChance > 0 || cfg.freebie100xChance > 0)) {
    const freebiesPerHour = calculateFreebiesPerHour(params);
    const refreshMult = calculateRefreshMultiplier(params);
    const giftRollsPerHour = freebiesPerHour * refreshMult;
    freebieGiftsPerHourNormal = giftRollsPerHour * cfg.freebieGiftChance * 1;
    freebieGiftsPerHour100 = giftRollsPerHour * cfg.freebie100xChance * 100;
    freebieGiftsPerHour = freebieGiftsPerHourNormal + freebieGiftsPerHour100;
  }

  // Founder supply drop: jackpot 1/1234 per collect event → 10 Gifts (wiki); 1/750 per event → 100 Sushi when Fishing unlocked
  let founderSushiPerHour = 0;
  if (params.founder_enabled) {
    const founderDropInterval = getFounderDropIntervalMinutes(params);
    const founderDropsPerHour = 60.0 / founderDropInterval;
    founderGiftsPerHour = founderDropsPerHour * (1 / 1234) * 10;
    founderSushiPerHour = founderGiftsPerHour * sushiPerGift;
    if (params.gift_fishing_unlocked) {
      const sushiJackpotPerHour = founderDropsPerHour * (1 / 750) * 100;
      founderSushiPerHour += sushiJackpotPerHour;
    }
  }

  return {
    freebie: freebieGiftsPerHour * sushiPerGift,
    founder: founderSushiPerHour,
    giftPerHourFreebie: freebieGiftsPerHour,
    giftPerHourFreebieNormal: freebieGiftsPerHourNormal,
    giftPerHourFreebie100: freebieGiftsPerHour100,
    giftPerHourFounder: founderGiftsPerHour,
  };
}

/** Expected Sushi per hour from gifts (Founder supply drop + Statue of Soprano freebie gifts). */
export function calculateGiftSushiPerHour(params: GameParameters): number {
  const { freebie, founder } = calculateGiftSushiPerHourBySource(params);
  return freebie + founder;
}

/** Uptime fraction (0..1) of the Gift basic reward "5× Fishing Tick Chance". Effective chance = P(basic roll) × 1/12 (rare replaces basic), 12.5 min duration. */
export function calculateGift5xTickUptimeFraction(params: GameParameters): number {
  const level = Math.max(0, Math.min(3, clampInt(params.statue_soprano_level ?? 0, 0)));
  const cfg = STATUE_SOPRANO_CONFIG[level];
  let totalGiftsPerHour = 0;
  if (cfg && (cfg.freebieGiftChance > 0 || cfg.freebie100xChance > 0)) {
    const freebiesPerHour = calculateFreebiesPerHour(params);
    const refreshMult = calculateRefreshMultiplier(params);
    const giftRollsPerHour = freebiesPerHour * refreshMult;
    const expectedGiftsPerClaim = cfg.freebieGiftChance * 1 + cfg.freebie100xChance * 100;
    totalGiftsPerHour += giftRollsPerHour * expectedGiftsPerClaim;
  }
  if (params.founder_enabled) {
    const founderDropInterval = getFounderDropIntervalMinutes(params);
    const founderDropsPerHour = 60.0 / founderDropInterval;
    totalGiftsPerHour += founderDropsPerHour * (1 / 1234) * 10;
  }
  const obelisk = clampPositive(params.obelisk_level, 0);
  const probBasicRoll = getBasicRollProbability(obelisk);
  const chance5xPerGift = probBasicRoll * (1 / 12);
  const durationHours = 12.5 / 60;
  return Math.min(1, totalGiftsPerHour * chance5xPerGift * durationHours);
}

export function calculateFounderGemsPerHour(params: GameParameters): number {
  if (!params.founder_enabled) return 0;
  const founderDropInterval = getFounderDropIntervalMinutes(params);
  const founderDropsPerHour = 60.0 / founderDropInterval;

  const doubleChance = clamp01(getDoubleDropChance(params));
  const tripleChance = clamp01(getTripleDropChance(params));
  const singleChance = 1.0 - doubleChance - tripleChance;
  const expectedDropsPerEvent = 1.0 * singleChance + 2.0 * doubleChance + 3.0 * tripleChance;

  const qtyMult = getSupplyDropQuantityMultiplier(params);
  const goldenChance = getGoldenSupplyDropChance(params);
  const goldenMult = 1.0 + 4.0 * goldenChance;

  const w = params.founder_worlds_unlocked != null ? Math.max(1, Math.min(4, Math.trunc(params.founder_worlds_unlocked))) : 0;
  const gemsPerDropBase = w >= 1 && params.founder_worlds_unlocked != null
    ? 10 * w
    : clampPositive(params.founder_gems_base, 30.0) * qtyMult;
  const baseGems =
    founderDropsPerHour * expectedDropsPerEvent * gemsPerDropBase * goldenMult;

  const bonusGemsPerDrop = 50.0 + 10.0 * clampPositive(params.obelisk_level, 29);
  const bonusGems =
    founderDropsPerHour * expectedDropsPerEvent * clamp01(params.founder_gems_chance) * bonusGemsPerDrop * qtyMult;

  const FOUNDER_RARE_GEMS_CHANCE = 1.0 / 100.0;
  const founderRareGemsPerDrop = 50.0 + 10.0 * clampPositive(params.obelisk_level, 0);
  const rareGemsJackpot =
    founderDropsPerHour * FOUNDER_RARE_GEMS_CHANCE * founderRareGemsPerDrop;

  const giftChance = 1.0 / 1234.0;
  const giftsPerDrop = 10.0;
  const giftEvPerGift = calculateGiftEvPerGift(params);
  const giftGems = founderDropsPerHour * giftChance * giftsPerDrop * giftEvPerGift;

  const mythicChestEv =
    founderDropsPerHour * (1 / 2000) * (params.founder_mythic_chest_gem_value ?? 0);
  const megaJackpotGems =
    founderDropsPerHour * (1 / 69696) * 1000;
  const megaJackpotRelicEv =
    founderDropsPerHour * (1 / 69696) * 100 * (params.founder_relic_chest_gem_value ?? 0);
  const megaJackpotDivineEv =
    founderDropsPerHour * (1 / 69696) * 1 * (params.founder_divine_chest_gem_value ?? 0);

  const supplyDrop = getFounderSupplyDropPerHour(params); // already includes qtyMult for cherry/fuel/ticks
  const cherryGems = calculateCherryChargesGemsPerHour(params, supplyDrop.cherryChargesPerHour);
  const fuelGems = supplyDrop.fuelPerHour * (params.gift_drone_fuel_gems_per_fuel ?? 0);
  const fishingTickGems = supplyDrop.fishingTicksPerHour * (params.founder_fishing_tick_gem_value ?? 0);

  return baseGems + bonusGems + rareGemsJackpot + giftGems + mythicChestEv + megaJackpotGems + megaJackpotRelicEv + megaJackpotDivineEv + cherryGems + fuelGems + fishingTickGems;
}

/** Gems EV per hour from supply drop only (base + bonus roll + rare 1/100 gems + gifts + optional mythic/mega jackpots). For breakdown modal; excludes cherry/fuel/fishing tick value. */
export function getFounderSupplyDropGemsEvPerHour(params: GameParameters): number {
  if (!params.founder_enabled) return 0;
  const founderDropInterval = getFounderDropIntervalMinutes(params);
  const founderDropsPerHour = 60.0 / founderDropInterval;
  const doubleChance = clamp01(getDoubleDropChance(params));
  const tripleChance = clamp01(getTripleDropChance(params));
  const singleChance = 1.0 - doubleChance - tripleChance;
  const expectedDropsPerEvent = 1.0 * singleChance + 2.0 * doubleChance + 3.0 * tripleChance;
  const qtyMult = getSupplyDropQuantityMultiplier(params);
  const goldenChance = getGoldenSupplyDropChance(params);
  const goldenMult = 1.0 + 4.0 * goldenChance;
  const w = params.founder_worlds_unlocked != null ? Math.max(1, Math.min(4, Math.trunc(params.founder_worlds_unlocked))) : 0;
  const gemsPerDropBase = w >= 1 && params.founder_worlds_unlocked != null
    ? 10 * w
    : clampPositive(params.founder_gems_base, 30.0) * qtyMult;
  const baseGems =
    founderDropsPerHour * expectedDropsPerEvent * gemsPerDropBase * goldenMult;
  const bonusGemsPerDrop = 50.0 + 10.0 * clampPositive(params.obelisk_level, 29);
  const bonusGems =
    founderDropsPerHour * expectedDropsPerEvent * clamp01(params.founder_gems_chance) * bonusGemsPerDrop * qtyMult;
  const FOUNDER_RARE_GEMS_CHANCE = 1.0 / 100.0;
  const founderRareGemsPerDrop = 50.0 + 10.0 * clampPositive(params.obelisk_level, 0);
  const rareGemsJackpot =
    founderDropsPerHour * FOUNDER_RARE_GEMS_CHANCE * founderRareGemsPerDrop;
  const giftChance = 1.0 / 1234.0;
  const giftsPerDrop = 10.0;
  const giftEvPerGift = calculateGiftEvPerGift(params);
  const giftGems = founderDropsPerHour * giftChance * giftsPerDrop * giftEvPerGift;
  const mythicChestEv =
    founderDropsPerHour * (1 / 2000) * (params.founder_mythic_chest_gem_value ?? 0);
  const megaJackpotGems =
    founderDropsPerHour * (1 / 69696) * 1000;
  const megaJackpotRelicEv =
    founderDropsPerHour * (1 / 69696) * 100 * (params.founder_relic_chest_gem_value ?? 0);
  const megaJackpotDivineEv =
    founderDropsPerHour * (1 / 69696) * 1 * (params.founder_divine_chest_gem_value ?? 0);
  return baseGems + bonusGems + rareGemsJackpot + giftGems + mythicChestEv + megaJackpotGems + megaJackpotRelicEv + megaJackpotDivineEv;
}

/** Extra clicks per hour per bomb type (e.g. 20 each for Charge Magnet). Omit or use number to add same to all. */
export type ExtraClicksPerBomb =
  | number
  | { gem?: number; cherry?: number; battery?: number; d20?: number };

function normalizeExtraClicks(extra: ExtraClicksPerBomb | undefined): {
  gem: number;
  cherry: number;
  battery: number;
  d20: number;
} {
  if (extra == null) return { gem: 0, cherry: 0, battery: 0, d20: 0 };
  if (typeof extra === "number")
    return { gem: extra, cherry: extra, battery: extra, d20: extra };
  return {
    gem: extra.gem ?? 0,
    cherry: extra.cherry ?? 0,
    battery: extra.battery ?? 0,
    d20: extra.d20 ?? 0,
  };
}

/**
 * Gem EV per hour from bomb cycle. Optional extraClicksPerBomb: add that many clicks per hour to each bomb type
 * (e.g. 20 for one Charge Magnet giving 20 charges to every bomb). Pass an object to add different amounts per type.
 */
export function calculateGemBombGemsPerHour(
  params: GameParameters,
  extraClicksPerBomb?: ExtraClicksPerBomb
): number {
  const extra = normalizeExtraClicks(extraClicksPerBomb);
  const secondsPerHour = 3600.0;
  const gameSpeedBonus = getGameSpeedBonus(params); // VIP T10+: multiplicative with bomb recharge (not supply drop)

  // Founder 2× speed no longer applied to bomb recharge: user already sets Game Speed at top.
  // 10× Bomb Recharge buff (Lootbug + Drone): uptime fraction = min/h ÷ 60; effective recharge ÷ (1 + 9×uptime) so 60 min/h ⇒ ÷10
  const bomb10xMinPerHour = typeof params.bomb_recharge_10x_min_per_hour === "number" ? Math.max(0, params.bomb_recharge_10x_min_per_hour) : 0;
  const bomb10xUptime = bomb10xMinPerHour / 60.0;
  const bomb10xFactor = 1.0 + 9.0 * bomb10xUptime;
  const chaosTotemUptime = Math.max(0, Math.min(1, params.chaos_totem_uptime ?? 0));
  const chaosTotemFactor = 1.0 + chaosTotemUptime; // 2× rate when active ⇒ effective rate = 1 + uptime

  // Effective recharge: Game Speed, 10× buff, Chaos Totem (2× rate when active); no Founder 2× speed
  function effectiveRecharge(baseSeconds: number): number {
    const s = clampPositive(baseSeconds, 1);
    const afterGameSpeed = s / (1.0 + gameSpeedBonus);
    return afterGameSpeed / bomb10xFactor / chaosTotemFactor;
  }

  const effGem = effectiveRecharge(params.gem_bomb_recharge_seconds);
  const effCherry = effectiveRecharge(params.cherry_bomb_recharge_seconds);
  const effBattery = effectiveRecharge(params.battery_bomb_recharge_seconds);
  const effD20 = effectiveRecharge(params.d20_bomb_recharge_seconds);

  const freeBombMult = 1.0 / (1.0 - clamp01(params.free_bomb_chance));

  const gemMult = rechargeChargeMultiplier(params.gem_bomb_recharge_card_level);
  const cherryMult = rechargeChargeMultiplier(params.cherry_bomb_recharge_card_level);
  const batteryMult = rechargeChargeMultiplier(params.battery_bomb_recharge_card_level);
  const d20Mult = rechargeChargeMultiplier(params.d20_bomb_recharge_card_level);

  const gemClicksBase = (secondsPerHour / effGem) * gemMult;
  const cherryClicksBase = (secondsPerHour / effCherry) * cherryMult;
  const batteryClicksBase = (secondsPerHour / effBattery) * batteryMult;
  const d20ClicksBase = (secondsPerHour / effD20) * d20Mult;

  const gemClicks0 = gemClicksBase * freeBombMult + extra.gem;
  const cherryClicks0 = cherryClicksBase * freeBombMult + extra.cherry;
  const batteryClicks0 = batteryClicksBase * freeBombMult + extra.battery;
  const d20Clicks0 = d20ClicksBase * freeBombMult + extra.d20;

  // Refill rates (per click of the source) to each OTHER bomb (expected value per target). Battery and D20 cannot refill themselves.
  const totalBombTypes = Math.max(2, clampInt(params.total_bomb_types, 12));
  const targetsExcludingSelf = totalBombTypes - 1;
  const batteryRefillPerClick = clampPositive(params.battery_bomb_charges_per_charge, 2.0) / targetsExcludingSelf;
  const d20RefillPerClick = (clamp01(params.d20_bomb_refill_chance) * clampPositive(params.d20_bomb_charges_distributed, 42)) / targetsExcludingSelf;

  // Cherry effect: expected free clicks multiplier = 1 + 2p (p = triple_charge_chance). Used for cycle logic.
  const cherryEffectMult = 1.0 + 2.0 * clamp01(params.cherry_bomb_triple_charge_chance);
  const bombCycle = params.bomb_cycle === "late" ? "late" : "early";

  // Iterative solution (matches python). Early cycle: cherry extra → battery detonations (more refills). Late: cherry extra → gem bomb detonations.
  let gemTotal = gemClicks0;
  let cherryTotal = cherryClicks0;
  let batteryTotal = batteryClicks0;
  let d20Total = d20Clicks0;

  const maxIterations = 100;
  const convergenceThreshold = 0.01;

  for (let iter = 0; iter < maxIterations; iter += 1) {
    // Early cycle: cherry's triple-charge bonus is used for extra battery detonations (feeds refills).
    const effectiveBattery = bombCycle === "early"
      ? batteryTotal + cherryTotal * (cherryEffectMult - 1)
      : batteryTotal;

    // Battery refills to each other bomb (cannot refill itself)
    const batteryToGem = effectiveBattery * batteryRefillPerClick;
    const batteryToCherry = effectiveBattery * batteryRefillPerClick;
    const batteryToBattery = 0;
    const batteryToD20 = effectiveBattery * batteryRefillPerClick;

    // D20 refills to each other bomb (cannot refill itself)
    const d20ToGem = d20Total * d20RefillPerClick;
    const d20ToCherry = d20Total * d20RefillPerClick;
    const d20ToBattery = d20Total * d20RefillPerClick;
    const d20ToD20 = 0;

    const gemNew = gemClicks0 + batteryToGem + d20ToGem;
    const cherryNew = cherryClicks0 + batteryToCherry + d20ToCherry;
    const batteryNew = batteryClicks0 + batteryToBattery + d20ToBattery;
    const d20New = d20Clicks0 + batteryToD20 + d20ToD20;

    const change = Math.abs(gemNew - gemTotal) + Math.abs(cherryNew - cherryTotal) + Math.abs(batteryNew - batteryTotal) + Math.abs(d20New - d20Total);
    if (change < convergenceThreshold) {
      gemTotal = gemNew;
      cherryTotal = cherryNew;
      batteryTotal = batteryNew;
      d20Total = d20New;
      break;
    }

    gemTotal = gemNew;
    cherryTotal = cherryNew;
    batteryTotal = batteryNew;
    d20Total = d20New;
  }

  // Late cycle: cherry effect → extra gem bomb detonations. Early: cherry effect already used in battery refills.
  const totalGemBombClicks = bombCycle === "late"
    ? gemTotal + cherryTotal * cherryEffectMult
    : gemTotal;
  const gemChance = clamp01(params.gem_bomb_gem_chance) + getGemBombGemChanceT12Bonus(params);
  const gemsPerHour = totalGemBombClicks * gemChance;
  return gemsPerHour;
}

/** Gem EV equivalent of one Charge Magnet: 20 charges added to every bomb (gem, cherry, battery, d20) per hour. */
export function calculateChargeMagnetGemsPerHour(params: GameParameters, chargesPerMagnet: number = 20): number {
  return calculateGemBombGemsPerHour(params, chargesPerMagnet) - calculateGemBombGemsPerHour(params, 0);
}

/**
 * Gem EV per hour of adding `charges` cherry charges per hour. Uses Gem EV bomb cycle:
 * Late: cherry bonus counts as gem bomb detonations → value of extra cherry charges.
 * Early: cherry bonus counts as battery detonations → value of extra battery charges (refills).
 */
export function calculateCherryChargesGemsPerHour(params: GameParameters, charges: number): number {
  if (charges <= 0 || !Number.isFinite(charges)) return 0;
  const bombCycle = params.bomb_cycle === "late" ? "late" : "early";
  if (bombCycle === "late") {
    return (
      calculateGemBombGemsPerHour(params, { cherry: charges }) -
      calculateGemBombGemsPerHour(params, 0)
    );
  }
  return (
    calculateGemBombGemsPerHour(params, { battery: charges }) -
    calculateGemBombGemsPerHour(params, 0)
  );
}

/** Founder bomb 2× speed procs: no longer in EV (user sets Game Speed at top). */
export function calculateFounderBombBoostPerHour(_params: GameParameters): number {
  return 0;
}

export type EvBreakdownEntry = { base: number; jackpot: number; refresh_base: number; refresh_jackpot: number; gift?: number };
export type EvBreakdown = Record<
  | "gems_base"
  | "stonks_ev"
  | "skill_shards_ev"
  | "founder_speed_boost"
  | "founder_gems"
  | "gem_bomb_gems"
  | "founder_bomb_boost",
  EvBreakdownEntry
>;

export function calculateEvBreakdown(params: GameParameters): EvBreakdown {
  const freebiesPerHour = calculateFreebiesPerHour(params);
  const baseRolls = 1.0;
  const expectedRolls = calculateExpectedRollsPerClaim(params);
  const refreshMult = calculateRefreshMultiplier(params);

  // Gems base
  const baseGems = freebiesPerHour * baseRolls * clampPositive(params.freebie_gems_base, 9.0);
  const jackpotGems = freebiesPerHour * (expectedRolls - baseRolls) * clampPositive(params.freebie_gems_base, 9.0);
  const refreshGemsBase = baseGems * (refreshMult - 1.0);
  const refreshGemsJackpot = jackpotGems * (refreshMult - 1.0);

  // Stonks (no jackpot; claim % does not apply; sum of Stonks + Super + Ultra, then × stonks_all_multiplier)
  const sc = clamp01(params.stonks_chance);
  const ssc = clamp01(params.super_stonks_chance ?? 0);
  const usc = clamp01(params.ultra_stonks_chance ?? 0);
  const stonksPerClaim =
    sc * clampPositive(params.stonks_bonus_gems, 200.0) * clampPositive(params.stonks_multiplier ?? 1.0, 0);
  const superPerClaim =
    sc * ssc * clampPositive(params.super_stonks_bonus_gems ?? 0, 0) * clampPositive(params.super_stonks_multiplier ?? 1.0, 0);
  const ultraPerClaim =
    sc * ssc * usc * clampPositive(params.ultra_stonks_bonus_gems ?? 0, 0) * clampPositive(params.ultra_stonks_multiplier ?? 1.0, 0);
  const sumPerClaim = stonksPerClaim + superPerClaim + ultraPerClaim;
  const allMult = clampPositive(params.stonks_all_multiplier ?? 1.0, 0);
  const baseStonks = freebiesPerHour * sumPerClaim * allMult;
  const refreshStonks = baseStonks * (refreshMult - 1.0);

  // Skill shards (jackpot applies)
  const baseShards =
    freebiesPerHour * baseRolls * clamp01(params.skill_shard_chance) * clampPositive(params.skill_shard_value_gems, 12.5);
  const jackpotShards =
    freebiesPerHour * (expectedRolls - baseRolls) * clamp01(params.skill_shard_chance) * clampPositive(params.skill_shard_value_gems, 12.5);
  const refreshShardsBase = baseShards * (refreshMult - 1.0);
  const refreshShardsJackpot = jackpotShards * (refreshMult - 1.0);

  // Founder speed boost (modeled as refresh-only for breakdown)
  const founderSpeedTotal = calculateFounderSpeedBoostPerHour(params);
  const founderSpeedBase = refreshMult > 0 ? founderSpeedTotal / refreshMult : 0;
  const founderSpeedRefresh = founderSpeedTotal - founderSpeedBase;

  // Founder gems (no multipliers in breakdown)
  const founderGems = calculateFounderGemsPerHour(params);

  // Gem bomb gems (independent)
  const gemBombGems = calculateGemBombGemsPerHour(params);

  // Founder bomb boost (modeled as refresh-only for breakdown)
  const founderBombTotal = calculateFounderBombBoostPerHour(params);
  const founderBombBase = refreshMult > 0 ? founderBombTotal / refreshMult : 0;
  const founderBombRefresh = founderBombTotal - founderBombBase;

  const giftStatue = calculateStatueSopranoGiftEvPerHour(params);
  return {
    gems_base: { base: baseGems, jackpot: jackpotGems, refresh_base: refreshGemsBase, refresh_jackpot: refreshGemsJackpot, gift: giftStatue },
    stonks_ev: { base: baseStonks, jackpot: 0.0, refresh_base: refreshStonks, refresh_jackpot: 0.0 },
    skill_shards_ev: { base: baseShards, jackpot: jackpotShards, refresh_base: refreshShardsBase, refresh_jackpot: refreshShardsJackpot },
    founder_speed_boost: { base: founderSpeedBase, jackpot: 0.0, refresh_base: founderSpeedRefresh, refresh_jackpot: 0.0 },
    founder_gems: { base: founderGems, jackpot: 0.0, refresh_base: 0.0, refresh_jackpot: 0.0 },
    gem_bomb_gems: { base: gemBombGems, jackpot: 0.0, refresh_base: 0.0, refresh_jackpot: 0.0 },
    founder_bomb_boost: { base: founderBombBase, jackpot: 0.0, refresh_base: founderBombRefresh, refresh_jackpot: 0.0 },
  };
}

export type TotalEv = {
  gems_base: number;
  stonks_ev: number;
  skill_shards_ev: number;
  founder_speed_boost: number;
  founder_gems: number;
  gem_bomb_gems: number;
  founder_bomb_boost: number;
  total: number;
};

export function calculateTotalEvPerHour(params: GameParameters): TotalEv {
  const gems_base = calculateGemsBasePerHour(params);
  const gift_statue = calculateStatueSopranoGiftEvPerHour(params);
  const stonks_ev = calculateStonksEvPerHour(params);
  const skill_shards_ev = calculateSkillShardsEvPerHour(params);
  const founder_speed_boost = calculateFounderSpeedBoostPerHour(params);
  const founder_gems = calculateFounderGemsPerHour(params);
  const gem_bomb_gems = calculateGemBombGemsPerHour(params);
  const founder_bomb_boost = calculateFounderBombBoostPerHour(params);

  const total = gems_base + gift_statue + stonks_ev + skill_shards_ev + founder_speed_boost + founder_gems + gem_bomb_gems + founder_bomb_boost;
  return { gems_base: gems_base + gift_statue, stonks_ev, skill_shards_ev, founder_speed_boost, founder_gems, gem_bomb_gems, founder_bomb_boost, total };
}

/** Expected gem EV per single freebie claim (one pop). Used for overnight banked freebies. Includes Statue of Soprano gifts when built. */
export function getFreebieEvPerClaim(params: GameParameters): number {
  const freebiesPerHour = calculateFreebiesPerHour(params);
  if (freebiesPerHour <= 0) return 0;
  const gemsBase = calculateGemsBasePerHour(params);
  const stonks = calculateStonksEvPerHour(params);
  const skillShards = calculateSkillShardsEvPerHour(params);
  const statueGifts = calculateStatueSopranoGiftEvPerHour(params);
  return (gemsBase + stonks + skillShards + statueGifts) / freebiesPerHour;
}

/** Expected founder supply gems from a single drop event (one roll at start of night: 1, 2, or 3 drops). Overnight: only this one event. */
export function getFounderGemsPerSingleEvent(params: GameParameters): number {
  if (!params.founder_enabled) return 0;
  const founderGemsPerHour = calculateFounderGemsPerHour(params);
  const intervalMin = getFounderDropIntervalMinutes(params);
  return founderGemsPerHour * (intervalMin / 60.0);
}

