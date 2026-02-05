/**
 * Compute fishing stats from upgrade and enhancement levels (game formulas).
 * Source: https://shminer.miraheze.org/wiki/Fishing#Upgrades and #Enhancements
 */

import type { EnhanceId, FishingUpgradeId } from "./types";

/** All stats computed from upgrade and enhancement levels (including boat levels). */
export interface ComputedFishingStats {
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
}

function lvl(
  levels: Partial<Record<string, number>>,
  id: string,
): number {
  const v = levels[id];
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Compute all stats that derive from upgrade and enhancement levels.
 * Boat levels come from Upgrade Boat and Upgrade Tier 2 Boat upgrades.
 */
export function computeFishingStatsFromLevels(
  upgradeLevels: Partial<Record<FishingUpgradeId, number>>,
  enhanceLevels: Partial<Record<EnhanceId, number>>,
): ComputedFishingStats {
  const u = (id: FishingUpgradeId) => lvl(upgradeLevels, id);
  const e = (id: EnhanceId) => lvl(enhanceLevels, id);

  // Boat levels: from Upgrade Boat (+1 per level, max 5) and Upgrade Tier 2 Boat (+1 per level, max 5).
  const boat_level = u("upgrade_boat");
  const t2_boat_level = u("upgrade_t2_boat");

  // Fishing Rod: base 10, ×1.16 per level (first upgrade 10×1.16 ≈ 11.6 → 12). Rod Multiplier +0.04x (upgrade), +0.05x (enhance). Round like elsewhere.
  const ROD_POWER_BASE = 10;
  const rodBase = ROD_POWER_BASE * Math.pow(1.16, u("fishing_rod"));
  const rodMultiUpgrade = 1 + 0.04 * u("rod_multiplier");
  const rodMultiEnhance = 1 + 0.05 * e("enhance_rod_multiplier");
  const fishing_rod_power = Math.round(rodBase * rodMultiUpgrade * rodMultiEnhance);

  // Fish Income Multiplier: +0.03x (upgrade), +0.05x (enhance). Additive on base 1.
  const fish_income_multi =
    1 + 0.03 * u("fish_multiplier") + 0.05 * e("enhance_fish_multiplier");

  // Tick reduction: each level reduces tick by 0.5s. Base 60s, so reduction = -0.5 * levels.
  const fishing_tick_reduction =
    -0.5 * u("tick_speed") - 0.5 * e("enhance_tick_speed");

  // Drone Base Power: base 3, +0.25 per level. Drone Multiplier +0.06x (upgrade), +0.08x (enhance).
  const droneBase = 3 + 0.25 * u("drone_base_power");
  const droneMultiUpgrade = 1 + 0.06 * u("drone_multiplier");
  const droneMultiEnhance = 1 + 0.08 * e("enhance_drone_multiplier");
  const drone_base_power = droneBase * droneMultiUpgrade * droneMultiEnhance;

  // Fishing Drone Cap: base 0, then from upgrades (+1 per fishing_drone, +2 per fishing_drone_2) and enhancements (+1 per enhance_fishing_drone, +3 per enhance_fishing_drone_3); then Drone Cloner 1.05x.
  const capFromUpgradesAndEnhancements =
    0 +
    1 * u("fishing_drone") +
    2 * u("fishing_drone_2") +
    1 * e("enhance_fishing_drone") +
    3 * e("enhance_fishing_drone_3");
  const fishing_drone_cap = capFromUpgradesAndEnhancements * Math.pow(1.05, u("drone_cloner"));

  // Token Gain Multiplier: only from enhancement +0.05x per level.
  const token_gain_multi = 1 + 0.05 * e("enhance_token_multiplier");

  // Notice fish requirement: no upgrade source in game; use 1.
  const notice_fish_req = 1;

  // Shiny Multiplier: base 5, +0.05x (T2 upgrade), +0.05x (enhance).
  const shiny_multiplier =
    5 + 0.05 * u("shiny_multiplier") + 0.05 * e("enhance_shiny_multiplier");

  // Super Shiny / Poly Card Multi: base 3, +0.08x (poly_card_multi), +0.15x (enhance_super_shiny_multi).
  const super_shiny_multiplier =
    3 +
    0.08 * u("poly_card_multi") +
    0.15 * e("enhance_super_shiny_multi");

  return {
    boat_level,
    t2_boat_level,
    fishing_rod_power,
    fishing_drone_cap,
    drone_base_power,
    fish_income_multi,
    fishing_tick_reduction,
    token_gain_multi,
    notice_fish_req,
    shiny_multiplier,
    super_shiny_multiplier,
  };
}
