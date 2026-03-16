import type { BlockTier, BlockType } from "./types";

/** Stage thresholds: from stage 100 use health_100/armor_100, from stage 150 use health_150/armor_150. */
export type BlockData = {
  tier: BlockTier;
  block_type: BlockType;
  health: number;
  xp: number;
  armor: number;
  fragment: number;
  floor_min: number;
  floor_max: number; // Infinity for open-ended
  /** HP from stage 100 (inclusive). If set, used when floor >= 100 and < 150. */
  health_100?: number;
  armor_100?: number;
  /** HP/Armor from stage 150 (inclusive). If set, used when floor >= 150. */
  health_150?: number;
  armor_150?: number;
};

export const BLOCK_TYPES: BlockType[] = ["dirt", "common", "rare", "epic", "legendary", "mythic"];

/** HP/Armor for a block at a given stage. From stage 100 use health_100/armor_100, from stage 150 use health_150/armor_150. */
export function getBlockHealthAtFloor(block: BlockData, floor: number): number {
  if (floor >= 150 && block.health_150 != null) return block.health_150;
  if (floor >= 100 && block.health_100 != null) return block.health_100;
  return block.health;
}

export function getBlockArmorAtFloor(block: BlockData, floor: number): number {
  if (floor >= 150 && block.armor_150 != null) return block.armor_150;
  if (floor >= 100 && block.armor_100 != null) return block.armor_100;
  return block.armor;
}

export const BLOCK_DATA: BlockData[] = [
  // Tier 1 — base | stage 100+ (HP100, Armor100) | stage 150+ (HP150, Armor150)
  { tier: 1, block_type: "dirt", health: 100, xp: 0.05, armor: 0, fragment: 0.0, floor_min: 1, floor_max: 11, health_100: 200, armor_100: 0, health_150: 400, armor_150: 0 },
  { tier: 1, block_type: "common", health: 250, xp: 0.15, armor: 5, fragment: 0.01, floor_min: 1, floor_max: 17, health_100: 500, armor_100: 7.5, health_150: 1000, armor_150: 7.5 },
  { tier: 1, block_type: "rare", health: 550, xp: 0.35, armor: 12, fragment: 0.01, floor_min: 3, floor_max: 25, health_100: 1100, armor_100: 18, health_150: 2200, armor_150: 18 },
  { tier: 1, block_type: "epic", health: 1150, xp: 1.0, armor: 25, fragment: 0.01, floor_min: 6, floor_max: 29, health_100: 2300, armor_100: 37.5, health_150: 4600, armor_150: 37.5 },
  { tier: 1, block_type: "legendary", health: 1950, xp: 3.5, armor: 50, fragment: 0.01, floor_min: 12, floor_max: 31, health_100: 3900, armor_100: 75, health_150: 7800, armor_150: 75 },
  { tier: 1, block_type: "mythic", health: 3500, xp: 7.5, armor: 150, fragment: 0.01, floor_min: 20, floor_max: 34, health_100: 7000, armor_100: 225, health_150: 14000, armor_150: 225 },

  // Tier 2
  { tier: 2, block_type: "dirt", health: 300, xp: 0.15, armor: 0, fragment: 0.0, floor_min: 12, floor_max: 23, health_100: 600, armor_100: 0, health_150: 1200, armor_150: 0 },
  { tier: 2, block_type: "common", health: 750, xp: 0.45, armor: 8.25, fragment: 0.02, floor_min: 18, floor_max: 29, health_100: 1500, armor_100: 12.38, health_150: 3000, armor_150: 12.38 },
  { tier: 2, block_type: "rare", health: 1650, xp: 1.05, armor: 19.8, fragment: 0.02, floor_min: 26, floor_max: 35, health_100: 3300, armor_100: 29.7, health_150: 6600, armor_150: 29.7 },
  { tier: 2, block_type: "epic", health: 3450, xp: 3.0, armor: 41.25, fragment: 0.02, floor_min: 30, floor_max: 41, health_100: 6900, armor_100: 61.88, health_150: 13800, armor_150: 61.88 },
  { tier: 2, block_type: "legendary", health: 5850, xp: 10.5, armor: 82.5, fragment: 0.02, floor_min: 32, floor_max: 44, health_100: 11700, armor_100: 123.75, health_150: 23400, armor_150: 123.75 },
  { tier: 2, block_type: "mythic", health: 10500, xp: 22.5, armor: 247.5, fragment: 0.02, floor_min: 35, floor_max: 49, health_100: 21000, armor_100: 371.25, health_150: 42000, armor_150: 371.25 },

  // Tier 3
  { tier: 3, block_type: "dirt", health: 900, xp: 0.45, armor: 0, fragment: 0, floor_min: 24, floor_max: Number.POSITIVE_INFINITY, health_100: 1800, armor_100: 0, health_150: 3600, armor_150: 0 },
  { tier: 3, block_type: "common", health: 2250, xp: 1.35, armor: 13.61, fragment: 0.04, floor_min: 30, floor_max: Number.POSITIVE_INFINITY, health_100: 4500, armor_100: 20.42, health_150: 9000, armor_150: 20.42 },
  { tier: 3, block_type: "rare", health: 4950, xp: 3.15, armor: 32.67, fragment: 0.04, floor_min: 36, floor_max: Number.POSITIVE_INFINITY, health_100: 9900, armor_100: 49, health_150: 19800, armor_150: 49 },
  { tier: 3, block_type: "epic", health: 10350, xp: 9.0, armor: 68.06, fragment: 0.04, floor_min: 42, floor_max: Number.POSITIVE_INFINITY, health_100: 20700, armor_100: 102.09, health_150: 41400, armor_150: 102.09 },
  { tier: 3, block_type: "legendary", health: 17550, xp: 31.5, armor: 136.12, fragment: 0.04, floor_min: 45, floor_max: Number.POSITIVE_INFINITY, health_100: 35100, armor_100: 204.19, health_150: 70200, armor_150: 204.19 },
  { tier: 3, block_type: "mythic", health: 31500, xp: 67.5, armor: 408.37, fragment: 0.04, floor_min: 50, floor_max: Number.POSITIVE_INFINITY, health_100: 63000, armor_100: 612.56, health_150: 126000, armor_150: 612.56 },
];

