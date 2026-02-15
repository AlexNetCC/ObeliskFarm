/**
 * Stargazing Calculator (web port)
 *
 * Ported 1:1 from `ObeliskGemEV/stargazing/calculator.py`.
 * Calculates stars and super stars per hour based on in-game stats.
 */
 
// Base game constants
export const BASE_STAR_SPAWN_CHANCE = 1 / 50; // 2% per floor clear
export const BASE_SUPER_STAR_SPAWN_CHANCE = 1 / 100; // 1% per spawn event

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
 
export type PlayerStats = {
  // Floor clears per hour
  floor_clears_per_hour: number;
 
  // Star spawn rate multiplier
  star_spawn_rate_mult: number;
 
  // Auto-catch chance (0.0 to 1.0)
  auto_catch_chance: number;
 
  // Double/Triple star chances (0.0 to 1.0)
  double_star_chance: number;
  triple_star_chance: number;
 
  // Super star spawn rate multiplier
  super_star_spawn_rate_mult: number;
 
  // Super star bonuses
  triple_super_star_chance: number;
  super_star_10x_chance: number;
 
  // Star multipliers
  star_supernova_chance: number;
  star_supernova_mult: number;
  star_supergiant_chance: number;
  star_supergiant_mult: number;
  star_radiant_chance: number;
  star_radiant_mult: number;
 
  // Super star multipliers
  super_star_supernova_chance: number;
  super_star_supernova_mult: number;
  super_star_supergiant_chance: number;
  super_star_supergiant_mult: number;
  super_star_radiant_chance: number;
  super_star_radiant_mult: number;
 
  // Global multipliers
  all_star_mult: number;
  novagiant_combo_mult: number;
 
  // CTRL+F Stars skill (multiplies offline gains by 5x)
  ctrl_f_stars_enabled: boolean;
};
 
export function defaultPlayerStats(): PlayerStats {
  return {
    floor_clears_per_hour: 48.0 * 60, // 48/min default
    star_spawn_rate_mult: 1.0,
    auto_catch_chance: 0.0,
    double_star_chance: 0.0,
    triple_star_chance: 0.0,
    super_star_spawn_rate_mult: 1.0,
    triple_super_star_chance: 0.0,
    super_star_10x_chance: 0.0,
    star_supernova_chance: 0.0,
    star_supernova_mult: 10.0,
    star_supergiant_chance: 0.0,
    star_supergiant_mult: 3.0,
    star_radiant_chance: 0.0,
    star_radiant_mult: 10.0,
    super_star_supernova_chance: 0.0,
    super_star_supernova_mult: 10.0,
    super_star_supergiant_chance: 0.0,
    super_star_supergiant_mult: 3.0,
    super_star_radiant_chance: 0.0,
    super_star_radiant_mult: 10.0,
    all_star_mult: 1.0,
    novagiant_combo_mult: 1.0,
    ctrl_f_stars_enabled: false,
  };
}
 
export class StargazingCalculator {
  /**
   * Calculates stars and super stars per hour.
   *
   * Game mechanics:
   * 1. Base chance: 1/50 (2%) per floor clear for a star to spawn
   * 2. Star Spawn Rate Multiplier: Increases the effective spawn chance
   * 3. At each spawn event, SS and regular stars are rolled independently:
   *    - Super Star can spawn (0 or 1 per event)
   *    - Regular stars also roll (1/2/3/4/5/6 from double+triple; when both trigger, 4/5/6); both can happen in the same event
   * 4. Double/Triple Star Chance: Only for regular stars (1/2/3/4/5/6). When both trigger, outcomes 4/5/6 (model: 1/3 each). Do not apply to SS; SS count uses triple_super_star_chance / super_star_10x only.
   * 5. Supernova/Supergiant/Radiant: Per star (each regular star can roll these)
   * 6. All Star Multiplier: Final multiplier on all stars
   */
  constructor(public readonly stats: PlayerStats) {}
 
  /** Calculate the number of star spawn events per hour. */
  calculate_star_spawn_rate_per_hour(): number {
    const base_chance = BASE_STAR_SPAWN_CHANCE; // 1/50 = 0.02
    let modified_chance = base_chance * this.stats.star_spawn_rate_mult;
    modified_chance = Math.min(modified_chance, 1.0); // cap at 100%
    return this.stats.floor_clears_per_hour * modified_chance;
  }
 
