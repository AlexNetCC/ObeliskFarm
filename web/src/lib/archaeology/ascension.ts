import { FRAGMENT_UPGRADES } from "./constants";
import { getVisibleSkills, sanitizeSkillPoints } from "./skills";
import type { ArchBuild, ArchGemUpgradeKey, AscensionLevel, AscensionUpgradeSnapshot, AscensionUpgradeSnapshots, Skill } from "./types";

export function emptyGemUpgrades(): Record<ArchGemUpgradeKey, number> {
  return { stamina: 0, xp: 0, fragment: 0 };
}

export function emptyUpgradeSnapshot(): AscensionUpgradeSnapshot {
  return { fragmentUpgradeLevels: {}, gemUpgrades: emptyGemUpgrades() };
}

export function captureUpgradeSnapshot(build: ArchBuild): AscensionUpgradeSnapshot {
  return {
    fragmentUpgradeLevels: { ...build.fragmentUpgradeLevels },
    gemUpgrades: { ...build.gemUpgrades },
  };
}

/** Load legacy saves: seed per-ascension upgrade storage from flat fragment/gem fields. */
export function migrateAscensionUpgradeSnapshots(
  saved: Partial<ArchBuild>,
  ascensionLevel: AscensionLevel,
  gemUpgrades: Record<ArchGemUpgradeKey, number>,
): AscensionUpgradeSnapshots {
  if (saved.ascensionUpgradeSnapshots && Object.keys(saved.ascensionUpgradeSnapshots).length > 0) {
    return { ...saved.ascensionUpgradeSnapshots };
  }
  return {
    [ascensionLevel]: {
      fragmentUpgradeLevels: { ...(saved.fragmentUpgradeLevels ?? {}) },
      gemUpgrades: { ...gemUpgrades },
    },
  };
}

export function getUpgradeSnapshotForAscension(
  snapshots: AscensionUpgradeSnapshots | undefined,
  ascensionLevel: AscensionLevel,
): AscensionUpgradeSnapshot {
  return snapshots?.[ascensionLevel] ?? emptyUpgradeSnapshot();
}

/** Persist active fragment/gem upgrades into the snapshot for the current ascension level. */
export function withSyncedUpgradeSnapshot(
  build: ArchBuild,
  updates: Partial<Pick<ArchBuild, "fragmentUpgradeLevels" | "gemUpgrades">>,
): ArchBuild {
  const asc = build.ascensionLevel ?? 0;
  const next: ArchBuild = { ...build, ...updates };
  return {
    ...next,
    ascensionUpgradeSnapshots: {
      ...(build.ascensionUpgradeSnapshots ?? {}),
      [asc]: captureUpgradeSnapshot(next),
    },
  };
}

/** Save current ascension upgrades, then load the target ascension's fragment/gem levels. */
export function switchAscensionUpgrades(build: ArchBuild, nextAsc: AscensionLevel): Pick<ArchBuild, "ascensionUpgradeSnapshots" | "fragmentUpgradeLevels" | "gemUpgrades"> {
  const curAsc = build.ascensionLevel ?? 0;
  const asc = normalizeAscensionLevel(nextAsc, build.unlockedStage);
  const snapshots: AscensionUpgradeSnapshots = {
    ...(build.ascensionUpgradeSnapshots ?? {}),
    [curAsc]: captureUpgradeSnapshot(build),
  };
  const loaded = getUpgradeSnapshotForAscension(snapshots, asc);
  return {
    ascensionUpgradeSnapshots: snapshots,
    fragmentUpgradeLevels: { ...loaded.fragmentUpgradeLevels },
    gemUpgrades: { ...loaded.gemUpgrades },
  };
}


export const ASCENSION2_UNLOCK_STAGE = 150;

export function normalizeAscensionLevel(raw: unknown, _unlockedStage?: number): AscensionLevel {
  const n = Math.trunc(Number(raw ?? 0));
  if (n >= 2) return 2;
  if (n >= 1) return 1;
  return 0;
}

/** Level of Ascension 1 "Stat Points +1" upgrade (persists from the Asc 1 snapshot at higher ascensions). */
export function getStatPointsUpgradeLevel(build: ArchBuild): number {
  const asc = build.ascensionLevel ?? 0;
  if (asc < 1) return 0;
  const current = Math.max(0, Math.trunc(Number(build.fragmentUpgradeLevels["stat_points_a1"] ?? 0)));
  if (current > 0) return current;
  if (asc >= 2) {
    return Math.max(
      0,
      Math.trunc(Number(build.ascensionUpgradeSnapshots?.[1]?.fragmentUpgradeLevels?.["stat_points_a1"] ?? 0)),
    );
  }
  return 0;
}

/** Extra stats points from Ascension 1 "Stat Points" upgrade (+1 per level, max 5). */
export function getBonusSkillPoints(build: ArchBuild): number {
  const lvl = getStatPointsUpgradeLevel(build);
  const perLvl = Number(FRAGMENT_UPGRADES.stat_points_a1?.extra_skill_points ?? 1);
  return lvl * perLvl;
}

