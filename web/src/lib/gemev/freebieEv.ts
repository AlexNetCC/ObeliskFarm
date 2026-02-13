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
  freebie_claim_percentage: number; // 0..100
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

  // Founder supply drop (VIP Lounge tiers 1..12)
  vip_lounge_level: number; // 1..12
  founder_gems_base: number; // fixed 10.0 in desktop
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
  gift_fishing_tick_value?: number; // When fishing unlocked, value of 10–15 min 5× Fishing Tick Chance +25% (Gems)
  /** Drone Fuel: value per 1 Fuel in Gems. Default 5. */
  gift_drone_fuel_gems_per_fuel?: number;
  /** Sushi: fish EV per 1 Sushi (from Fishing module). Sushi only affects fish gain, not Gem EV total. */
  gift_sushi_fish_per_sushi?: number;
};

export function defaultGameParameters(): GameParameters {
  return {
    founder_enabled: true,
    freebie_gems_base: 9.0,
    freebie_timer_minutes: 7.0,
    freebie_claim_percentage: 100.0,
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
    founder_gems_base: 10.0,
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

/** Gem EV per hour from Statue of Soprano (Freebie Gift Chance + 100× on freebie claims). Returns 0 when level 0. */
export function calculateStatueSopranoGiftEvPerHour(params: GameParameters): number {
  const level = Math.max(0, Math.min(3, clampInt(params.statue_soprano_level ?? 0, 0)));
  const cfg = STATUE_SOPRANO_CONFIG[level];
  if (!cfg || (cfg.freebieGiftChance === 0 && cfg.freebie100xChance === 0)) return 0;
  const freebiesPerHour = calculateFreebiesPerHour(params);
  const refreshMult = calculateRefreshMultiplier(params);
  const expectedRolls = calculateExpectedRollsPerClaim(params);
  const freebieEventsPerHour = freebiesPerHour * refreshMult * expectedRolls;
  const expectedGiftsPerEvent = cfg.freebieGiftChance * 1 + cfg.freebie100xChance * 100;
  const giftsPerHour = freebieEventsPerHour * expectedGiftsPerEvent;
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

/** Per supply drop (before double/triple): 2 Item Chests, 50 Cherry Bomb charges, 4 min 2× Star Spawn Rate, 8 min 100% Star Auto-catch. Durations divided by game speed. */
export interface FounderSupplyDropPerHour {
  itemChestsPerHour: number;
  cherryChargesPerHour: number;
  starSpawn2xMinPerHour: number;
  starAutoCatch100MinPerHour: number;
}

export function getFounderSupplyDropPerHour(params: GameParameters): FounderSupplyDropPerHour {
  const zero = { itemChestsPerHour: 0, cherryChargesPerHour: 0, starSpawn2xMinPerHour: 0, starAutoCatch100MinPerHour: 0 };
  if (!params.founder_enabled) return zero;
  const founderDropInterval = getFounderDropIntervalMinutes(params);
  const founderDropsPerHour = 60.0 / founderDropInterval;
  const doubleChance = clamp01(getDoubleDropChance(params));
  const tripleChance = clamp01(getTripleDropChance(params));
  const singleChance = 1.0 - doubleChance - tripleChance;
  const expectedDropsPerEvent = 1.0 * singleChance + 2.0 * doubleChance + 3.0 * tripleChance;
  const gameSpeedMult = getGameSpeedMultiplier(params);
  const eventsPerHour = founderDropsPerHour * expectedDropsPerEvent;
  return {
    itemChestsPerHour: eventsPerHour * 2,
    cherryChargesPerHour: eventsPerHour * 50,
    starSpawn2xMinPerHour: eventsPerHour * (4.0 / gameSpeedMult),
    starAutoCatch100MinPerHour: eventsPerHour * (8.0 / gameSpeedMult),
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

/** Game speed as (multiplier - 1) for formulas: effectiveTime = base / (1 + bonus) = base / multiplier. */
export function getGameSpeedBonus(params: GameParameters): number {
  const mult = "game_speed_multiplier" in params ? clampPositive(params.game_speed_multiplier, 1.0) : 1.0;
  if (mult > 1.0) return mult - 1.0;
  return getVIPGameSpeedBonus(params);
}

/** Effective game speed multiplier for display (1× = no bonus or VIP). */
export function getGameSpeedMultiplier(params: GameParameters): number {
  const mult = "game_speed_multiplier" in params ? clampPositive(params.game_speed_multiplier, 1.0) : 1.0;
  if (mult > 1.0) return mult;
  return 1.0 + getVIPGameSpeedBonus(params);
}

/** Effective freebie timer (min): base / game speed multiplier. */
export function getEffectiveFreebieTimerMinutes(params: GameParameters): number {
  const base = clampPositive(params.freebie_timer_minutes, 7.0);
  const mult = getGameSpeedMultiplier(params);
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
  const timer = clampPositive(params.freebie_timer_minutes, 7.0);
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

export function calculateGemsBasePerHour(params: GameParameters): number {
  const freebiesPerHour = calculateFreebiesPerHour(params);
  const claim = clampPositive(params.freebie_claim_percentage, 100.0) / 100.0; // Claim % only affects gems_base bar
  const expectedRolls = calculateExpectedRollsPerClaim(params);
  const refreshMult = calculateRefreshMultiplier(params);
  return freebiesPerHour * claim * refreshMult * expectedRolls * clampPositive(params.freebie_gems_base, 9.0);
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
  return freebiesPerHour * refreshMult * sumPerClaim * allMult;
}

/** Expected Item Chests per hour from stonks procs. In-game: base stonks 20 chests; super/ultra same base per proc, each tier uses its multiplier. */
const STONKS_CHESTS_BASE = 20;

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
  return (baseChests + superChests + ultraChests) * allMult;
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

/** Rare roll chain: order matters, later replaces earlier. P(roll i wins) = p_i * ∏_{j>i}(1-p_j). */
function computeRareRollWinProbs(obelisk: number): {
  gifts3: number;
  gems80_130: number;
  droneFuel: number;
  sushi15_24: number;
  sushi50_60: number;
  skin: number;
  gildedSkin: number;
} {
  const p = [
    obelisk >= 23 ? 1 / 20 : 0, // Star Spawn
    1 / 40, // 3 Gifts
    1 / 45, // 80-130 Gems
    1 / 100, // Mythic Chest
    obelisk >= 37 ? 1 / 37 : 0, // Tier 2 Items
    obelisk >= 18 ? 1 / 30 : 0, // Drone Fuel
    obelisk >= 30 ? 1 / 33 : 0, // Idol Tokens
    obelisk >= 37 ? 1 / 45 : 0, // 15-24 Sushi
    obelisk >= 37 ? 1 / 175 : 0, // 50-60 Sushi
    1 / 200, // Skin
    1 / 2000, // Gilded Skin
    1 / 2500, // Divine Chest
  ];
  const noReplace = p.map((_, i) => p.slice(i + 1).reduce((acc, pj) => acc * (1 - pj), 1));
  return {
    gifts3: p[1] * noReplace[1],
    gems80_130: p[2] * noReplace[2],
    droneFuel: p[5] * noReplace[5],
    sushi15_24: p[7] * noReplace[7],
    sushi50_60: p[8] * noReplace[8],
    skin: p[9] * noReplace[9],
    gildedSkin: p[10] * noReplace[10],
  };
}

export function calculateGiftEvPerGift(params: GameParameters): number {
  const obeliskMult = calculateObeliskMultiplier(params);
  const luckyMult = calculateLuckyMultiplier();
  const skillShardValue = clampPositive(params.skill_shard_value_gems, 12.5);
  const chancePerItem = 1.0 / 12.0;
  const obelisk = clampPositive(params.obelisk_level, 0);

  // 1) Base roll EV – time boosts no longer converted to Gems
  const gems20_40 = 30.0;
  const gems30_65 = 47.5;
  const skillShardsBase = 3.5;
  const baseRollGems = chancePerItem * (gems20_40 + gems30_65);
  const baseRollShards = chancePerItem * skillShardsBase * skillShardValue;

  const itemChestsAvg = 32.5;
  const itemChestsEv = chancePerItem * itemChestsAvg * (params.gift_item_chest_value ?? 0);

  const chaosTotemAvg = 12.5;
  const chaosTotemEv = params.gift_chaos_totem_100_from_bombs
    ? 0
    : chancePerItem * chaosTotemAvg * (params.gift_chaos_totem_value_per_totem ?? 0);

  const chargeMagnetAvg = 16.0;
  const fishingTickEv = params.gift_fishing_unlocked ? chancePerItem * (params.gift_fishing_tick_value ?? 0) : 0;
  const chargeMagnetEv = !params.gift_fishing_unlocked
    ? chancePerItem * chargeMagnetAvg * (params.gift_charge_magnet_value_per_magnet ?? 0)
    : 0;

  // 2) Rare rolls – full replacement chain
  const rare = computeRareRollWinProbs(obelisk);
  const gemsPerFuel = params.gift_drone_fuel_gems_per_fuel ?? 5;
  const droneFuelAvgQty = obelisk * 1.5 + 10;
  const rareGemsEv = rare.gems80_130 * 105.0 * obeliskMult * luckyMult;
  const droneFuelEv = rare.droneFuel * droneFuelAvgQty * gemsPerFuel * obeliskMult * luckyMult;
  const skinEv = rare.skin * 105.0 * obeliskMult; // Skins: no Lucky mult

  // 3) Apply multipliers to base
  const baseGemsWithMult = baseRollGems * obeliskMult * luckyMult;
  const baseShardsWithMult = baseRollShards * obeliskMult * luckyMult;
  const itemChestsWithMult = itemChestsEv * obeliskMult * luckyMult;
  const chaosTotemWithMult = chaosTotemEv * obeliskMult * luckyMult;
  const chargeMagnetWithMult = chargeMagnetEv * obeliskMult * luckyMult;
  const fishingTickWithMult = fishingTickEv * obeliskMult * luckyMult;

  // 4) Recursion: GiftEV = A + B * GiftEV (3 Gifts and 25 Gifts from Gilded Skin)
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
    skinEv;
  if (recursiveCoeff >= 1.0) return A * 10.0;
  return A / (1.0 - recursiveCoeff);
}

export function calculateGiftEvBreakdown(params: GameParameters): Record<string, number> {
  const obeliskMult = calculateObeliskMultiplier(params);
  const luckyMult = calculateLuckyMultiplier();
  const skillShardValue = clampPositive(params.skill_shard_value_gems, 12.5);
  const chancePerItem = 1.0 / 12.0;
  const gems20_40 = 30.0;
  const gems30_65 = 47.5;
  const skillShardsBase = 3.5;
  const itemChestsAvg = 32.5;
  const chaosTotemAvg = 12.5;
  const chargeMagnetAvg = 16.0;
  const obelisk = clampPositive(params.obelisk_level, 0);

  const gems20_40_final = chancePerItem * gems20_40 * obeliskMult * luckyMult;
  const gems30_65_final = chancePerItem * gems30_65 * obeliskMult * luckyMult;
  const skillShards_final = chancePerItem * skillShardsBase * skillShardValue * obeliskMult * luckyMult;
  const item_chests_final =
    chancePerItem * itemChestsAvg * (params.gift_item_chest_value ?? 0) * obeliskMult * luckyMult;
  const chaos_totem_final = params.gift_chaos_totem_100_from_bombs
    ? 0
    : chancePerItem * chaosTotemAvg * (params.gift_chaos_totem_value_per_totem ?? 0) * obeliskMult * luckyMult;
  const charge_magnet_final = !params.gift_fishing_unlocked
    ? chancePerItem * chargeMagnetAvg * (params.gift_charge_magnet_value_per_magnet ?? 0) * obeliskMult * luckyMult
    : 0;
  const fishing_tick_final = params.gift_fishing_unlocked
    ? chancePerItem * (params.gift_fishing_tick_value ?? 0) * obeliskMult * luckyMult
    : 0;

  const rare = computeRareRollWinProbs(obelisk);
  const gemsPerFuel = params.gift_drone_fuel_gems_per_fuel ?? 5;
  const droneFuelAvgQty = obelisk * 1.5 + 10;
  const rare_gems_final = rare.gems80_130 * 105.0 * obeliskMult * luckyMult;
  const drone_fuel_final = rare.droneFuel * droneFuelAvgQty * gemsPerFuel * obeliskMult * luckyMult;
  const skin_final = rare.skin * 105.0 * obeliskMult;

  const fishPerSushi = params.gift_sushi_fish_per_sushi ?? 0;
  const sushi_fish_final =
    (rare.sushi15_24 * 19.5 + rare.sushi50_60 * 55) * luckyMult * fishPerSushi;

  const giftEvTotal = calculateGiftEvPerGift(params);
  const A =
    gems20_40_final +
    gems30_65_final +
    skillShards_final +
    item_chests_final +
    chaos_totem_final +
    charge_magnet_final +
    fishing_tick_final +
    rare_gems_final +
    drone_fuel_final +
    skin_final;
  const recursiveGiftsContribution = giftEvTotal - A;

  /** Expected quantity per gift (for chart labels): gems, shards, chests, totems, magnets, fuel, sushi, etc. */
  const gems20_40_qty = chancePerItem * gems20_40 * obeliskMult * luckyMult;
  const gems30_65_qty = chancePerItem * gems30_65 * obeliskMult * luckyMult;
  const skillShards_qty = chancePerItem * skillShardsBase * obeliskMult * luckyMult;
  const itemChests_qty = chancePerItem * itemChestsAvg * obeliskMult * luckyMult;
  const chaosTotem_qty = params.gift_chaos_totem_100_from_bombs ? 0 : chancePerItem * chaosTotemAvg * obeliskMult * luckyMult;
  const chargeMagnet_qty = !params.gift_fishing_unlocked ? chancePerItem * chargeMagnetAvg * obeliskMult * luckyMult : 0;
  const fishingTick_min = params.gift_fishing_unlocked ? chancePerItem * 12.5 * obeliskMult * luckyMult : 0;
  const rareGems_qty = rare.gems80_130 * 105 * obeliskMult * luckyMult;
  const droneFuel_qty = rare.droneFuel * droneFuelAvgQty * obeliskMult * luckyMult;
  const skin_qty = rare.skin * 105 * obeliskMult;
  const sushi_qty = (rare.sushi15_24 * 19.5 + rare.sushi50_60 * 55) * luckyMult;
  const recursiveGifts_qty = rare.gifts3 * 3 * obeliskMult * luckyMult + rare.gildedSkin * 25 * obeliskMult * luckyMult;

  return {
    gems_20_40: gems20_40_final,
    gems_30_65: gems30_65_final,
    skill_shards: skillShards_final,
    item_chests: item_chests_final,
    chaos_totem: chaos_totem_final,
    charge_magnet: charge_magnet_final,
    fishing_tick: fishing_tick_final,
    rare_gems: rare_gems_final,
    drone_fuel: drone_fuel_final,
    skin: skin_final,
    sushi_fish: sushi_fish_final,
    recursive_gifts: recursiveGiftsContribution,
    total: giftEvTotal,
    _qty: {
      gems_20_40: gems20_40_qty,
      gems_30_65: gems30_65_qty,
      skill_shards: skillShards_qty,
      item_chests: itemChests_qty,
      chaos_totem: chaosTotem_qty,
      charge_magnet: chargeMagnet_qty,
      fishing_tick: fishingTick_min,
      rare_gems: rareGems_qty,
      drone_fuel: droneFuel_qty,
      skin: skin_qty,
      sushi_fish: sushi_qty,
      recursive_gifts: recursiveGifts_qty,
    } as Record<string, number>,
    _multipliers: {
      obeliskMult,
      luckyMult,
      obeliskLevel: obelisk,
    },
  } as unknown as Record<string, number>;
}

/** Expected Sushi per hour from gifts (Founder supply drop + Statue of Soprano freebie gifts). */
export function calculateGiftSushiPerHour(params: GameParameters): number {
  const luckyMult = calculateLuckyMultiplier();
  const obelisk = clampPositive(params.obelisk_level, 0);
  const rare = computeRareRollWinProbs(obelisk);
  const sushiPerGift = (rare.sushi15_24 * 19.5 + rare.sushi50_60 * 55) * luckyMult;

  let giftsPerHour = 0;

  // Statue of Soprano (freebie gift chance)
  const level = Math.max(0, Math.min(3, clampInt(params.statue_soprano_level ?? 0, 0)));
  const cfg = STATUE_SOPRANO_CONFIG[level];
  if (cfg && (cfg.freebieGiftChance > 0 || cfg.freebie100xChance > 0)) {
    const freebiesPerHour = calculateFreebiesPerHour(params);
    const refreshMult = calculateRefreshMultiplier(params);
    const expectedRolls = calculateExpectedRollsPerClaim(params);
    const freebieEventsPerHour = freebiesPerHour * refreshMult * expectedRolls;
    const expectedGiftsPerEvent = cfg.freebieGiftChance * 1 + cfg.freebie100xChance * 100;
    giftsPerHour += freebieEventsPerHour * expectedGiftsPerEvent;
  }

  // Founder supply drop
  if (params.founder_enabled) {
    const founderDropInterval = getFounderDropIntervalMinutes(params);
    const founderDropsPerHour = 60.0 / founderDropInterval;
    const doubleChance = clamp01(getDoubleDropChance(params));
    const tripleChance = clamp01(getTripleDropChance(params));
    const singleChance = 1.0 - doubleChance - tripleChance;
    const expectedDropsPerEvent = 1.0 * singleChance + 2.0 * doubleChance + 3.0 * tripleChance;
    giftsPerHour += founderDropsPerHour * expectedDropsPerEvent * (1 / 1234) * 10;
  }

  return giftsPerHour * sushiPerGift;
}

export function calculateFounderGemsPerHour(params: GameParameters): number {
  if (!params.founder_enabled) return 0;
  const founderDropInterval = getFounderDropIntervalMinutes(params);
  const founderDropsPerHour = 60.0 / founderDropInterval;

  const doubleChance = clamp01(getDoubleDropChance(params));
  const tripleChance = clamp01(getTripleDropChance(params));
  const singleChance = 1.0 - doubleChance - tripleChance;
  const expectedDropsPerEvent = 1.0 * singleChance + 2.0 * doubleChance + 3.0 * tripleChance;

  const goldenChance = getGoldenSupplyDropChance(params); // 5× normal drops, not rare
  const baseGems =
    founderDropsPerHour * expectedDropsPerEvent * clampPositive(params.founder_gems_base, 10.0) * (1.0 + 4.0 * goldenChance);
  const bonusGemsPerDrop = 50.0 + 10.0 * clampPositive(params.obelisk_level, 29);
  const bonusGems =
    founderDropsPerHour * expectedDropsPerEvent * clamp01(params.founder_gems_chance) * bonusGemsPerDrop;

  const giftChance = 1.0 / 1234.0;
  const giftsPerDrop = 10.0;
  const giftEvPerGift = calculateGiftEvPerGift(params);
  const giftGems = founderDropsPerHour * giftChance * giftsPerDrop * giftEvPerGift;

  const supplyDrop = getFounderSupplyDropPerHour(params);
  const cherryGems = calculateCherryChargesGemsPerHour(params, supplyDrop.cherryChargesPerHour);

  return baseGems + bonusGems + giftGems + cherryGems;
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

  // Refill rates (per click of the source) to EACH target bomb (expected value per target).
  const totalBombTypes = Math.max(2, clampInt(params.total_bomb_types, 12));
  const batteryRefillPerClick = clampPositive(params.battery_bomb_charges_per_charge, 2.0) / (totalBombTypes - 1);
  const d20RefillPerClick = (clamp01(params.d20_bomb_refill_chance) * clampPositive(params.d20_bomb_charges_distributed, 42)) / (totalBombTypes - 1);

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

    // Battery refills to each bomb (including itself per python comment "self-refill")
    const batteryToGem = effectiveBattery * batteryRefillPerClick;
    const batteryToCherry = effectiveBattery * batteryRefillPerClick;
    const batteryToBattery = effectiveBattery * batteryRefillPerClick;
    const batteryToD20 = effectiveBattery * batteryRefillPerClick;

    // D20 refills to each bomb (including itself)
    const d20ToGem = d20Total * d20RefillPerClick;
    const d20ToCherry = d20Total * d20RefillPerClick;
    const d20ToBattery = d20Total * d20RefillPerClick;
    const d20ToD20 = d20Total * d20RefillPerClick;

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
  const claim = clampPositive(params.freebie_claim_percentage, 100.0) / 100.0; // Only gems_base bar uses claim
  const baseRolls = 1.0;
  const expectedRolls = calculateExpectedRollsPerClaim(params);
  const refreshMult = calculateRefreshMultiplier(params);

  // Gems base (only bar affected by Freebie Claim %)
  const baseGems = freebiesPerHour * claim * baseRolls * clampPositive(params.freebie_gems_base, 9.0);
  const jackpotGems = freebiesPerHour * claim * (expectedRolls - baseRolls) * clampPositive(params.freebie_gems_base, 9.0);
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

