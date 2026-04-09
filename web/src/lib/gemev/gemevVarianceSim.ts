/**
 * Monte Carlo simulation for Gem EV variance: freebies, Lootbug, gifts, and Lootfrog (frogspawn) over one hour.
 * Uses same probabilities as freebieEv.ts; logic-only, no DOM.
 */

/** Poisson draw: mean λ. Simple implementation for small λ. */
function poisson(lam: number, rng: () => number): number {
  if (lam <= 0) return 0;
  let n = 0;
  let p = Math.exp(-lam);
  let s = p;
  const u = rng();
  while (s < u) {
    n += 1;
    p *= lam / n;
    s += p;
  }
  return n;
}
import type { GameParameters } from "./freebieEv";

/** Params extended with gift EV for sampling (set by caller). */
type GiftSimParams = GameParameters & { __giftEvPerGift?: number };

import {
  calculateObeliskMultiplier,
  calculateLuckyMultiplier,
  getEffectiveFreebieTimerMinutes,
  getFounderDropIntervalMinutes,
  getDoubleDropChance,
  getTripleDropChance,
  getSupplyDropQuantityMultiplier,
  getGoldenSupplyDropChance,
} from "./freebieEv";

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

/** Rare roll chain: wiki Store#Gifts order. Index 0..15; -1 = basic roll. */
function sampleRareChainIndex(obelisk: number, rng: () => number, blackHoleUnlocked?: boolean): number {
  const starOk = obelisk >= 23 && obelisk <= 59;
  const p = [
    starOk ? 1 / 20 : 0,
    1 / 40,
    1 / 45,
    1 / 100,
    blackHoleUnlocked ? 1 / 25 : 0,
    obelisk >= 37 ? 1 / 37 : 0,
    obelisk >= 18 ? 1 / 30 : 0,
    obelisk >= 30 ? 1 / 33 : 0,
    obelisk >= 37 ? 1 / 45 : 0,
    obelisk >= 37 ? 1 / 175 : 0,
    obelisk >= 60 ? 1 / 25 : 0,
    obelisk >= 60 ? 1 / 1000 : 0,
    obelisk >= 60 ? 1 / 30 : 0,
    1 / 200,
    1 / 2000,
    1 / 2500,
  ];
  for (let i = 0; i < p.length; i++) {
    if (p[i] > 0 && rng() < p[i]) return i;
  }
  return -1;
}

/** Probability that no rare wins (basic roll). Same as getBasicRollProbability in freebieEv. */
function getBasicRollProbability(obelisk: number, blackHoleUnlocked?: boolean): number {
  const starOk = obelisk >= 23 && obelisk <= 59;
  const p = [
    starOk ? 1 / 20 : 0,
    1 / 40,
    1 / 45,
    1 / 100,
    blackHoleUnlocked ? 1 / 25 : 0,
    obelisk >= 37 ? 1 / 37 : 0,
    obelisk >= 18 ? 1 / 30 : 0,
    obelisk >= 30 ? 1 / 33 : 0,
    obelisk >= 37 ? 1 / 45 : 0,
    obelisk >= 37 ? 1 / 175 : 0,
    obelisk >= 60 ? 1 / 25 : 0,
    obelisk >= 60 ? 1 / 1000 : 0,
    obelisk >= 60 ? 1 / 30 : 0,
    1 / 200,
    1 / 2000,
    1 / 2500,
  ];
  return p.reduce((acc, pi) => acc * (1 - pi), 1);
}

