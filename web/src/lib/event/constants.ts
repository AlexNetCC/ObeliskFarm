// Ported (minimally) from ObeliskGemEV/event/constants.py

export const UPGRADE_SHORT_NAMES: Record<number, string[]> = {
  1: [
    "Attack +1",
    "Health +2",
    "Attack speed +0.02",
    "Move speed +0.03",
    "Game speed +2%",
    "Crit chance +1%",
    "Attack+1 Health+2",
    "Tier 1 caps +1",
    "Prestige +1%",
    "Attack+3 Health+3",
  ],
  2: [
    "Health +3",
    "Enemy attack speed -0.02",
    "Enemy attack -1",
    "Enemy crit -1%",
    "Attack+1 Attack speed+0.01",
    "Tier 2 caps +1",
    "Prestige +2%",
  ],
  3: [
    "Attack +2",
    "Attack speed +0.02",
    "Crit chance +1%",
    "Game speed +3%",
    "Attack+3 Health+3",
    "Tier 3 caps +1",
    "5× drop +3%",
    "Health+5 Attack speed+0.03",
  ],
  4: [
    "Block +1%",
    "Health +5",
    "Crit damage +0.10",
    "Attack speed+0.02 Move speed+0.02",
    "Health+4 Attack+4",
    "Tier 4 caps +1",
    "Cap of caps +1",
    "Health+10 Attack speed+0.05",
  ],
};

export const PRESTIGE_UNLOCKED: Record<number, number[]> = {
  1: [0, 0, 0, 0, 1, 2, 2, 4, 8, 10],
  2: [0, 0, 0, 3, 4, 5, 10],
  3: [1, 1, 2, 3, 4, 6, 8, 10],
  4: [1, 3, 4, 5, 6, 6, 7, 10],
};

export const MAX_LEVELS: Record<number, number[]> = {
  1: [50, 50, 25, 25, 25, 25, 25, 10, 5, 40],
  2: [25, 15, 10, 15, 25, 10, 15],
  3: [20, 20, 20, 20, 10, 10, 10, 40],
  4: [15, 15, 15, 15, 15, 10, 10, 40],
};

// 1-indexed in original docs; stored as 1-indexed here to mirror Python constant usage.
export const CAP_UPGRADES: Record<number, number> = { 1: 8, 2: 6, 3: 6, 4: 6 };

export const COSTS: Record<number, number[]> = {
  1: [5, 6, 8, 10, 12, 20, 75, 2500, 25000, 5000],
  2: [5, 8, 12, 20, 40, 500, 650],
  3: [5, 8, 12, 18, 30, 250, 300, 125],
  4: [10, 12, 15, 20, 50, 250, 500, 150],
};

export const GEM_UPGRADE_NAMES = ["+10% Damage", "+10% Max health", "+125% Event game speed", "2× Event currencies"] as const;

export function getPrestigeWaveRequirement(prestige: number): number {
  return (prestige + 1) * 5;
}

/** Event reward waves: at these waves you get rewards. Used for tie-break band (highest reward wave reached). */
export const EVENT_REWARD_WAVES: number[] = [
  2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50,
  55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 115, 130, 150, 200, 250,
];

/** Highest reward wave that is <= wave (0 if wave &lt; first reward). */
export function getRewardBand(wave: number): number {
  let band = 0;
  for (const t of EVENT_REWARD_WAVES) {
    if (t <= wave) band = t;
    else break;
  }
  return band;
}

const REWARD_ICON_BASE = "https://static.wikitide.net/shminerwiki";

type RewardMilestoneEntry = {
  label: string;
  iconUrl: string;
  /** If true, amount is multiplied by 2^worldMonuments (Gifts, Mythic Chests, Skins are false). */
  monumentMultiplied?: boolean;
  /** Base amount for display when monumentMultiplied (e.g. 20 for "20 Gems"). */
  baseAmount?: number;
  /** Unit for display when monumentMultiplied (e.g. "Gems"). */
  unit?: string;
};