  /**
   * Calculate expected number of REGULAR stars per spawn event.
   *
   * Rolled independently of Super Star: every spawn event rolls regular stars (1/2/3/4/5/6).
   * Double and triple rolled independently. When both trigger, in-game outcomes observed: 4, 5, 6.
   * We model that as 1/3 each for 4, 5, 6 when both trigger (no in-game distribution known).
   * Each of these stars can independently roll supernova/supergiant/radiant (see multiplier).
   */
  calculate_stars_per_spawn(): number {
    const p_double = clamp01(this.stats.double_star_chance);
    const p_triple = clamp01(this.stats.triple_star_chance);
    const p_1 = (1 - p_double) * (1 - p_triple);
    const p_2 = p_double * (1 - p_triple);
    const p_3 = (1 - p_double) * p_triple;
    const p_both = p_double * p_triple;
    // When both trigger, observed outcomes 4, 5, 6; assume equal 1/3 each
    const p_4 = p_both / 3;
    const p_5 = p_both / 3;
    const p_6 = p_both / 3;

    return 1 * p_1 + 2 * p_2 + 3 * p_3 + 4 * p_4 + 5 * p_5 + 6 * p_6;
  }
 
  /**
   * Calculate expected multiplier per star from special effects.
   *
   * Effects:
   * - Supernova: 10x stars (default)
   * - Supergiant: 3x stars (default)
   * - Radiant: 10x stars (default)
   * - Novagiant Combo: Extra multiplier when both supernova AND supergiant
   */
  calculate_star_multiplier_per_star(): number {
    const p_supernova = clamp01(this.stats.star_supernova_chance);
    const p_supergiant = clamp01(this.stats.star_supergiant_chance);
    const p_radiant = clamp01(this.stats.star_radiant_chance);
 
    // Expected multiplier from each effect
    const supernova_contribution = 1 + p_supernova * (this.stats.star_supernova_mult - 1);
    const supergiant_contribution = 1 + p_supergiant * (this.stats.star_supergiant_mult - 1);
    const radiant_contribution = 1 + p_radiant * (this.stats.star_radiant_mult - 1);
 
    // Novagiant combo: when both supernova AND supergiant occur
    const p_novagiant = p_supernova * p_supergiant;
    const novagiant_contribution = 1 + p_novagiant * (this.stats.novagiant_combo_mult - 1);
 
    // Total multiplier (multiplicative stacking)
    let total_mult = supernova_contribution * supergiant_contribution * radiant_contribution * novagiant_contribution;
 
    // Apply all star multiplier
    total_mult *= this.stats.all_star_mult;
    return total_mult;
  }
 
  /** Calculate total expected stars per hour (online/manual). */
  calculate_stars_per_hour_online(): number {
    const spawns_per_hour = this.calculate_star_spawn_rate_per_hour();
    const stars_per_spawn = this.calculate_stars_per_spawn();
    const mult_per_star = this.calculate_star_multiplier_per_star();
    return spawns_per_hour * stars_per_spawn * mult_per_star;
  }
 
  /**
   * Stars per hour when you are online but AFK: all stars caught by auto-catch (no manual catch).
   * Floor factor: without CTRL+F 0.2 (1 of 5 floors), with CTRL+F 1.0 (all 5 floors).
   */
  calculate_stars_per_hour_online_afk(): number {
    const total_stars = this.calculate_stars_per_hour_online();
    const floor_mult = this.stats.ctrl_f_stars_enabled ? 1.0 : 0.2;
    return total_stars * clamp01(this.stats.auto_catch_chance) * floor_mult;
  }

  /** Offline gains: same as Online AFK × 0.85 (game's offline factor). */
  static readonly OFFLINE_GAINS_MALUS = 0.85;

  calculate_stars_per_hour_offline_gains(): number {
    return this.calculate_stars_per_hour_online_afk() * StargazingCalculator.OFFLINE_GAINS_MALUS;
  }

  /**
   * @deprecated Use calculate_stars_per_hour_online_afk for "Online AFK" or calculate_stars_per_hour_offline_gains for "Offline Gains".
   */
  calculate_stars_per_hour_offline(): number {
    return this.calculate_stars_per_hour_online_afk();
  }
 