/** Sample one gift's gem value (no recursion for 3/25 gifts: use EV for those to keep sim fast and stable). Wiki Store#Gifts. */
function sampleOneGiftGemValue(params: GiftSimParams, rng: () => number): number {
  const obelisk = clampPositive(params.obelisk_level, 0);
  const obeliskMult = calculateObeliskMultiplier(params);
  const skillShardValue = clampPositive(params.skill_shard_value_gems, 12.5);
  const probBasicRoll = getBasicRollProbability(obelisk, params.gift_black_hole_unlocked);

  const luckyRoll = rng();
  let luckyMultThis = 1;
  if (luckyRoll < (1 / 20) * (1 / 2500)) luckyMultThis = 150;
  else if (luckyRoll < 1 / 2500) luckyMultThis = 50;
  else if (luckyRoll < 1 / 20) luckyMultThis = 3;

  const rareIndex = sampleRareChainIndex(obelisk, rng, params.gift_black_hole_unlocked);

  if (rareIndex >= 0) {
    const gems80_130_avg = 105;
    const droneFuelAvgQty = 5 + 2 * obelisk;
    const gemsPerFuel = params.gift_drone_fuel_gems_per_fuel ?? 5;
    const giftEvPerGift = params.__giftEvPerGift ?? 0;
    const gems15k25kAvg = 20000;
    switch (rareIndex) {
      case 0:
        return 0;
      case 1:
        return 3 * giftEvPerGift;
      case 2:
        return gems80_130_avg * obeliskMult * luckyMultThis;
      case 3:
      case 4:
      case 5:
      case 7:
        return 0;
      case 6:
        return droneFuelAvgQty * gemsPerFuel * luckyMultThis;
      case 8:
      case 9:
        return 0;
      case 10:
        return gems15k25kAvg * luckyMultThis;
      case 11:
        return params.gift_forbidden_sushi_gem_value ?? 0;
      case 12:
        return 1.5 * (params.gift_cosmic_candy_gem_value ?? 0);
      case 13:
        return 105 * luckyMultThis;
      case 14:
        return 25 * giftEvPerGift;
      case 15:
        return 0;
      default:
        return 0;
    }
  }

  const gems20_40 = 30;
  const gems20_50 = 35;
  const gems90_150 = 120;
  const skillShardsBase = 3.5;
  const itemChestsAvg = 32.5;
  const chaosTotemAvg = 12.5;
  const chargeMagnetAvg = 16;
  const chestValue = params.gift_item_chest_value ?? 0;
  const totemValue = params.gift_chaos_totem_value_per_totem ?? 0;
  const magnetValue = params.gift_charge_magnet_value_per_magnet ?? 0;
  const fishingTickValue = params.gift_fishing_tick_value ?? 0;

  const chaosVal = params.gift_chaos_totem_100_from_bombs ? 0 : chaosTotemAvg * totemValue * luckyMultThis;
  const chargeOrFishingVal = params.gift_fishing_unlocked ? fishingTickValue * luckyMultThis : chargeMagnetAvg * magnetValue * luckyMultThis;
  const basicSushi4_6 = 0; // 4–6 Sushi basic: 0 gems (sushi has no gem value in sim)
  const basicValues = [
    gems20_40 * obeliskMult * luckyMultThis,
    gems20_50 * obeliskMult * luckyMultThis,
    gems90_150 * obeliskMult * luckyMultThis,
    skillShardsBase * skillShardValue * obeliskMult * luckyMultThis,
    itemChestsAvg * chestValue * luckyMultThis,
    chaosVal,
    chargeOrFishingVal,
    basicSushi4_6,
    gems20_40 * obeliskMult * luckyMultThis,
    gems20_50 * obeliskMult * luckyMultThis,
    gems90_150 * obeliskMult * luckyMultThis,
    skillShardsBase * skillShardValue * obeliskMult * luckyMultThis,
  ];
  const which = Math.floor(rng() * 12);
  return basicValues[which] ?? 0;
}

