import { FRAGMENT_UPGRADES } from "./constants";
import { getVisibleSkills } from "./skills";
import type { ArchBuild, AscensionLevel, Skill } from "./types";

export const ASCENSION2_UNLOCK_STAGE = 150;

export function normalizeAscensionLevel(raw: unknown, unlockedStage: number): AscensionLevel {
  const n = Math.trunc(Number(raw ?? 0));
  if (n >= 2 && unlockedStage >= ASCENSION2_UNLOCK_STAGE) return 2;
  if (n >= 1) return 1;
  return 0;
}

/** Extra skill points from Ascension 1 "Stat Points" upgrade (+1 per level, max 5). */
export function getBonusSkillPoints(build: ArchBuild): number {
  const lvl = Math.max(0, Math.trunc(Number(build.fragmentUpgradeLevels["stat_points_a1"] ?? 0)));
  const perLvl = Number(FRAGMENT_UPGRADES.stat_points_a1?.extra_skill_points ?? 1);
  return lvl * perLvl;
}

export function getTotalSkillPointBudget(build: ArchBuild): number {
  return Math.max(0, Math.trunc(Number(build.archLevel ?? 0))) + getBonusSkillPoints(build);
}

export function getAscensionFragmentCostMultiplier(ascensionLevel: AscensionLevel): number {
  return ascensionLevel >= 1 ? 5 : 1;
}

export function getAscensionGemCostMultiplier(ascensionLevel: AscensionLevel): number {
  return ascensionLevel >= 1 ? 50 : 1;
}

/** Base skills always available; Divinity at Asc 1+, Corruption at Asc 2+. */
export function getActiveSkills(build: ArchBuild): Skill[] {
  return getVisibleSkills(build.ascensionLevel ?? 0);
}

export function isSkillUnlocked(build: ArchBuild, skill: Skill): boolean {
  const asc = build.ascensionLevel ?? 0;
  if (skill === "divinity") return asc >= 1;
  if (skill === "corruption") return asc >= 2;
  return true;
}

export function ascensionLabel(level: AscensionLevel): string {
  if (level >= 2) return "Ascension 2";
  if (level >= 1) return "Ascension 1";
  return "No Ascension";
}

/** Skill points the MC optimizers distribute across the five base skills (excludes fixed Divinity/Corruption). */
export function getOptimizerSkillBudget(build: ArchBuild): number {
  let fixed = 0;
  if ((build.ascensionLevel ?? 0) >= 1) fixed += Math.max(0, Math.trunc(Number(build.skillPoints.divinity ?? 0)));
  if ((build.ascensionLevel ?? 0) >= 2) fixed += Math.max(0, Math.trunc(Number(build.skillPoints.corruption ?? 0)));
  return Math.max(0, getTotalSkillPointBudget(build) - fixed);
}

export function buildSkillPointsFromOptimizerDist(build: ArchBuild, dist: number[]): Record<Skill, number> {
  return {
    strength: Math.trunc(dist[0] ?? 0),
    agility: Math.trunc(dist[1] ?? 0),
    perception: Math.trunc(dist[2] ?? 0),
    intellect: Math.trunc(dist[3] ?? 0),
    luck: Math.trunc(dist[4] ?? 0),
    divinity: (build.ascensionLevel ?? 0) >= 1 ? Math.trunc(Number(build.skillPoints.divinity ?? 0)) : 0,
    corruption: (build.ascensionLevel ?? 0) >= 2 ? Math.trunc(Number(build.skillPoints.corruption ?? 0)) : 0,
  };
}

export function mcOptionsFromBuild(build: ArchBuild) {
  return {
    use_crit: true as const,
    enrage_enabled: build.enrageEnabled,
    flurry_enabled: build.flurryEnabled,
    quake_enabled: build.quakeEnabled,
    ascensionLevel: (build.ascensionLevel ?? 0) as AscensionLevel,
  };
}