  /**
   * Calculate expected number of super stars per super star spawn event.
   *
   * Triple and 10x are mutually exclusive outcomes (1, 3, or 10 super stars per spawn).
   * Expected = 1×(1−p_triple−p_10x) + 3×p_triple + 10×p_10x = 1 + 2×p_triple + 9×p_10x.
   */
  calculate_super_stars_per_spawn(): number {
    const p_triple = clamp01(this.stats.triple_super_star_chance);
    const p_10x = clamp01(this.stats.super_star_10x_chance);
    const p_single = Math.max(0, 1 - p_triple - p_10x);
    return 1 * p_single + 3 * p_triple + 10 * p_10x;
  }
 
  /** Calculate expected multiplier per super star from special effects. */
  calculate_super_star_multiplier_per_star(): number {
    const p_supernova = clamp01(this.stats.super_star_supernova_chance);
    const p_supergiant = clamp01(this.stats.super_star_supergiant_chance);
    const p_radiant = clamp01(this.stats.super_star_radiant_chance);
 
    const supernova_contribution = 1 + p_supernova * (this.stats.super_star_supernova_mult - 1);
    const supergiant_contribution = 1 + p_supergiant * (this.stats.super_star_supergiant_mult - 1);
    const radiant_contribution = 1 + p_radiant * (this.stats.super_star_radiant_mult - 1);
 
    // Novagiant combo for super stars
    const p_novagiant = p_supernova * p_supergiant;
    const novagiant_contribution = 1 + p_novagiant * (this.stats.novagiant_combo_mult - 1);
 
    let total_mult = supernova_contribution * supergiant_contribution * radiant_contribution * novagiant_contribution;
    total_mult *= this.stats.all_star_mult;
    return total_mult;
  }
 
  /**
   * Calculate the number of super star spawn events per hour.
   *
   * SS is rolled per spawn event independently; regular stars (double/triple) also roll, so both can occur in the same event.
   */
  calculate_super_star_spawn_rate_per_hour(): number {
    // Number of star spawn events per hour
    const star_spawn_events = this.calculate_star_spawn_rate_per_hour();
 
    // Chance that a spawn event is a Super Star
    const base_super_chance = BASE_SUPER_STAR_SPAWN_CHANCE; // 1/100 = 0.01
    const modified_super_chance = clamp01(base_super_chance * this.stats.super_star_spawn_rate_mult);
 
    // Super star spawn events = total spawn events * chance per event
    return star_spawn_events * modified_super_chance;
  }
 
  /** Calculate total expected super stars per hour (online/manual). */
  calculate_super_stars_per_hour_online(): number {
    const spawns_per_hour = this.calculate_super_star_spawn_rate_per_hour();
    const super_stars_per_spawn = this.calculate_super_stars_per_spawn();
    const mult_per_star = this.calculate_super_star_multiplier_per_star();
    return spawns_per_hour * super_stars_per_spawn * mult_per_star;
  }
 
  /** Super stars per hour when online but AFK (all caught by auto-catch). */
  calculate_super_stars_per_hour_online_afk(): number {
    const total_super_stars = this.calculate_super_stars_per_hour_online();
    const floor_mult = this.stats.ctrl_f_stars_enabled ? 1.0 : 0.2;
    return total_super_stars * clamp01(this.stats.auto_catch_chance) * floor_mult;
  }

  /** Offline gains: Online AFK with the game's 80% offline malus. */
  calculate_super_stars_per_hour_offline_gains(): number {
    return this.calculate_super_stars_per_hour_online_afk() * StargazingCalculator.OFFLINE_GAINS_MALUS;
  }

  /** @deprecated Use calculate_super_stars_per_hour_online_afk or calculate_super_stars_per_hour_offline_gains. */
  calculate_super_stars_per_hour_offline(): number {
    return this.calculate_super_stars_per_hour_online_afk();
  }
 
