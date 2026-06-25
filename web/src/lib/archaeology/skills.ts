import type { ArchBuild, AscensionLevel, Skill } from "./types";

export type SkillDisplay = {
  skill: Skill;
  short: string;
  label: string;
  icon: string;
  /** Minimum ascension level required to show and spend points on this skill. */
  ascensionRequired: AscensionLevel;
};

export const ARCH_SKILL_DISPLAY: Record<Skill, SkillDisplay> = {
  strength: {
    skill: "strength",
    short: "STR",
    label: "Strength",
    icon: "sprites/archaeology/Archaeology_Strength.png",
    ascensionRequired: 0,
  },
  agility: {
    skill: "agility",
    short: "AGI",
    label: "Agility",
    icon: "sprites/archaeology/Archaeology_Agility.png",
    ascensionRequired: 0,
  },
  perception: {
    skill: "perception",
    short: "PER",
    label: "Perception",
    icon: "sprites/archaeology/Archaeology_Perception.png",
    ascensionRequired: 0,
  },
  intellect: {
    skill: "intellect",
    short: "INT",
    label: "Intellect",
    icon: "sprites/archaeology/Archaeology_Intellect.png",
    ascensionRequired: 0,
  },
  luck: {
    skill: "luck",
    short: "LCK",
    label: "Luck",
    icon: "sprites/archaeology/Archaeology_Luck.png",
    ascensionRequired: 0,
  },
  divinity: {
    skill: "divinity",
    short: "DIV",
    label: "Divinity",
    icon: "sprites/archaeology/Archaeology_Divinity.png",
    ascensionRequired: 1,
  },
  corruption: {
    skill: "corruption",
    short: "COR",
    label: "Corruption",
    icon: "sprites/archaeology/Archaeology_Corruption.png",
    ascensionRequired: 2,
  },
};

/** Skills visible in the UI for the current ascension state (base always; Divinity at A1+; Corruption at A2+). */
export function getVisibleSkills(ascensionLevel: AscensionLevel): Skill[] {
  const asc = ascensionLevel ?? 0;
  const out: Skill[] = ["strength", "agility", "perception", "intellect", "luck"];
  if (asc >= 1) out.push("divinity");
  if (asc >= 2) out.push("corruption");
  return out;
}

export function getSkillDisplay(skill: Skill): SkillDisplay {
  return ARCH_SKILL_DISPLAY[skill];
}

/** Zero ascension-locked skill points when ascension is too low (e.g. after load). */
export function sanitizeSkillPoints(skillPoints: Record<Skill, number>, ascensionLevel: AscensionLevel): Record<Skill, number> {
  const asc = ascensionLevel ?? 0;
  return {
    ...skillPoints,
    divinity: asc >= 1 ? Math.max(0, Math.trunc(Number(skillPoints.divinity ?? 0))) : 0,
    corruption: asc >= 2 ? Math.max(0, Math.trunc(Number(skillPoints.corruption ?? 0))) : 0,
  };
}

/** Trim order when skill budget shrinks: base skills first, then ascension skills. */
export function skillTrimOrder(ascensionLevel: AscensionLevel): Skill[] {
  return getVisibleSkills(ascensionLevel).slice().reverse();
}

export function formatSkillPointsLine(build: ArchBuild, skills?: Skill[]): string {
  const visible = skills ?? getVisibleSkills(build.ascensionLevel ?? 0);
  return visible
    .map((s) => `${ARCH_SKILL_DISPLAY[s].short} ${Math.trunc(Number(build.skillPoints[s] ?? 0))}`)
    .join(" • ");
}