/** Wave → reward label and icon URL for display (e.g. "Wave 40 (Seasonal Miner + Lootbug Skin)" with icon). */
export const EVENT_REWARD_MILESTONE_INFO: Record<number, RewardMilestoneEntry> = {
  2: { label: "20 Gems", iconUrl: `${REWARD_ICON_BASE}/a/aa/Gem.png`, monumentMultiplied: true, baseAmount: 20, unit: "Gems" },
  4: { label: "6 Item Chests", iconUrl: `${REWARD_ICON_BASE}/thumb/a/a8/Item_Chest.png/30px-Item_Chest.png`, monumentMultiplied: true, baseAmount: 6, unit: "Item Chests" },
  6: { label: "2 Gifts", iconUrl: `${REWARD_ICON_BASE}/thumb/2/24/Gift.png/27px-Gift.png`, monumentMultiplied: false },
  8: { label: "30 Gems", iconUrl: `${REWARD_ICON_BASE}/a/aa/Gem.png`, monumentMultiplied: true, baseAmount: 30, unit: "Gems" },
  10: { label: "10 Charge Magnets", iconUrl: `${REWARD_ICON_BASE}/thumb/f/fc/Charge_Magnet.png/28px-Charge_Magnet.png`, monumentMultiplied: true, baseAmount: 10, unit: "Charge Magnets" },
  12: { label: "5 Relic Chests", iconUrl: `${REWARD_ICON_BASE}/thumb/6/6d/Relic_Chest.png/30px-Relic_Chest.png`, monumentMultiplied: true, baseAmount: 5, unit: "Relic Chests" },
  14: { label: "15 Item Chests", iconUrl: `${REWARD_ICON_BASE}/thumb/a/a8/Item_Chest.png/30px-Item_Chest.png`, monumentMultiplied: true, baseAmount: 15, unit: "Item Chests" },
  16: { label: "40 Gems", iconUrl: `${REWARD_ICON_BASE}/a/aa/Gem.png`, monumentMultiplied: true, baseAmount: 40, unit: "Gems" },
  18: { label: "3 Blue Cows", iconUrl: `${REWARD_ICON_BASE}/thumb/9/98/Blue_Cow.png/15px-Blue_Cow.png`, monumentMultiplied: true, baseAmount: 3, unit: "Blue Cows" },
  20: { label: "5 Gifts", iconUrl: `${REWARD_ICON_BASE}/thumb/2/24/Gift.png/27px-Gift.png`, monumentMultiplied: false },
  22: { label: "50 Gems", iconUrl: `${REWARD_ICON_BASE}/a/aa/Gem.png`, monumentMultiplied: true, baseAmount: 50, unit: "Gems" },
  24: { label: "20 Item Chests", iconUrl: `${REWARD_ICON_BASE}/thumb/a/a8/Item_Chest.png/30px-Item_Chest.png`, monumentMultiplied: true, baseAmount: 20, unit: "Item Chests" },
  26: { label: "10 Skill Shards", iconUrl: `${REWARD_ICON_BASE}/a/aa/Skill_Shard.png`, monumentMultiplied: true, baseAmount: 10, unit: "Skill Shards" },
  28: { label: "5 Primal Meat", iconUrl: `${REWARD_ICON_BASE}/thumb/2/26/Primal_Meat.png/28px-Primal_Meat.png`, monumentMultiplied: true, baseAmount: 5, unit: "Primal Meat" },
  30: { label: "8 Relic Chests", iconUrl: `${REWARD_ICON_BASE}/thumb/6/6d/Relic_Chest.png/30px-Relic_Chest.png`, monumentMultiplied: true, baseAmount: 8, unit: "Relic Chests" },
  32: { label: "65 Gems", iconUrl: `${REWARD_ICON_BASE}/a/aa/Gem.png`, monumentMultiplied: true, baseAmount: 65, unit: "Gems" },
  34: { label: "12 Skill Shards", iconUrl: `${REWARD_ICON_BASE}/a/aa/Skill_Shard.png`, monumentMultiplied: true, baseAmount: 12, unit: "Skill Shards" },
  36: { label: "10 Relic Chests", iconUrl: `${REWARD_ICON_BASE}/thumb/6/6d/Relic_Chest.png/30px-Relic_Chest.png`, monumentMultiplied: true, baseAmount: 10, unit: "Relic Chests" },
  38: { label: "80 Gems", iconUrl: `${REWARD_ICON_BASE}/a/aa/Gem.png`, monumentMultiplied: true, baseAmount: 80, unit: "Gems" },
  40: {
    label: "Seasonal Miner + Lootbug Skin",
    iconUrl: `${REWARD_ICON_BASE}/thumb/3/30/Valentines_Event_Skin_Icon.png/30px-Valentines_Event_Skin_Icon.png`,
    monumentMultiplied: false,
  },
  42: { label: "5 Blue Cows", iconUrl: `${REWARD_ICON_BASE}/thumb/9/98/Blue_Cow.png/15px-Blue_Cow.png`, monumentMultiplied: true, baseAmount: 5, unit: "Blue Cows" },
  44: { label: "30 Item Chests", iconUrl: `${REWARD_ICON_BASE}/thumb/a/a8/Item_Chest.png/30px-Item_Chest.png`, monumentMultiplied: true, baseAmount: 30, unit: "Item Chests" },
  46: { label: "14 Skill Shards", iconUrl: `${REWARD_ICON_BASE}/a/aa/Skill_Shard.png`, monumentMultiplied: true, baseAmount: 14, unit: "Skill Shards" },
  48: { label: "100 Gems", iconUrl: `${REWARD_ICON_BASE}/a/aa/Gem.png`, monumentMultiplied: true, baseAmount: 100, unit: "Gems" },
  50: { label: "1 Mythic Chest", iconUrl: `${REWARD_ICON_BASE}/thumb/1/12/Mythic_Chest.png/30px-Mythic_Chest.png`, monumentMultiplied: false },
  55: { label: "12 Relic Chests", iconUrl: `${REWARD_ICON_BASE}/thumb/6/6d/Relic_Chest.png/30px-Relic_Chest.png`, monumentMultiplied: true, baseAmount: 12, unit: "Relic Chests" },
  60: { label: "16 Skill Shards", iconUrl: `${REWARD_ICON_BASE}/a/aa/Skill_Shard.png`, monumentMultiplied: true, baseAmount: 16, unit: "Skill Shards" },
  65: { label: "120 Gems", iconUrl: `${REWARD_ICON_BASE}/a/aa/Gem.png`, monumentMultiplied: true, baseAmount: 120, unit: "Gems" },
  70: { label: "8 Gifts", iconUrl: `${REWARD_ICON_BASE}/thumb/2/24/Gift.png/27px-Gift.png`, monumentMultiplied: false },
  75: { label: "150 Gems", iconUrl: `${REWARD_ICON_BASE}/a/aa/Gem.png`, monumentMultiplied: true, baseAmount: 150, unit: "Gems" },
  80: {
    label: "Seasonal Bag Skin",
    iconUrl: `${REWARD_ICON_BASE}/thumb/1/12/Event_Bag_Skin_Icon.png/30px-Event_Bag_Skin_Icon.png`,
    monumentMultiplied: false,
  },
  85: { label: "30 Relic Chests", iconUrl: `${REWARD_ICON_BASE}/thumb/6/6d/Relic_Chest.png/30px-Relic_Chest.png`, monumentMultiplied: true, baseAmount: 30, unit: "Relic Chests" },
  90: { label: "20 Skill Shards", iconUrl: `${REWARD_ICON_BASE}/a/aa/Skill_Shard.png`, monumentMultiplied: true, baseAmount: 20, unit: "Skill Shards" },
  95: { label: "10 Gifts", iconUrl: `${REWARD_ICON_BASE}/thumb/2/24/Gift.png/27px-Gift.png`, monumentMultiplied: false },
  100: { label: "1 Mythic Chest", iconUrl: `${REWARD_ICON_BASE}/thumb/1/12/Mythic_Chest.png/30px-Mythic_Chest.png`, monumentMultiplied: false },
  115: { label: "2 Gifts", iconUrl: `${REWARD_ICON_BASE}/thumb/2/24/Gift.png/27px-Gift.png`, monumentMultiplied: false },
  130: { label: "3 Gifts", iconUrl: `${REWARD_ICON_BASE}/thumb/2/24/Gift.png/27px-Gift.png`, monumentMultiplied: false },
  150: { label: "5 Gifts", iconUrl: `${REWARD_ICON_BASE}/thumb/2/24/Gift.png/27px-Gift.png`, monumentMultiplied: false },
  200: { label: "10 Gifts", iconUrl: `${REWARD_ICON_BASE}/thumb/2/24/Gift.png/27px-Gift.png`, monumentMultiplied: false },
  250: { label: "15 Gifts", iconUrl: `${REWARD_ICON_BASE}/thumb/2/24/Gift.png/27px-Gift.png`, monumentMultiplied: false },
};

export function getRewardMilestoneLabel(wave: number): { label: string; iconUrl: string } | null {
  return EVENT_REWARD_MILESTONE_INFO[wave] ?? null;
}

/** Returns display label with monument multiplier applied (×2 per World Monument). Gifts, Mythic Chests, Skins unchanged. */
export function getRewardMilestoneDisplayLabel(wave: number, worldMonuments: number): { label: string; iconUrl: string } | null {
  const info = EVENT_REWARD_MILESTONE_INFO[wave];
  if (!info) return null;
  const mult = 2 ** Math.max(0, Math.min(4, worldMonuments));
  if (info.monumentMultiplied !== false && info.baseAmount != null && info.unit != null) {
    return { label: `${info.baseAmount * mult} ${info.unit}`, iconUrl: info.iconUrl };
  }
  return { label: info.label, iconUrl: info.iconUrl };
}