/** Sample one gift's gem value and sushi quantity (wiki Store#Gifts; sushi from rare 8 = 15–24, 9 = 50–60). */
function sampleOneGiftGemsAndSushi(params: GiftSimParams, rng: () => number): { gems: number; sushi: number } {
  const obelisk = clampPositive(params.obelisk_level, 0);
  const obeliskMult = calculateObeliskMultiplier(params);
  const luckyMult = calculateLuckyMultiplier();
  const probBasicRoll = getBasicRollProbability(obelisk, params.gift_black_hole_unlocked);

  const luckyRoll = rng();
  let luckyMultThis = 1;
  if (luckyRoll < (1 / 20) * (1 / 2500)) luckyMultThis = 150;
  else if (luckyRoll < 1 / 2500) luckyMultThis = 50;
  else if (luckyRoll < 1 / 20) luckyMultThis = 3;

  const rareIndex = sampleRareChainIndex(obelisk, rng, params.gift_black_hole_unlocked);

  if (rareIndex >= 0) {
    const gems80_130_avg = 105;
    const droneFuelAvgQty = 5 + 2 * obelisk;
    const gemsPerFuel = params.gift_drone_fuel_gems_per_fuel ?? 5;
    const giftEvPerGift = params.__giftEvPerGift ?? 0;
    const gems15k25kAvg = 20000;
    switch (rareIndex) {
      case 0:
      case 3:
      case 4:
      case 5:
      case 7:
      case 11:
      case 12:
      case 15:
        return { gems: 0, sushi: 0 };
      case 1:
        return { gems: 3 * giftEvPerGift, sushi: 0 };
      case 2:
        return { gems: gems80_130_avg * obeliskMult * luckyMultThis, sushi: 0 };
      case 6:
        return { gems: droneFuelAvgQty * gemsPerFuel * luckyMultThis, sushi: 0 };
      case 8:
        return { gems: 0, sushi: (15 + rng() * 9) * luckyMultThis };
      case 9:
        return { gems: 0, sushi: (50 + rng() * 10) * luckyMultThis };
      case 10:
        return { gems: gems15k25kAvg * luckyMultThis, sushi: 0 };
      case 13:
        return { gems: 105 * luckyMultThis, sushi: 0 };
      case 14:
        return { gems: 25 * giftEvPerGift, sushi: 0 };
      default:
        return { gems: 0, sushi: 0 };
    }
  }

  const skillShardValue = clampPositive(params.skill_shard_value_gems, 12.5);
  const gems20_40 = 30;
  const gems20_50 = 35;
  const gems90_150 = 120;
  const skillShardsBase = 3.5;
  const itemChestsAvg = 32.5;
  const chaosTotemAvg = 12.5;
  const chargeMagnetAvg = 16;
  const chestValue = params.gift_item_chest_value ?? 0;
  const totemValue = params.gift_chaos_totem_value_per_totem ?? 0;
  const magnetValue = params.gift_charge_magnet_value_per_magnet ?? 0;
  const fishingTickValue = params.gift_fishing_tick_value ?? 0;

  const chaosVal = params.gift_chaos_totem_100_from_bombs ? 0 : chaosTotemAvg * totemValue * luckyMultThis;
  const chargeOrFishingVal = params.gift_fishing_unlocked ? fishingTickValue * luckyMultThis : chargeMagnetAvg * magnetValue * luckyMultThis;
  const basicSushi4_6 = 0; // 4–6 Sushi basic: 0 gems
  const basicValues = [
    gems20_40 * obeliskMult * luckyMultThis,
    gems20_50 * obeliskMult * luckyMultThis,
    gems90_150 * obeliskMult * luckyMultThis,
    skillShardsBase * skillShardValue * obeliskMult * luckyMultThis,
    itemChestsAvg * chestValue * luckyMultThis,
    chaosVal,
    chargeOrFishingVal,
    basicSushi4_6,
    gems20_40 * obeliskMult * luckyMultThis,
    gems20_50 * obeliskMult * luckyMultThis,
    gems90_150 * obeliskMult * luckyMultThis,
    skillShardsBase * skillShardValue * obeliskMult * luckyMultThis,
  ];
  const which = Math.floor(rng() * 12);
  return { gems: basicValues[which] ?? 0, sushi: 0 };
}

export interface VarianceSimHourResult {
  /** Gems from freebie claims (base gems + skill shards only, no stonks). */
  freebieBaseGems: number;
  /** Gems from normal stonks procs in that hour. */
  stonksGemsNormal: number;
  /** Gems from super stonks in that hour. */
  stonksGemsSuper: number;
  /** Gems from ultra stonks in that hour. */
  stonksGemsUltra: number;
  /** Gems from freebie claims (base + skill shards + all stonks) in that hour. */
  freebieGems: number;
  /** Number of gifts received in that hour (freebie + founder). */
  giftsCount: number;
  /** Gem value from opening those gifts. */
  giftGems: number;
  /** Sushi from opening those gifts (rare outcomes 15–24 or 50–60 per gift). */
  giftSushi: number;
  /** Gem value from Lootfrog (frogspawn from supply drop × value per frogspawn). */
  lootfrogGems: number;
  /** 10× Bomb Recharge minutes from Lootbug in that hour. */
  lootbug10xMin: number;
  /** Net gems from Lootbug (gains − gem cost) in that hour. */
  lootbugNetGems: number;
  /** Founder supply drop gems (base + bonus + rare 650) in that hour. */
  founderGems: number;
  /** Charge Magnet impact (from item chests) in that hour. */
  chargeMagnetGems: number;
  /** Gem Bomb gems in that hour (scaled by simulated 10× min). */
  gemBombGems: number;
  /** Drone fuel cost (negative) in that hour. */
  droneFuelCost: number;
  /** Total gem-equivalent for this hour (matches Overview chart: freebie + founder + gifts + lootfrog + lootbug + gem bomb + charge magnet − drone). */
  totalGems: number;
  /** Stonks procs this hour (first roll per freebie pop only; each instant refresh is a separate pop). */
  stonksProcs: number;
  /** Super Stonks procs this hour (only after a Stonks proc on the same claim). */
  superStonksProcs: number;
  /** Ultra Stonks procs this hour (only after Super on the same claim). */
  ultraStonksProcs: number;
}

