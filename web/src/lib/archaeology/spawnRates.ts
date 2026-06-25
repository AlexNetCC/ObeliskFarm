import type { AscensionLevel, BlockType } from "./types";
import { BLOCK_TYPES } from "./blockStats";

/** Re-export for callers that need the full block-type order (includes divine). */
export { BLOCK_TYPES };

export type SpawnContext = {
  ascensionLevel?: AscensionLevel;
  ignoreBoss?: boolean;
};

/** Boss floors with a single block type (24 blocks). Wiki: Archaeology → Boss Floors. */
export const BOSS_FLOORS: Record<number, BlockType> = {
  11: "dirt",
  17: "common",
  23: "dirt",
  25: "rare",
  29: "epic",
  31: "legendary",
  35: "rare",
  41: "epic",
  44: "legendary",
  95: "common",
  98: "mythic",
  110: "rare",
  125: "epic",
  135: "legendary",
  140: "mythic",
  149: "divine",
};

const P4 = (4 / 24) * 100;
const P6 = (6 / 24) * 100;
const P20 = (20 / 24) * 100;
const P22 = (22 / 24) * 100;
const P2 = (2 / 24) * 100;

/** Boss floors with mixed block layout (24 blocks total). Counts → same relative weights as wiki percentages. */
const MIXED_BOSS_FLOORS: Record<number, Record<BlockType, number>> = {
  34: { dirt: 0, common: P20, rare: 0, epic: 0, legendary: (4 / 24) * 100, mythic: 0, divine: 0 },
  49: { dirt: P6, common: P6, rare: P6, epic: 0, legendary: 0, mythic: P6, divine: 0 },
  74: { dirt: 0, common: P22, rare: 0, epic: 0, legendary: 0, mythic: 0, divine: P2 },
  99: { dirt: P4, common: P4, rare: P4, epic: P4, legendary: P4, mythic: P4, divine: 0 },
};

type StageRangeKey = string;
type StageRange = { min: number; max: number };

/** Normal stages; divine rates apply only when ascensionLevel >= 1. Boss floors override. */
const RANGES: Array<{ key: StageRangeKey; range: StageRange; rates: Record<BlockType, number> }> = [
  { key: "1-2", range: { min: 1, max: 2 }, rates: { dirt: 28.57, common: 14.29, rare: 0, epic: 0, legendary: 0, mythic: 0, divine: 0 } },
  { key: "3-4", range: { min: 3, max: 4 }, rates: { dirt: 25.4, common: 12.7, rare: 11.11, epic: 0, legendary: 0, mythic: 0, divine: 0 } },
  { key: "5", range: { min: 5, max: 5 }, rates: { dirt: 25.52, common: 10.94, rare: 12.5, epic: 0, legendary: 0, mythic: 0, divine: 0 } },
  { key: "6-9", range: { min: 6, max: 9 }, rates: { dirt: 22.97, common: 9.84, rare: 11.25, epic: 10, legendary: 0, mythic: 0, divine: 0 } },
  { key: "10-11", range: { min: 10, max: 11 }, rates: { dirt: 23.41, common: 8.78, rare: 9.88, epic: 11.11, legendary: 0, mythic: 0, divine: 0 } },
  { key: "12-14", range: { min: 12, max: 14 }, rates: { dirt: 21.74, common: 8.15, rare: 9.17, epic: 10.32, legendary: 7.14, mythic: 0, divine: 0 } },
  { key: "15-19", range: { min: 15, max: 19 }, rates: { dirt: 21.27, common: 7.98, rare: 8.97, epic: 11.54, legendary: 7.69, mythic: 0, divine: 0 } },
  { key: "20-24", range: { min: 20, max: 24 }, rates: { dirt: 19.5, common: 7.31, rare: 8.23, epic: 12.34, legendary: 8.64, mythic: 5.0, divine: 0 } },
  { key: "25-29", range: { min: 25, max: 29 }, rates: { dirt: 18.47, common: 7.92, rare: 9.05, epic: 12.06, legendary: 10.56, mythic: 5.0, divine: 0 } },
  { key: "30-49", range: { min: 30, max: 49 }, rates: { dirt: 18.1, common: 9.05, rare: 7.92, epic: 11.88, legendary: 11.88, mythic: 5.0, divine: 0 } },
  { key: "50-59", range: { min: 50, max: 59 }, rates: { dirt: 16.53, common: 8.26, rare: 9.64, epic: 13.5, legendary: 11.57, mythic: 5.44, divine: 2.0 } },
  { key: "60-69", range: { min: 60, max: 69 }, rates: { dirt: 16.49, common: 8.25, rare: 9.62, epic: 13.47, legendary: 11.54, mythic: 5.43, divine: 2.22 } },
  { key: "70-99", range: { min: 70, max: 99 }, rates: { dirt: 16.39, common: 9.83, rare: 9.83, epic: 11.47, legendary: 11.47, mythic: 5.74, divine: 2.5 } },
  { key: "100-149", range: { min: 100, max: 149 }, rates: { dirt: 15.7, common: 9.42, rare: 9.42, epic: 10.99, legendary: 12.82, mythic: 6.9, divine: 3.33 } },
  { key: "150+", range: { min: 150, max: Number.POSITIVE_INFINITY }, rates: { dirt: 13.5, common: 8.1, rare: 9.72, epic: 11.67, legendary: 14.0, mythic: 9.33, divine: 6.67 } },
];