  /**
   * Probabilities per floor clear for the hierarchy tree.
   * Root = floor clear; then no star / star spawn (with regular 1/2/3/4/5/6 and SS 0/1/3/10).
   */
  get_spawn_tree(): {
    spawn_chance_per_floor_clear: number;
    no_star_pct: number;
    star_spawn_pct: number;
    regular: { stars: 1 | 2 | 3 | 4 | 5 | 6; pct: number }[];
    super_star_pct: number;
    super_star_outcomes: { count: 1 | 3 | 10; pct: number }[];
  } {
    const spawn_chance = Math.min(1, BASE_STAR_SPAWN_CHANCE * this.stats.star_spawn_rate_mult);
    const p_double = clamp01(this.stats.double_star_chance);
    const p_triple = clamp01(this.stats.triple_star_chance);
    const p_1 = (1 - p_double) * (1 - p_triple);
    const p_2 = p_double * (1 - p_triple);
    const p_3 = (1 - p_double) * p_triple;
    const p_both = p_double * p_triple;
    const p_4 = p_both / 3;
    const p_5 = p_both / 3;
    const p_6 = p_both / 3;
    const p_ss = clamp01(BASE_SUPER_STAR_SPAWN_CHANCE * this.stats.super_star_spawn_rate_mult);
    const p_triple_ss = clamp01(this.stats.triple_super_star_chance);
    const p_10x_ss = clamp01(this.stats.super_star_10x_chance);
    const p_1_ss = Math.max(0, 1 - p_triple_ss - p_10x_ss);
    return {
      spawn_chance_per_floor_clear: spawn_chance,
      no_star_pct: (1 - spawn_chance) * 100,
      star_spawn_pct: spawn_chance * 100,
      regular: [
        { stars: 1, pct: p_1 * 100 },
        { stars: 2, pct: p_2 * 100 },
        { stars: 3, pct: p_3 * 100 },
        { stars: 4, pct: p_4 * 100 },
        { stars: 5, pct: p_5 * 100 },
        { stars: 6, pct: p_6 * 100 },
      ],
      super_star_pct: p_ss * 100,
      super_star_outcomes: [
        { count: 1, pct: p_1_ss * 100 },
        { count: 3, pct: p_triple_ss * 100 },
        { count: 10, pct: p_10x_ss * 100 },
      ],
    };
  }

  /**
   * Contribution of each stat to stars per hour (online), for Stats Contributions chart.
   * Parts add up to total stars/hour. Double Star includes base 1× outcome; multiplier parts (Supernova etc.) from (mult - 1) split.
   */
  get_star_contributions_per_hour(): {
    doubleStar: number;
    tripleStar: number;
    supernova: number;
    supergiant: number;
    radiant: number;
  } {
    const spawns = this.calculate_star_spawn_rate_per_hour();
    const mult = this.calculate_star_multiplier_per_star();
    const p_double = clamp01(this.stats.double_star_chance);
    const p_triple = clamp01(this.stats.triple_star_chance);
    const p_1 = (1 - p_double) * (1 - p_triple);
    const p_2 = p_double * (1 - p_triple);
    const p_3 = (1 - p_double) * p_triple;
    const p_both = p_double * p_triple;
    const stars_per_spawn = 1 * p_1 + 2 * p_2 + 3 * p_3 + (4 + 5 + 6) / 3 * p_both;

    const doublePart = 2 * p_2 + 1.5 * p_both;
    const triplePart = 3 * p_3 + 3 * p_both;
    const basePart = p_1;

    const doubleStar = (basePart + doublePart) * spawns * mult;
    const tripleStar = triplePart * spawns * mult;

    const p_sn = clamp01(this.stats.star_supernova_chance);
    const p_sg = clamp01(this.stats.star_supergiant_chance);
    const p_rad = clamp01(this.stats.star_radiant_chance);
    const sn_contrib = 1 + p_sn * (this.stats.star_supernova_mult - 1);
    const sg_contrib = 1 + p_sg * (this.stats.star_supergiant_mult - 1);
    const rad_contrib = 1 + p_rad * (this.stats.star_radiant_mult - 1);
    const p_nov = p_sn * p_sg;
    const nov_contrib = 1 + p_nov * (this.stats.novagiant_combo_mult - 1);
    const sum_extra = (sn_contrib - 1) + (sg_contrib - 1) + (rad_contrib - 1) + (nov_contrib - 1);
    const mult_extra = mult - 1;
    const slice = sum_extra > 0 && mult_extra > 0 ? (mult_extra * spawns * stars_per_spawn) / sum_extra : 0;
    const supernova = (sn_contrib - 1) * slice + (nov_contrib - 1) * slice * 0.5;
    const supergiant = (sg_contrib - 1) * slice + (nov_contrib - 1) * slice * 0.5;
    const radiant = (rad_contrib - 1) * slice;

    return { doubleStar, tripleStar, supernova, supergiant, radiant };
  }