/** Inputs from Overview chart / external so the sim can compute total and Items/Drone/Gem Bomb. */
export interface VarianceOverviewInputs {
  /** Expected total item chests per hour (all sources) for Charge Magnet scaling. */
  expectedTotalChestsPerHour: number;
  /** Charge Magnet impact (gems/h) when chests = expected. */
  chargeMagnetImpact: number;
  /** Expected Gem Bomb gems per hour (full, with 10×). */
  expectedGemBombPerHour: number;
  /** Expected 10× min/h (Lootbug + Drone). */
  expected10xMinPerHour: number;
  /** Gem Bomb gems attributable to 10× (so we can scale by simulated 10×). */
  gemBomb10xImpact: number;
  /** Drone fuel cost (positive number; subtracted from total). */
  droneFuelCostPerHour: number;
  /** Drone 10× min per hour (added to Lootbug 10× for total 10×). */
  drone10xMinPerHour: number;
  /** Expected item chests per gift (for gift chest count). */
  expectedItemChestsPerGift: number;
  /** Lootbug item chests per hour (for chest count from Lootbug spawns). */
  lootbugItemChestsPerHour: number;
  /** Items per chest (multiplier for Charge Magnet). */
  itemsPerChest: number;
}

/** Full breakdown of one simulated hour for the reporting chart. */
export interface SampleHourReport {
  freebieClaims: number;
  freebieGems: number;
  jackpotCount: number;
  stonksProcs: number;
  giftsFromFreebie: number;
  supplyDropEvents: number;
  founderGifts: number;
  frogspawn: number;
  lootfrogGems: number;
  totalGifts: number;
  giftGems: number;
  giftSushi: number;
  lootbug10xMin: number;
  lootbugNetGems: number;
  freebieChests: number;
  stonksChests: number;
  founderDrops: number;
  founderChests: number;
  giftChests: number;
  lootbugChests: number;
  totalChests: number;
  founderGems: number;
  chargeMagnetGems: number;
  gemBombGems: number;
  droneFuelCost: number;
  totalGems: number;
}

type SimParams = GameParameters & {
  __giftEvPerGift?: number;
  __lootbug10xMinPerHour?: number;
  __lootbugSpawnsPerHour?: number;
  __lootbugNetGemsPerHour?: number;
  __froggerLootfrogsPerHour?: number;
  __froggerLootfrogGemValue?: number;
  lootfrogValuePerFrogspawn?: number;
  __overview?: VarianceOverviewInputs;
};

