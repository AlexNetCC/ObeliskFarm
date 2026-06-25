// Ported from ObeliskGemEV/archaeology/upgrade_costs.py

import { FRAGMENT_UPGRADES, GEM_COSTS, GEM_COSTS_ASCENSION_1, GEM_COSTS_ASCENSION_2, GEM_UPGRADE_BONUSES } from "./constants";
import type { ArchGemUpgradeKey } from "./types";

export const FRAGMENT_UPGRADE_COSTS: Record<string, number[]> = {
  flat_damage_c1: [
    0.5, 0.6, 0.72, 0.86, 1.04, 1.24, 1.49, 1.79, 2.15, 2.58, 3.1, 3.72, 4.46, 5.35, 6.42, 7.7, 9.24, 11.09, 13.31, 15.97, 19.17,
    23.0, 27.6, 33.12, 39.75,
  ],
  armor_pen_c1: [
    0.75, 0.9, 1.08, 1.3, 1.56, 1.87, 2.24, 2.69, 3.22, 3.87, 4.64, 5.57, 6.69, 8.02, 9.63, 11.56, 13.87, 16.64, 19.97, 23.96, 28.75,
    34.5, 41.4, 49.69, 59.62,
  ],
  arch_xp_c1: [1.0, 1.2, 1.44, 1.73, 2.07, 2.49, 2.99, 3.58, 4.3, 5.16, 6.19, 7.43, 8.92, 10.7, 12.84, 15.41, 18.49, 22.19, 26.62, 31.95, 38.34, 46.01, 55.21, 66.25, 79.5],
  crit_c1: [
    2.0, 2.4, 2.88, 3.46, 4.15, 4.98, 5.97, 7.17, 8.6, 10.32, 12.38, 14.86, 17.83, 21.4, 25.68, 30.81, 36.98, 44.37, 53.25, 63.9,
    76.68, 92.01, 110.0, 132.0, 158.0,
  ],
  str_skill_buff: [100.0, 120.0, 144.0, 172.0, 207.0],
  polychrome_bonus: [10000.0],

  stamina_r1: [2.0, 2.4, 2.88, 3.46, 4.15, 4.98, 5.97, 7.17, 8.6, 10.32, 12.38, 14.86, 17.83, 21.4, 25.68, 30.81, 36.98, 44.37, 53.25, 63.9],
  flat_damage_r1: [3.0, 3.6, 4.32, 5.18, 6.22, 7.46, 8.96, 10.75, 12.9, 15.48, 18.58, 22.29, 26.75, 32.1, 38.52, 46.22, 55.47, 66.56, 79.87, 95.84],
  loot_mod_mult: [4.5, 5.4, 6.48, 7.78, 9.33, 11.2, 13.44, 16.12, 19.35, 23.22],
  enrage_buff: [6.0, 7.2, 8.64, 10.37, 12.44, 14.93, 17.92, 21.5, 25.8, 30.96, 37.15, 44.58, 53.5, 64.2, 77.04],
  agi_skill_buff: [50.0, 60.0, 72.0, 86.4, 103.0],
  per_skill_buff: [150.0, 180.0, 216.0, 259.0, 311.0],
  fragment_gain_1x: [9000.0],

  flat_damage_e1: [
    3.5, 4.2, 5.04, 6.05, 7.26, 8.71, 10.45, 12.54, 15.05, 18.06, 21.67, 26.01, 31.21, 37.45, 44.94, 53.92, 64.71, 77.65, 93.18,
    111.0, 134.0, 161.0, 193.0, 231.0, 278.0,
  ],
  arch_xp_frag_e1: [5.0, 6.0, 7.2, 8.64, 10.37, 12.44, 14.93, 17.92, 21.5, 25.8, 30.96, 37.15, 44.58, 53.5, 64.2, 77.04, 92.44, 110.0, 133.0, 159.0],
  flurry_buff: [7.5, 9.0, 10.8, 12.96, 15.55, 18.66, 22.39, 26.87, 32.25, 38.7],
  stamina_e1: [25.0, 30.0, 36.0, 43.2, 51.84],
  int_skill_buff: [125.0, 150.0, 180.0, 216.0, 259.0],
  stamina_mod_gain_1: [8000.0],

  arch_xp_stam_l1: [7.0, 8.4, 10.08, 12.1, 14.52, 17.42, 20.9, 25.08, 30.1, 36.12, 43.34, 52.01, 62.41, 74.9, 89.87],
  armor_pen_cd_l1: [9.0, 10.8, 12.96, 15.55, 18.66, 22.39, 26.87, 32.25, 38.7, 46.44],
  crit_dmg_l1: [
    12.0, 14.4, 17.28, 20.74, 24.88, 29.86, 35.83, 42.0, 51.6, 61.92, 74.3, 89.16, 106.0, 128.0, 154.0, 184.0, 221.0, 266.0, 319.0,
    383.0,
  ],
  quake_buff: [15.0, 18.0, 21.6, 25.92, 31.1, 37.32, 44.79, 53.75, 64.5, 77.4],
  all_mod_chance: [7000.0],

  damage_apen_m1: [6.0, 7.2, 8.64, 10.37, 12.44, 14.93, 17.92, 21.5, 25.8, 30.96, 37.15, 44.58, 53.5, 64.2, 77.04, 92.44, 110.0, 133.0, 159.0, 191.0],
  crit_chance_m1: [
    10.0, 12.0, 14.4, 17.28, 20.74, 24.88, 29.86, 35.83, 42.0, 51.6, 61.92, 74.3, 89.16, 106.0, 128.0, 154.0, 184.0, 221.0, 266.0,
    319.0,
  ],
  exp_mod_m1: [
    15.0, 18.0, 21.6, 25.92, 31.1, 37.32, 44.79, 53.75, 64.5, 77.4, 92.88, 111.0, 133.0, 160.0, 192.0, 231.0, 277.0, 332.0, 399.0,
    479.0,
  ],
  ability_stam_m1: [
    20.0, 24.0, 28.8, 34.56, 41.47, 49.77, 59.72, 71.66, 85.0, 103.0, 123.0, 148.0, 178.0, 213.0, 256.0, 308.0, 369.0, 443.0, 532.0,
    638.0,
  ],
  exp_stat_cap_m1: [5000.0],

  stat_points_a1: [7.25, 14.5, 29, 58, 116],
  crosshair_fairy_a1: [37.5, 50.62, 68.34, 92.26, 124, 168, 227, 306, 413, 558, 753, 1017, 1374, 1855, 2504],
  all_mod_chance_a1: [
    175, 210, 252, 302, 362, 435, 522, 627, 752, 902, 1083, 1300, 1560, 1872, 2246, 2696, 3235, 3882, 4659, 5590,
    6709, 8050, 9661, 11600, 13900, 16700, 20000, 24000, 28800, 34600,
  ],
  enrage_flat_a1: [225, 270, 324, 388, 466],
  ultra_crit_dmg_a1: [
    175, 210, 252, 302, 362, 435, 522, 627, 752, 902, 1083, 1300, 1560, 1872, 2246, 2696, 3235, 3882, 4659, 5590,
  ],
  str_skill_buff_a1: [10],
  gold_crosshair_a1: [7.5, 9, 10.8, 12.96, 15.55],
  flat_ultra_a1: [12.5, 15, 18, 21.6, 25.92],
  instacharge_a1: [
    25, 30, 36, 43.2, 51.84, 62.21, 74.65, 89.58, 107, 128, 154, 185, 222, 267, 320, 385, 462, 554, 665, 798, 958,
    1150, 1380, 1656, 1987,
  ],
  dmg_xp_a1: [250, 500, 1000, 2000, 4000],
  super_crit_exp_a1: [
    375, 450, 540, 648, 777, 933, 1119, 1343, 1612, 1934, 2321, 2786, 3343, 4012, 4814, 5777, 6933, 8319, 9983, 12000,
    14400, 17300, 20700, 24800, 29800, 35800, 42900, 51500, 61800, 74200, 89000, 107000, 128000, 154000, 185000,
    222000, 266000, 319000, 383000, 459000,
  ],
  stam_autotap_a1: [
    475, 570, 684, 820, 984, 1181, 1418, 1702, 2042, 2450, 2941, 3529, 4235, 5082, 6098, 7318, 8782, 10500, 12600,
    15200, 18200, 21900, 26200, 31500, 37800, 45300, 54400, 65300, 78300, 94000, 113000, 135000, 162000, 195000,
    234000, 281000, 337000, 404000, 485000, 582000, 698000, 838000, 1010000, 1210000, 1450000, 1740000, 2080000,
    2500000, 3000000, 3600000,
  ],

  gleaming_chance_a2: [
    200, 240, 288, 345, 414, 497, 597, 716, 859, 1031, 1238, 1486, 1783, 2139, 2567, 3081, 3697, 4437, 5324, 6389,
    7667, 9201, 11000, 13200, 15900, 19100, 22900, 27500, 33000, 39600,
  ],
  ability_fairy_a2: [
    1000, 1350, 1822, 2460, 3321, 4484, 6053, 8172, 11000, 14900, 20100, 27100, 36600, 49500, 66800, 90200, 122000,
    164000, 222000, 299000, 404000, 546000, 737000, 995000, 1340000, 1810000, 2450000, 3300000, 4460000, 6020000,
  ],
  divinity_buff_a2: [5000, 6000, 7200, 8640, 10400],
  gleaming_multi_a2: [
    2500, 3000, 3600, 4320, 5184, 6220, 7464, 8957, 10700, 12900, 15500, 18600, 22300, 26700, 32100, 38500, 46200,
    55500, 66600, 79900, 95800, 115000, 138000, 166000, 199000, 238000, 286000, 343000, 412000, 495000,
  ],
  corruption_buff_a2: [8000, 9600, 11500, 13800, 16600, 19900, 23900, 28700, 34400, 41300],
  all_mod_mult_a2: [7500, 9000, 10800, 13000, 15600, 18700, 22400, 26900, 32200, 38700],
};