export function getTotalSkillPointBudget(build: ArchBuild): number {
  return Math.max(0, Math.trunc(Number(build.archLevel ?? 0))) + getBonusSkillPoints(build);
}

/** Tier-0 fragment upgrade multiplier (Asc 1: 5×, Asc 2: 10×). Ascension-only upgrades use tier-specific rules in upgradeCosts. */
export function getAscensionFragmentCostMultiplier(ascensionLevel: AscensionLevel): number {
  if (ascensionLevel >= 2) return 10;
  if (ascensionLevel >= 1) return 5;
  return 1;
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

/** Stats the MC optimizers distribute (base five + Divinity at Asc 1+ + Corruption at Asc 2+). */
export function getOptimizerStats(ascensionLevel: AscensionLevel): Skill[] {
  const stats: Skill[] = ["strength", "agility", "perception", "intellect", "luck"];
  if (ascensionLevel >= 1) stats.push("divinity");
  if (ascensionLevel >= 2) stats.push("corruption");
  return stats;
}

/** Total stats points the MC optimizers may distribute across all active stats. */
export function getOptimizerSkillBudget(build: ArchBuild): number {
  return getTotalSkillPointBudget(build);
}

function clampOptimizerPoint(value: number, cap: number): number {
  return Math.max(0, Math.min(cap, Math.trunc(Number(value ?? 0))));
}

/**
 * Force an optimizer distribution to sum exactly to numPoints (respecting caps and STR >= 1).
 * MC samplers must call this so requireStr never inflates the total budget.
 */
export function normalizeOptimizerDistribution(args: {
  optimizerSkills: Skill[];
  dist: number[];
  numPoints: number;
  caps: Partial<Record<Skill, number>>;
  requireStr?: boolean;
  rng?: () => number;
}): number[] {
  const { optimizerSkills, numPoints, caps, requireStr = false } = args;
  const rng = args.rng ?? (() => Math.random());
  const base = optimizerSkills.map((sk, i) => clampOptimizerPoint(args.dist[i] ?? 0, caps[sk] ?? numPoints));

  let sum = base.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (sum !== numPoints && guard++ < 10000) {
    if (sum > numPoints) {
      const order = base
        .map((v, i) => ({ i, v, sk: optimizerSkills[i]! }))
        .sort((a, b) => b.v - a.v);
      let removed = false;
      for (const { i, v, sk } of order) {
        if (v <= 0) continue;
        if (requireStr && sk === "strength" && v <= 1) continue;
        base[i] -= 1;
        sum -= 1;
        removed = true;
        break;
      }
      if (!removed) break;
    } else {
      const candidates = optimizerSkills
        .map((sk, i) => ({ i, cap: caps[sk] ?? numPoints }))
        .filter(({ i, cap }) => base[i]! < cap);
      if (!candidates.length) break;
      const pick = candidates[Math.trunc(rng() * candidates.length)]!;
      base[pick.i]! += 1;
      sum += 1;
    }
  }

  if (requireStr && numPoints > 0) {
    const strIdx = optimizerSkills.indexOf("strength");
    if (strIdx >= 0 && base[strIdx]! <= 0 && (caps.strength ?? numPoints) > 0) {
      const donors = base
        .map((v, i) => ({ i, v }))
        .filter(({ i, v }) => i !== strIdx && v > 0)
        .sort((a, b) => b.v - a.v);
      if (donors.length > 0) {
        base[donors[0]!.i]! -= 1;
        base[strIdx]! += 1;
      }
    }
  }

  return base;
}

export type OptimizerDistRecord = {
  strength: number;
  agility: number;
  perception: number;
  intellect: number;
  luck: number;
  divinity?: number;
  corruption?: number;
};

export function optimizerDistArrayToRecord(build: ArchBuild, dist: number[]): OptimizerDistRecord {
  const keys = getOptimizerStats(build.ascensionLevel ?? 0);
  const out: OptimizerDistRecord = { strength: 0, agility: 0, perception: 0, intellect: 0, luck: 0 };
  keys.forEach((k, i) => {
    (out as Record<string, number>)[k] = Math.trunc(dist[i] ?? 0);
  });
  return out;
}

export function skillPointsFromOptimizerDistRecord(
  build: ArchBuild,
  dist: OptimizerDistRecord | Record<Skill, number>,
): Record<Skill, number> {
  const asc = build.ascensionLevel ?? 0;
  const out = sanitizeSkillPoints(
    { strength: 0, agility: 0, perception: 0, intellect: 0, luck: 0, divinity: 0, corruption: 0 },
    asc,
  );
  for (const k of getOptimizerStats(asc)) {
    out[k] = Math.trunc(Number((dist as Record<string, number>)[k] ?? 0));
  }
  return out;
}

export function buildSkillPointsFromOptimizerDist(build: ArchBuild, dist: number[]): Record<Skill, number> {
  return skillPointsFromOptimizerDistRecord(build, optimizerDistArrayToRecord(build, dist));
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