/** Simulate one hour: freebie claims, Lootbug, gifts (Soprano + Founder), and frogspawn. Optionally return full report for chart. */
export function simulateOneHour(
  params: SimParams,
  rng: () => number,
  options?: { withReport: true }
): VarianceSimHourResult & (typeof options extends { withReport: true } ? { report: SampleHourReport } : object) {
  const effectiveTimerMin = getEffectiveFreebieTimerMinutes(params);
  const pRefresh = clamp01(params.instant_refresh_chance);

  /** One freebie pop = timer completion or instant refresh; each pop gets its own Stonks roll (first roll only; jackpot extra rolls do not). */
  let claims = 0;
  let timeMin = 0;
  const pJackpot = clamp01(params.jackpot_chance);
  const jackpotRolls = Math.max(1, Math.trunc(params.jackpot_rolls ?? 5));
  const baseGems = clampPositive(params.freebie_gems_base, 9);
  const skillChance = clamp01(params.skill_shard_chance);
  const skillValue = clampPositive(params.skill_shard_value_gems, 12.5);
  const stonksChance = clamp01(params.stonks_chance);
  const stonksReward = clampPositive(params.stonks_bonus_gems, 200) * clampPositive(params.stonks_multiplier ?? 1, 0);
  const superChance = clamp01(params.super_stonks_chance ?? 0);
  const superMult = clampPositive(params.super_stonks_multiplier ?? 2, 0);
  const ultraChance = clamp01(params.ultra_stonks_chance ?? 0);
  const ultraMult = clampPositive(params.ultra_stonks_multiplier ?? 25, 0);
  const stonksAllMult = clampPositive(params.stonks_all_multiplier ?? 1, 0);

  const sopranoLevel = Math.max(0, Math.min(3, clampInt(params.statue_soprano_level ?? 0, 0)));
  const sopranoGiftChance = sopranoLevel === 1 ? 0.005 : sopranoLevel === 2 ? 0.0075 : sopranoLevel === 3 ? 0.01 : 0;
  const soprano100xChance = sopranoLevel === 1 ? 1 / 50000 : sopranoLevel === 2 ? 1 / 35000 : sopranoLevel === 3 ? 1 / 25000 : 0;

  let freebieBaseGems = 0; // base gems + skill shards only (no stonks)
  let stonksGemsNormal = 0;
  let stonksGemsSuper = 0;
  let stonksGemsUltra = 0;
  let freebieGiftCount = 0;
  let jackpotCount = 0;
  let stonksProcs = 0;
  let superStonksProcs = 0;
  let ultraStonksProcs = 0;

  const processOneFreebiePop = () => {
    claims += 1;
    const isJackpot = rng() < pJackpot;
    if (isJackpot) jackpotCount += 1;
    const rolls = isJackpot ? jackpotRolls : 1;
    let stonksDone = false;
    let giftRolled = false;
    for (let r = 0; r < rolls; r++) {
      freebieBaseGems += baseGems;
      if (rng() < skillChance) freebieBaseGems += skillValue;
      if (!stonksDone) {
        stonksDone = true;
        if (rng() < stonksChance) {
          stonksProcs += 1;
          stonksGemsNormal += stonksReward * stonksAllMult;
          if (superChance > 0 && rng() < superChance) {
            superStonksProcs += 1;
            stonksGemsSuper += stonksReward * (superMult - 1) * stonksAllMult;
            if (ultraChance > 0 && rng() < ultraChance) {
              ultraStonksProcs += 1;
              stonksGemsUltra += stonksReward * (superMult * ultraMult - superMult) * stonksAllMult;
            }
          }
        }
      }
      if (!giftRolled) {
        giftRolled = true;
        if (rng() < sopranoGiftChance) freebieGiftCount += 1;
        if (rng() < soprano100xChance) freebieGiftCount += 100;
      }
    }
  };

  while (timeMin < 60) {
    timeMin += effectiveTimerMin;
    let chainOpen = true;
    while (chainOpen) {
      chainOpen = false;
      processOneFreebiePop();
      if (pRefresh > 0 && rng() < pRefresh) chainOpen = true;
    }
  }

  const freebieGems = freebieBaseGems + stonksGemsNormal + stonksGemsSuper + stonksGemsUltra;

  let founderGiftCount = 0;
  let frogspawnCount = 0;
  let supplyDropEvents = 0;
  let founderDropsCount = 0;
  let founderGems = 0;
  let qtyMultFounder = 0;
  const founderEnabled = Boolean(params.founder_enabled);
  const lootfrogsUnlocked = Boolean(params.lootfrogs_unlocked);
  const giftEvPerGift = params.__giftEvPerGift ?? 0;

  if (founderEnabled) {
    const intervalMin = getFounderDropIntervalMinutes(params);
    const eventsPerHour = 60 / intervalMin;
    const nFull = Math.floor(eventsPerHour);
    const nExtra = eventsPerHour > nFull && rng() < eventsPerHour - nFull ? 1 : 0;
    supplyDropEvents = nFull + nExtra;
    const doubleChance = clamp01(getDoubleDropChance(params));
    const tripleChance = clamp01(getTripleDropChance(params));
    const singleChance = 1 - doubleChance - tripleChance;
    qtyMultFounder = getSupplyDropQuantityMultiplier(params);
    const qtyMult = qtyMultFounder;
    const goldenChance = getGoldenSupplyDropChance(params);
    const founderBase = clampPositive(params.founder_gems_base, 30);
    const bonusPerDrop = 50 + 10 * clampPositive(params.obelisk_level, 29);
    const founderBonusChance = clamp01(params.founder_gems_chance);

    for (let e = 0; e < supplyDropEvents; e++) {
      const dropRand = rng();
      const dropsThisEvent = dropRand < singleChance ? 1 : dropRand < singleChance + doubleChance ? 2 : 3;
      for (let d = 0; d < dropsThisEvent; d++) {
        founderDropsCount += 1;
        const isGolden = rng() < goldenChance;
        founderGems += founderBase * (isGolden ? 5 : 1) * qtyMult;
        if (rng() < founderBonusChance) founderGems += bonusPerDrop * qtyMult;
        if (rng() < 1 / 100) founderGems += 650 * qtyMult;
        if (rng() < 1 / 1234) founderGiftCount += 10 * qtyMult;
        if (lootfrogsUnlocked && rng() < 1 / 500) frogspawnCount += 5 * qtyMult;
      }
    }
  }

  const totalGifts = Math.trunc(freebieGiftCount) + Math.round(founderGiftCount);
  let giftGems = 0;
  let giftSushi = 0;
  for (let g = 0; g < totalGifts; g++) {
    const { gems, sushi } = sampleOneGiftGemsAndSushi(params, rng);
    giftGems += gems;
    giftSushi += sushi;
  }

  const frogspawnValuePer = params.lootfrogValuePerFrogspawn ?? 0;
  const founderFrogspawnLootfrogGems = frogspawnCount * frogspawnValuePer;
  const froggerLootfrogsPerHour = Math.max(0, Number(params.__froggerLootfrogsPerHour ?? 0));
  const froggerLootfrogGemValue = Math.max(0, Number(params.__froggerLootfrogGemValue ?? 0));
  const froggerLootfrogs = froggerLootfrogsPerHour > 0 ? poisson(froggerLootfrogsPerHour, rng) : 0;
  const froggerLootfrogGems = froggerLootfrogs * froggerLootfrogGemValue;
  const lootfrogGems = founderFrogspawnLootfrogGems + froggerLootfrogGems;

  // Lootbug: 10× min from Poisson(mean/2)*2; net gems from Poisson(spawns)*avgPerSpawn
  const lootbug10xMean = params.__lootbug10xMinPerHour ?? 0;
  const lootbugSpawnsPerHour = params.__lootbugSpawnsPerHour ?? 0;
  const lootbugNetGemsPerHour = params.__lootbugNetGemsPerHour ?? 0;
  const lootbug10xMin = lootbug10xMean > 0
    ? 2 * poisson(lootbug10xMean / 2, rng)
    : 0;
  const lootbugSpawns = lootbugSpawnsPerHour > 0 ? poisson(lootbugSpawnsPerHour, rng) : 0;
  const lootbugNetGems = lootbugSpawnsPerHour > 0 && lootbugNetGemsPerHour !== 0
    ? (lootbugSpawns / lootbugSpawnsPerHour) * lootbugNetGemsPerHour
    : 0;

  const ov = params.__overview;
  const freebieChests = claims + 4 * jackpotCount;
  const stonksChests = 20 * stonksProcs;
  const founderChests = founderDropsCount * 6 * qtyMultFounder;
  const expectedItemChestsPerGift = ov?.expectedItemChestsPerGift ?? 0;
  const giftChests = totalGifts * expectedItemChestsPerGift;
  const lootbugChests = lootbugSpawnsPerHour > 0 && (ov?.lootbugItemChestsPerHour ?? 0) > 0
    ? (lootbugSpawns / lootbugSpawnsPerHour) * (ov?.lootbugItemChestsPerHour ?? 0)
    : 0;
  const itemsPerChest = ov?.itemsPerChest ?? 1;
  const totalChests = freebieChests + stonksChests + founderChests + giftChests + lootbugChests;
  const expectedTotalChests = ov?.expectedTotalChestsPerHour ?? 1;
  const chargeMagnetGems = (ov?.chargeMagnetImpact ?? 0) * (expectedTotalChests > 0 ? totalChests / expectedTotalChests : 0);
  const total10xMin = lootbug10xMin + (ov?.drone10xMinPerHour ?? 0);
  const expected10x = ov?.expected10xMinPerHour ?? 0;
  const gemBomb10xImpact = ov?.gemBomb10xImpact ?? 0;
  const expectedGemBomb = ov?.expectedGemBombPerHour ?? 0;
  const gemBombGems = expected10x > 0 && gemBomb10xImpact !== 0
    ? expectedGemBomb - gemBomb10xImpact + gemBomb10xImpact * (total10xMin / expected10x)
    : expectedGemBomb;
  const droneFuelCost = ov?.droneFuelCostPerHour ?? 0;

  const totalGems = freebieGems + founderGems + giftGems + lootfrogGems + lootbugNetGems + gemBombGems + chargeMagnetGems - droneFuelCost;

  const result: VarianceSimHourResult = {
    freebieBaseGems,
    stonksGemsNormal,
    stonksGemsSuper,
    stonksGemsUltra,
    freebieGems,
    giftsCount: totalGifts,
    giftGems,
    giftSushi,
    lootfrogGems,
    lootbug10xMin,
    lootbugNetGems,
    founderGems,
    chargeMagnetGems,
    gemBombGems,
    droneFuelCost,
    totalGems,
    stonksProcs,
    superStonksProcs,
    ultraStonksProcs,
  };

  if (options?.withReport) {
    const report: SampleHourReport = {
      freebieClaims: claims,
      freebieGems,
      jackpotCount,
      stonksProcs,
      giftsFromFreebie: Math.trunc(freebieGiftCount),
      supplyDropEvents,
      founderGifts: Math.round(founderGiftCount),
      frogspawn: frogspawnCount,
      lootfrogGems,
      totalGifts,
      giftGems,
      giftSushi: result.giftSushi,
      lootbug10xMin,
      lootbugNetGems,
      freebieChests,
      stonksChests,
      founderDrops: founderDropsCount,
      founderChests,
      giftChests,
      lootbugChests,
      totalChests,
      founderGems,
      chargeMagnetGems,
      gemBombGems,
      droneFuelCost,
      totalGems,
    };
    return { ...result, report } as VarianceSimHourResult & { report: SampleHourReport };
  }
  return result as VarianceSimHourResult & object;
}