function gateBossRates(rates: Record<BlockType, number>, ascensionLevel: AscensionLevel): Record<BlockType, number> {
  const out = { ...rates };
  if (ascensionLevel < 1) out.divine = 0;
  return out;
}

export function getSpawnRatesForStage(stage: number, ctx: SpawnContext = {}): Record<BlockType, number> {
  const ascensionLevel = ctx.ascensionLevel ?? 0;
  const ignoreBoss = ctx.ignoreBoss ?? false;

  if (!ignoreBoss && MIXED_BOSS_FLOORS[stage]) {
    return gateBossRates({ ...MIXED_BOSS_FLOORS[stage] }, ascensionLevel);
  }
  if (!ignoreBoss && BOSS_FLOORS[stage]) {
    const b = BOSS_FLOORS[stage];
    if (b === "divine" && ascensionLevel < 1) {
      return { dirt: 0, common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0, divine: 0 };
    }
    return {
      dirt: b === "dirt" ? 100 : 0,
      common: b === "common" ? 100 : 0,
      rare: b === "rare" ? 100 : 0,
      epic: b === "epic" ? 100 : 0,
      legendary: b === "legendary" ? 100 : 0,
      mythic: b === "mythic" ? 100 : 0,
      divine: b === "divine" ? 100 : 0,
    };
  }
  for (const r of RANGES) {
    if (r.range.min <= stage && stage <= r.range.max) {
      const rates = { ...r.rates };
      if (ascensionLevel < 1) rates.divine = 0;
      return rates;
    }
  }
  const fallback = { ...RANGES[RANGES.length - 1].rates };
  if (ascensionLevel < 1) fallback.divine = 0;
  return fallback;
}

export function getTotalSpawnProbability(stage: number, ctx: SpawnContext = {}): number {
  const raw = getSpawnRatesForStage(stage, ctx);
  return Object.values(raw).reduce((a, b) => a + b, 0);
}

export function getNormalizedSpawnRates(stage: number, ctx: SpawnContext = {}): Record<BlockType, number> {
  const raw = getSpawnRatesForStage(stage, ctx);
  const active: Partial<Record<BlockType, number>> = {};
  let total = 0;
  for (const bt of BLOCK_TYPES) {
    const v = raw[bt];
    if (v > 0) {
      active[bt] = v;
      total += v;
    }
  }
  if (total <= 0) return { dirt: 1 } as Record<BlockType, number>;
  const out: Partial<Record<BlockType, number>> = {};
  for (const bt of Object.keys(active) as BlockType[]) {
    out[bt] = (active[bt] ?? 0) / total;
  }
  return out as Record<BlockType, number>;
}