  /**
   * Contribution of each stat to super stars per hour (online), for Stats Contributions chart.
   * 10× Chance includes 1× base outcome; Triple, then Supernova/Supergiant/Radiant from multiplier.
   */
  get_super_star_contributions_per_hour(): {
    tenXChance: number;
    tripleStar: number;
    supernova: number;
    supergiant: number;
    radiant: number;
  } {
    const spawns = this.calculate_super_star_spawn_rate_per_hour();
    const mult = this.calculate_super_star_multiplier_per_star();
    const p_triple = clamp01(this.stats.triple_super_star_chance);
    const p_10x = clamp01(this.stats.super_star_10x_chance);
    const p_1 = Math.max(0, 1 - p_triple - p_10x);
    const ss_per_spawn = 1 * p_1 + 3 * p_triple + 10 * p_10x;

    const tenXChance = (p_1 + 10 * p_10x) * spawns * mult;
    const tripleStar = 3 * p_triple * spawns * mult;

    const p_sn = clamp01(this.stats.super_star_supernova_chance);
    const p_sg = clamp01(this.stats.super_star_supergiant_chance);
    const p_rad = clamp01(this.stats.super_star_radiant_chance);
    const sn_contrib = 1 + p_sn * (this.stats.super_star_supernova_mult - 1);
    const sg_contrib = 1 + p_sg * (this.stats.super_star_supergiant_mult - 1);
    const rad_contrib = 1 + p_rad * (this.stats.super_star_radiant_mult - 1);
    const p_nov = p_sn * p_sg;
    const nov_contrib = 1 + p_nov * (this.stats.novagiant_combo_mult - 1);
    const sum_extra = (sn_contrib - 1) + (sg_contrib - 1) + (rad_contrib - 1) + (nov_contrib - 1);
    const mult_extra = mult - 1;
    const slice = sum_extra > 0 && mult_extra > 0 ? (mult_extra * spawns * ss_per_spawn) / sum_extra : 0;
    const supernova = (sn_contrib - 1) * slice + (nov_contrib - 1) * slice * 0.5;
    const supergiant = (sg_contrib - 1) * slice + (nov_contrib - 1) * slice * 0.5;
    const radiant = (rad_contrib - 1) * slice;

    return { tenXChance, tripleStar, supernova, supergiant, radiant };
  }

  /** Get a summary of all calculated values. */
  get_summary(): {
    star_spawn_rate_per_hour: number;
    stars_per_spawn: number;
    stars_per_hour_online: number;
    stars_per_hour_online_afk: number;
    stars_per_hour_offline_gains: number;
    super_star_spawn_rate_per_hour: number;
    super_stars_per_spawn: number;
    super_stars_per_hour_online: number;
    super_stars_per_hour_online_afk: number;
    super_stars_per_hour_offline_gains: number;
    floor_clears_per_hour: number;
    auto_catch_chance: number;
    ctrl_f_stars_enabled: boolean;
  } {
    return {
      star_spawn_rate_per_hour: this.calculate_star_spawn_rate_per_hour(),
      stars_per_spawn: this.calculate_stars_per_spawn(),
      stars_per_hour_online: this.calculate_stars_per_hour_online(),
      stars_per_hour_online_afk: this.calculate_stars_per_hour_online_afk(),
      stars_per_hour_offline_gains: this.calculate_stars_per_hour_offline_gains(),
      super_star_spawn_rate_per_hour: this.calculate_super_star_spawn_rate_per_hour(),
      super_stars_per_spawn: this.calculate_super_stars_per_spawn(),
      super_stars_per_hour_online: this.calculate_super_stars_per_hour_online(),
      super_stars_per_hour_online_afk: this.calculate_super_stars_per_hour_online_afk(),
      super_stars_per_hour_offline_gains: this.calculate_super_stars_per_hour_offline_gains(),
      floor_clears_per_hour: this.stats.floor_clears_per_hour,
      auto_catch_chance: this.stats.auto_catch_chance,
      ctrl_f_stars_enabled: this.stats.ctrl_f_stars_enabled,
    };
  }
}