function key(tier: number, bt: string) {
  return `${tier}:${bt}`;
}

const INDEX = new Map<string, BlockData>(BLOCK_DATA.map((b) => [key(b.tier, b.block_type), b]));

const BY_TYPE = new Map<BlockType, BlockData[]>();
for (const b of BLOCK_DATA) {
  const arr = BY_TYPE.get(b.block_type) ?? [];
  arr.push(b);
  BY_TYPE.set(b.block_type, arr);
}

export function getBlockData(tier: BlockTier, blockType: BlockType): BlockData | null {
  return INDEX.get(key(tier, blockType)) ?? null;
}

export function getBlockAtFloor(floor: number, blockType: BlockType): BlockData | null {
  const blocks = BY_TYPE.get(blockType) ?? [];
  const valid = blocks.filter((b) => b.floor_min <= floor && floor <= b.floor_max);
  if (!valid.length) return null;
  return valid.reduce((best, cur) => (cur.tier > best.tier ? cur : best), valid[0]);
}

/** Block mix for a floor with health/armor resolved for that stage (stage 100+ and 150+ use scaled values). */
export function getBlockMixForFloor(floor: number): Record<BlockType, BlockData> {
  const out: Partial<Record<BlockType, BlockData>> = {};
  for (const bt of BLOCK_TYPES) {
    const b = getBlockAtFloor(floor, bt);
    if (b) {
      out[bt] = {
        ...b,
        health: getBlockHealthAtFloor(b, floor),
        armor: getBlockArmorAtFloor(b, floor),
      };
    }
  }
  return out as Record<BlockType, BlockData>;
}

/** Gem cost for upgrading a block card from Normal (Card) to Gilded. Gold 25m, PP 500m (not used here). */
export function getCardGemCost(blockType: BlockType, tier: 1 | 2 | 3): number {
  const BT_INDEX = BLOCK_TYPES.indexOf(blockType);
  const idx = BT_INDEX * 3 + (tier - 1);
  return 1000 + idx * 125;
}