/** Base (tier 0) upgrades scale 5× at Ascension 1 and 10× at Ascension 2; tier-1 upgrades scale 2× at Ascension 2. */
export function getAscensionFragmentCostMultiplier(tier: 0 | 1 | 2, ascensionLevel: 0 | 1 | 2): number {
  if (tier === 0) {
    if (ascensionLevel >= 2) return 10;
    if (ascensionLevel >= 1) return 5;
    return 1;
  }
  if (tier === 1 && ascensionLevel >= 2) return 2;
  return 1;
}

export function getUpgradeCost(upgradeKey: string, level0: number, ascensionLevel: 0 | 1 | 2 = 0): number | null {
  const costs = FRAGMENT_UPGRADE_COSTS[upgradeKey];
  if (!costs) return null;
  if (level0 >= costs.length) return null;
  const base = costs[level0] ?? null;
  if (base == null) return null;
  const info = FRAGMENT_UPGRADES[upgradeKey];
  const tier = (info?.ascension_tier ?? 0) as 0 | 1 | 2;
  return base * getAscensionFragmentCostMultiplier(tier, ascensionLevel);
}

function gemCostAtLevel(costs: number[], level0: number): number {
  if (!costs.length) return 0;
  if (level0 < costs.length) return costs[level0]!;
  const last = costs[costs.length - 1]!;
  const prev = costs[costs.length - 2] ?? last;
  const step = last - prev;
  return last + (level0 - costs.length + 1) * step;
}

export function getGemUpgradeCost(key: ArchGemUpgradeKey, level0: number, ascensionLevel: 0 | 1 | 2 = 0): number {
  if (ascensionLevel >= 2) return gemCostAtLevel(GEM_COSTS_ASCENSION_2[key], level0);
  if (ascensionLevel >= 1) return gemCostAtLevel(GEM_COSTS_ASCENSION_1[key], level0);
  const costs = GEM_COSTS[key];
  if (!costs.length) return 0;
  const idx = Math.min(level0, costs.length - 1);
  return costs[idx]!;
}

export function getGemUpgradeMaxLevel(key: ArchGemUpgradeKey, ascensionLevel: 0 | 1 | 2): number {
  if (ascensionLevel >= 1) return 999;
  return GEM_UPGRADE_BONUSES[key]?.max_level ?? 0;
}

export function getMaxLevel(upgradeKey: string): number {
  return FRAGMENT_UPGRADE_COSTS[upgradeKey]?.length ?? 0;
}