export type VarianceMetricStats = {
  mean: number;
  sd: number;
  min: number;
  max: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
};

export interface VarianceSimResult {
  freebieBaseGems: VarianceMetricStats;
  stonksGemsNormal: VarianceMetricStats;
  stonksGemsSuper: VarianceMetricStats;
  stonksGemsUltra: VarianceMetricStats;
  freebieGems: VarianceMetricStats;
  stonksProcs: VarianceMetricStats;
  superStonksProcs: VarianceMetricStats;
  ultraStonksProcs: VarianceMetricStats;
  giftsCount: VarianceMetricStats;
  giftGems: VarianceMetricStats;
  giftSushi: VarianceMetricStats;
  lootfrogGems: VarianceMetricStats;
  lootbug10xMin: VarianceMetricStats;
  lootbugNetGems: VarianceMetricStats;
  founderGems: VarianceMetricStats;
  chargeMagnetGems: VarianceMetricStats;
  gemBombGems: VarianceMetricStats;
  droneFuelCost: VarianceMetricStats;
  totalGems: VarianceMetricStats;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? 0;
  return (sorted[lo] ?? 0) * (1 - (idx - lo)) + (sorted[hi] ?? 0) * (idx - lo);
}

function meanAndSd(arr: number[]): { mean: number; sd: number } {
  const n = arr.length;
  if (n === 0) return { mean: 0, sd: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? arr.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, sd: Math.sqrt(variance) };
}

