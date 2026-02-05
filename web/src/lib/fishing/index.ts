/**
 * Fishing data and helpers for Idle Obelisk Miner (web).
 * Use this as the single entry point for fishing lib.
 */

export {
  catchChancePercent,
  expectedCatchesPerRoll,
  effectiveFishingTickSec,
  CATCH_CHANCE_CAP_PERCENT,
  FISHING_TICK_BASE_SEC,
} from "./types";
export type {
  DockDef,
  DockFishSet,
  DockId,
  DockTier,
  EnhanceDef,
  EnhanceId,
  EnhanceIdT1,
  EnhanceIdT2,
  FishDef,
  FishingUpgradeId,
  UpgradeDef,
  UpgradeCostEntry,
  EnhanceCostEntry,
} from "./types";

export {
  AQUARIUM,
  DOCKS,
  ALL_FISH,
  ENHANCEMENTS_T1,
  ENHANCEMENTS_T2,
  FISHING_UPGRADES_T1,
  FISHING_UPGRADES_T2,
  FISHING_WIKI_IMAGE_BASE,
  fishIconUrl,
  dockIconUrl,
  upgradeIconUrl,
  enhanceIconUrl,
  getDock,
  getFishById,
  getFishForDock,
} from "./constants";

export { UPGRADE_COSTS, ENHANCE_COSTS_T1, ENHANCE_COSTS_T2 } from "./upgradeCosts";
export {
  computeFishingStatsFromLevels,
  type ComputedFishingStats,
} from "./computeStats";
