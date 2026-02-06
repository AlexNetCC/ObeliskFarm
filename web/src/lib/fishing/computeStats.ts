/**
 * Compute fishing stats from upgrade and enhancement levels (game formulas).
 * Source: https://shminer.miraheze.org/wiki/Fishing#Upgrades and #Enhancements
 */

import type { EnhanceId, FishingSkillId, FishingUpgradeId } from "./types";

/** All stats computed from upgrade and enhancement levels (including boat levels). */
export interface ComputedFishingStats {
  boat_level: number;
  t2_boat_level: number;
  fishing_rod_power: number;
  fishing_drone_cap: number;
  drone_base_power: number;
  /** Multiplier on Drone Base Power (from drone_multiplier + enhance). */
  drone_power_multiplier: number;
  fish_income_multi: number;
  fishing_tick_reduction: number;
  /** Double Fish Tick Chance (%). When tick bar fills, chance to get 2 ticks at once. */
  double_tick_chance_pct: number;
  /** Triple Fish Tick Chance (%). */
  triple_tick_chance_pct: number;
  /** 5× Fish Tick Chance (%) – from Fishing only; game can add Relics/Store/Cards. */
  five_tick_chance_pct: number;
  token_gain_multi: number;
  notice_fish_req: number;
  /** Shiny Fish Chance (%). Shiny = crit-like; multiplier applies (base 3×). */
  shiny_fish_chance_pct: number;
  /** Super Shiny Chance (%). Only rolls when catch is already shiny; base mult 2×. */
  super_shiny_chance_pct: number;
  /** Tiny Notice Chance (%). Notice asks for 90% less fish. */
  tiny_notice_chance_pct: number;
  /** Tier 2 Dock Power multiplier (×) applied to power on T2 docks. */
  tier2_dock_power_mult: number;
  shiny_multiplier: number;
  super_shiny_multiplier: number;
  /** Multiplier on fish card gains from upgrades (poly_card_multi, enhance_poly_card_multi). Value Pack (potency poly) applied in UI. */
  poly_card_gain_multi: number;
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

export interface SkillTreeOptions {
  skillTreeLevels?: Partial<Record<FishingSkillId, number>>;
  /** Fish card tier per fish (0–3) for With This Fish I Summon: effective card count. */
  fishCardTier?: Partial<Record<string, number>>;
  /** Legendary fish found (0–6) for Completionist Gatekeeper. */
  legendaryFishFound?: number;
}

/**
 * Compute all stats that derive from upgrade and enhancement levels.
 * Boat levels come from Upgrade Boat and Upgrade Tier 2 Boat upgrades.
 * Optional skill tree levels apply on top (Fishing With Friends, Motley School, etc.).
 */
export function computeFishingStatsFromLevels(
  upgradeLevels: Partial<Record<FishingUpgradeId, number>>,
  enhanceLevels: Partial<Record<EnhanceId, number>>,
  options?: SkillTreeOptions,
): ComputedFishingStats {
  const u = (id: FishingUpgradeId) => lvl(upgradeLevels, id);
  const e = (id: EnhanceId) => lvl(enhanceLevels, id);
  const skill = (id: FishingSkillId) => lvl(options?.skillTreeLevels ?? {}, id);

  // Boat levels: from Upgrade Boat (+1 per level, max 5) and Upgrade Tier 2 Boat (+1 per level, max 5).
  const boat_level = u("upgrade_boat");
  const t2_boat_level = u("upgrade_t2_boat");

  // Fishing Rod: base 10, ×1.16 per level (first upgrade 10×1.16 ≈ 11.6 → 12). Rod Multiplier +0.04x (upgrade), +0.05x (enhance). Skill: Motley School +10% per level.
  const ROD_POWER_BASE = 10;
  const rodBase = ROD_POWER_BASE * Math.pow(1.16, u("fishing_rod"));
  const rodMultiUpgrade = 1 + 0.04 * u("rod_multiplier");
  const rodMultiEnhance = 1 + 0.05 * e("enhance_rod_multiplier");
  const rodMultiSkill = 1 + 0.1 * skill("motley_school");
  const fishing_rod_power = Math.round(rodBase * rodMultiUpgrade * rodMultiEnhance * rodMultiSkill);

  // Fish Income Multiplier: +0.03x (upgrade), +0.05x (enhance). Additive on base 1. Skill: Fishing With Friends +3% per level; With This Fish I Summon +1% per fish card per level.
  const effectiveFishCardCount =
    (options?.fishCardTier &&
      Object.values(options.fishCardTier).reduce<number>(
        (sum, t) => sum + (t === 1 ? 1 : t === 2 ? 2 : t === 3 ? 3 : 0),
        0,
      )) ??
    0;
  const fish_income_multi_base =
    1 + 0.03 * u("fish_multiplier") + 0.05 * e("enhance_fish_multiplier");
  const fish_income_multi =
    fish_income_multi_base +
    0.03 * skill("fishing_with_friends") +
    0.01 * skill("with_this_fish_i_summon_two_more_fish") * effectiveFishCardCount;

  // Tick reduction: each level reduces tick by 0.5s. Base 60s. Skill: Let's Pick Up The Pace -2s per level.
  const fishing_tick_reduction =
    -0.5 * u("tick_speed") -
    0.5 * e("enhance_tick_speed") -
    2 * skill("lets_pick_up_the_pace");

  // Drone Base Power: base 3, +0.25 per level. Drone Power Multiplier +0.06x (upgrade), +0.08x (enhance). Skill: Fishing With Friends +10% per level; Completionist Gatekeeper +2% per level per legendary (0–6).
  const droneBase = 3 + 0.25 * u("drone_base_power");
  const droneMultiUpgrade = 1 + 0.06 * u("drone_multiplier");
  const droneMultiEnhance = 1 + 0.08 * e("enhance_drone_multiplier");
  const legendary = Math.max(0, Math.min(6, options?.legendaryFishFound ?? 0));
  const droneMultiSkill =
    1 +
    0.1 * skill("fishing_with_friends") +
    0.02 * skill("completionist_gatekeeper") * legendary;
  const drone_power_multiplier = droneMultiUpgrade * droneMultiEnhance * droneMultiSkill;
  const drone_base_power = droneBase * drone_power_multiplier;

  // Fishing Drone Cap: base 0, then from upgrades (+1 per fishing_drone, +2 per fishing_drone_2) and enhancements (+1 per enhance_fishing_drone, +3 per enhance_fishing_drone_3); then Drone Cloner 1.05x. Skill: Fishing With Friends +5, Motley School +5 per level.
  const capFromUpgradesAndEnhancements =
    0 +
    1 * u("fishing_drone") +
    2 * u("fishing_drone_2") +
    1 * e("enhance_fishing_drone") +
    3 * e("enhance_fishing_drone_3") +
    5 * skill("fishing_with_friends") +
    5 * skill("motley_school");
  const fishing_drone_cap = capFromUpgradesAndEnhancements * Math.pow(1.05, u("drone_cloner"));

  // Token Gain Multiplier: only from enhancement +0.05x per level.
  const token_gain_multi = 1 + 0.05 * e("enhance_token_multiplier");

  // Notice fish requirement: no upgrade source in game; use 1. Skill: Friendship Ended -10% per level (mult 0.9^level).
  const notice_fish_req = Math.max(0.01, 1 * Math.pow(0.9, skill("friendship_ended_tier1")));

  // Tick chances (%): double +0.5% (upgrade), +0.5% (enhance); triple +0.35% (upgrade), +0.4% (enhance). Skill: Let's Pick Up The Pace +2% double, +1% triple per level.
  const double_tick_chance_pct =
    0.5 * u("double_tick_chance") +
    0.5 * e("enhance_double_tick_chance") +
    2 * skill("lets_pick_up_the_pace");
  const triple_tick_chance_pct =
    0.35 * u("triple_tick_chance") +
    0.4 * e("enhance_triple_tick_chance") +
    1 * skill("lets_pick_up_the_pace");
  const five_tick_chance_pct = 0;

  // Shiny / Super Shiny chances (%): shiny_fish_chance +0.5% per level; super_shiny_chance +1% per level; tiny notice +0.5% (enhance). Skill: With This Fish I Summon +0.1% shiny per fish card per level; Completionist +1% super shiny per level per legendary.
  const shiny_fish_chance_pct =
    0.5 * u("shiny_fish_chance") +
    0.1 * skill("with_this_fish_i_summon_two_more_fish") * effectiveFishCardCount;
  const super_shiny_chance_pct =
    1 * u("super_shiny_chance") +
    1 * skill("completionist_gatekeeper") * legendary;
  const tiny_notice_chance_pct = 0.5 * e("enhance_tiny_notice_chance");

  // Tier 2 Dock Power: multiplier on power on T2 docks; +0.05x (upgrade), +0.05x (enhance). Skill: Completionist Gatekeeper +3% per level per legendary.
  const tier2_dock_power_mult =
    1 +
    0.05 * u("tier2_dock_power") +
    0.05 * e("enhance_tier2_dock_power") +
    0.03 * skill("completionist_gatekeeper") * legendary;

  // Shiny Multiplier: base 3× (wiki), +0.05x (T2 upgrade), +0.05x (enhance).
  const shiny_multiplier =
    3 + 0.05 * u("shiny_multiplier") + 0.05 * e("enhance_shiny_multiplier");

  // Super Shiny Multiplier: base 2× (wiki; only when catch is already shiny), +0.08x (poly_card_multi), +0.15x (enhance).
  const super_shiny_multiplier =
    2 +
    0.08 * u("poly_card_multi") +
    0.15 * e("enhance_super_shiny_multi");

  // Poly card gain multi: applies to fish card gains (Card 1.5×, Gilded 2×). Value Pack potency poly ×1.15 in UI.
  const poly_card_gain_multi =
    1 +
    0.08 * u("poly_card_multi") +
    0.1 * e("enhance_poly_card_multi");

  return {
    boat_level,
    t2_boat_level,
    fishing_rod_power,
    fishing_drone_cap,
    drone_base_power,
    drone_power_multiplier,
    fish_income_multi,
    fishing_tick_reduction,
    double_tick_chance_pct,
    triple_tick_chance_pct,
    five_tick_chance_pct,
    token_gain_multi,
    notice_fish_req,
    shiny_fish_chance_pct,
    super_shiny_chance_pct,
    tiny_notice_chance_pct,
    tier2_dock_power_mult,
    shiny_multiplier,
    super_shiny_multiplier,
    poly_card_gain_multi,
  };
}