function toMetricStats(arr: number[], sorted: number[]): VarianceMetricStats {
  const n = arr.length;
  const { mean, sd } = meanAndSd(arr);
  const min = n > 0 ? (sorted[0] ?? 0) : 0;
  const max = n > 0 ? (sorted[n - 1] ?? 0) : 0;
  return {
    mean,
    sd,
    min,
    max,
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
  };
}

/** Run nHours simulations and return percentiles. Optionally returns one sample hour report for the chart. */
export function runVarianceSim(
  params: GameParameters,
  nHours: number,
  giftEvPerGift: number,
  lootfrogValuePerFrogspawn: number,
  froggerLootfrogsPerHour: number,
  froggerLootfrogGemValue: number,
  lootbugOptions: { lootbug10xMinPerHour: number; lootbugSpawnsPerHour: number; lootbugNetGemsPerHour: number },
  overviewInputs: VarianceOverviewInputs,
  rng: () => number = Math.random
): VarianceSimResult & { sampleReport?: SampleHourReport } {
  const p: SimParams = {
    ...params,
    __giftEvPerGift: giftEvPerGift,
    lootfrogValuePerFrogspawn: lootfrogValuePerFrogspawn,
    __froggerLootfrogsPerHour: froggerLootfrogsPerHour,
    __froggerLootfrogGemValue: froggerLootfrogGemValue,
    __lootbug10xMinPerHour: lootbugOptions.lootbug10xMinPerHour,
    __lootbugSpawnsPerHour: lootbugOptions.lootbugSpawnsPerHour,
    __lootbugNetGemsPerHour: lootbugOptions.lootbugNetGemsPerHour,
    __overview: overviewInputs,
  };
  const freebieBaseGems: number[] = [];
  const stonksGemsNormal: number[] = [];
  const stonksGemsSuper: number[] = [];
  const stonksGemsUltra: number[] = [];
  const stonksProcs: number[] = [];
  const superStonksProcs: number[] = [];
  const ultraStonksProcs: number[] = [];
  const freebieGems: number[] = [];
  const giftsCount: number[] = [];
  const giftGems: number[] = [];
  const giftSushi: number[] = [];
  const lootfrogGems: number[] = [];
  const lootbug10xMin: number[] = [];
  const lootbugNetGems: number[] = [];
  const founderGems: number[] = [];
  const chargeMagnetGems: number[] = [];
  const gemBombGems: number[] = [];
  const droneFuelCost: number[] = [];
  const totalGems: number[] = [];
  let sampleReport: SampleHourReport | undefined;
  for (let i = 0; i < nHours; i++) {
    const withReport = i === nHours - 1;
    const hour = withReport ? simulateOneHour(p, rng, { withReport: true }) : simulateOneHour(p, rng);
    freebieBaseGems.push(hour.freebieBaseGems);
    stonksGemsNormal.push(hour.stonksGemsNormal);
    stonksGemsSuper.push(hour.stonksGemsSuper);
    stonksGemsUltra.push(hour.stonksGemsUltra);
    stonksProcs.push(hour.stonksProcs);
    superStonksProcs.push(hour.superStonksProcs);
    ultraStonksProcs.push(hour.ultraStonksProcs);
    freebieGems.push(hour.freebieGems);
    giftsCount.push(hour.giftsCount);
    giftGems.push(hour.giftGems);
    giftSushi.push(hour.giftSushi);
    lootfrogGems.push(hour.lootfrogGems);
    lootbug10xMin.push(hour.lootbug10xMin);
    lootbugNetGems.push(hour.lootbugNetGems);
    founderGems.push(hour.founderGems);
    chargeMagnetGems.push(hour.chargeMagnetGems);
    gemBombGems.push(hour.gemBombGems);
    droneFuelCost.push(hour.droneFuelCost);
    totalGems.push(hour.totalGems);
    if (withReport && "report" in hour) sampleReport = (hour as { report: SampleHourReport }).report;
  }
  const sort = (a: number, b: number) => a - b;
  const fbg = [...freebieBaseGems]; fbg.sort(sort);
  const sgn = [...stonksGemsNormal]; sgn.sort(sort);
  const sgs = [...stonksGemsSuper]; sgs.sort(sort);
  const sgu = [...stonksGemsUltra]; sgu.sort(sort);
  const sp = [...stonksProcs]; sp.sort(sort);
  const ssp = [...superStonksProcs]; ssp.sort(sort);
  const sup = [...ultraStonksProcs]; sup.sort(sort);
  const fg = [...freebieGems]; fg.sort(sort);
  const gc = [...giftsCount]; gc.sort(sort);
  const gg = [...giftGems]; gg.sort(sort);
  const gs = [...giftSushi]; gs.sort(sort);
  const lfg = [...lootfrogGems]; lfg.sort(sort);
  const l10 = [...lootbug10xMin]; l10.sort(sort);
  const ln = [...lootbugNetGems]; ln.sort(sort);
  const fdg = [...founderGems]; fdg.sort(sort);
  const cm = [...chargeMagnetGems]; cm.sort(sort);
  const gb = [...gemBombGems]; gb.sort(sort);
  const df = [...droneFuelCost]; df.sort(sort);
  const tot = [...totalGems]; tot.sort(sort);
  const result: VarianceSimResult = {
    freebieBaseGems: toMetricStats(freebieBaseGems, fbg),
    stonksGemsNormal: toMetricStats(stonksGemsNormal, sgn),
    stonksGemsSuper: toMetricStats(stonksGemsSuper, sgs),
    stonksGemsUltra: toMetricStats(stonksGemsUltra, sgu),
    freebieGems: toMetricStats(freebieGems, fg),
    stonksProcs: toMetricStats(stonksProcs, sp),
    superStonksProcs: toMetricStats(superStonksProcs, ssp),
    ultraStonksProcs: toMetricStats(ultraStonksProcs, sup),
    giftsCount: toMetricStats(giftsCount, gc),
    giftGems: toMetricStats(giftGems, gg),
    giftSushi: toMetricStats(giftSushi, gs),
    lootfrogGems: toMetricStats(lootfrogGems, lfg),
    lootbug10xMin: toMetricStats(lootbug10xMin, l10),
    lootbugNetGems: toMetricStats(lootbugNetGems, ln),
    founderGems: toMetricStats(founderGems, fdg),
    chargeMagnetGems: toMetricStats(chargeMagnetGems, cm),
    gemBombGems: toMetricStats(gemBombGems, gb),
    droneFuelCost: toMetricStats(droneFuelCost, df),
    totalGems: toMetricStats(totalGems, tot),
  };
  return sampleReport ? { ...result, sampleReport } : result;
}

/** Simulate a single hour and return full report for the reporting chart. */
export function getSampleHourReport(
  params: GameParameters,
  giftEvPerGift: number,
  lootfrogValuePerFrogspawn: number,
  lootbugOptions: { lootbug10xMinPerHour: number; lootbugSpawnsPerHour: number; lootbugNetGemsPerHour: number },
  overviewInputs: VarianceOverviewInputs,
  rng: () => number = Math.random
): SampleHourReport {
  const p: SimParams = {
    ...params,
    __giftEvPerGift: giftEvPerGift,
    lootfrogValuePerFrogspawn: lootfrogValuePerFrogspawn,
    __lootbug10xMinPerHour: lootbugOptions.lootbug10xMinPerHour,
    __lootbugSpawnsPerHour: lootbugOptions.lootbugSpawnsPerHour,
    __lootbugNetGemsPerHour: lootbugOptions.lootbugNetGemsPerHour,
    __overview: overviewInputs,
  };
  const hour = simulateOneHour(p, rng, { withReport: true });
  return (hour as VarianceSimHourResult & { report: SampleHourReport }).report;
}
