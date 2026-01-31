/** Lootbug buff data from main lootbug script (ObeliskGemEV/lootbug/analyzer.py) */

export const FREE_BUFF_ICONS: Record<string, string> = {
  "+2 Gems": "https://static.wikitide.net/shminerwiki/a/aa/Gem.png",
  "+1 Item Chest": "https://static.wikitide.net/shminerwiki/a/a8/Item_Chest.png",
  "+1 Relic Chest": "https://static.wikitide.net/shminerwiki/6/6d/Relic_Chest.png",
  "+10 Cherry Charges": "https://static.wikitide.net/shminerwiki/1/1b/Cherry_Bomb.png",
  "2x Ore Income": "https://static.wikitide.net/shminerwiki/2/2c/2x_Ore_Income_Buff.png",
  "3x Vein Spawn Rate": "https://static.wikitide.net/shminerwiki/9/91/3x_Vein_Spawn_Rate_Buff.png",
  "2x Game Speed": "https://static.wikitide.net/shminerwiki/d/d4/Game_Speed_Multiplier.png",
  "2x Star Spawn Rate": "https://static.wikitide.net/shminerwiki/5/5b/2x_Spawn_Rate_Buff.png",
  "100% Auto-Catch": "https://static.wikitide.net/shminerwiki/8/88/Auto-Catch_Chance.png",
};

export type FreeBuff = {
  name: string;
  duration: string | null;
  weight: number | [number, number];
  requirement: string | null;
};

export const FREE_BUFFS: FreeBuff[] = [
  { name: "+2 Gems", duration: null, weight: 30, requirement: null },
  { name: "+1 Item Chest", duration: null, weight: 35, requirement: null },
  { name: "+1 Relic Chest", duration: null, weight: 5, requirement: null },
  { name: "+10 Cherry Charges", duration: null, weight: 20, requirement: "Cherry Bomb + Obelisk Lvl 10" },
  { name: "2x Ore Income", duration: "2 min", weight: 15, requirement: null },
  { name: "3x Vein Spawn Rate", duration: "2 min", weight: 20, requirement: "Stone Vein Research" },
  { name: "2x Game Speed", duration: "2 min", weight: 15, requirement: null },
  { name: "2x Star Spawn Rate", duration: "2 min", weight: 16, requirement: "Telescope Lvl 1" },
  { name: "100% Auto-Catch", duration: "4 min", weight: 20, requirement: "Telescope Lvl 1" },
];

export type GemBuff = {
  name: string;
  duration: string | null;
  cost: number;
  weight: number | [number, number] | [number, number, number];
  requirement: string | null;
};

export const GEM_BUFFS: GemBuff[] = [
  { name: "+3 Item Chests", duration: null, cost: 15, weight: 18, requirement: null },
  { name: "+1 Relic Chest", duration: null, cost: 15, weight: 10, requirement: null },
  { name: "+100 Cherry Charges", duration: null, cost: 15, weight: 20, requirement: "Cherry Bomb + Obelisk Lvl 10" },
  { name: "2x Ore Income", duration: "10 min", cost: 15, weight: 24, requirement: null },
  { name: "3x Vein Spawn Rate", duration: "10 min", cost: 15, weight: 20, requirement: "Stone Vein Research" },
  { name: "2x Game Speed", duration: "10 min", cost: 15, weight: 24, requirement: null },
  { name: "10x Bomb Recharge", duration: "2 min", cost: 15, weight: 8, requirement: null },
  { name: "2x Star Spawn Rate", duration: "10 min", cost: 25, weight: 16, requirement: "Telescope Lvl 1" },
  { name: "100% Auto-Catch", duration: "20 min", cost: 25, weight: 20, requirement: "Telescope Lvl 1" },
  { name: "Archaeology +600 Attacks", duration: null, cost: 25, weight: 10, requirement: "Obelisk Lvl 30" },
  { name: "Fishing +12 Ticks", duration: null, cost: 35, weight: 10, requirement: "Obelisk Lvl 37" },
];

/** Icons for gem buffs (reuse free buff icons where applicable) */
export const GEM_BUFF_ICONS: Record<string, string> = {
  "+3 Item Chests": "https://static.wikitide.net/shminerwiki/a/a8/Item_Chest.png",
  "+1 Relic Chest": "https://static.wikitide.net/shminerwiki/6/6d/Relic_Chest.png",
  "+100 Cherry Charges": "https://static.wikitide.net/shminerwiki/1/1b/Cherry_Bomb.png",
  "2x Ore Income": "https://static.wikitide.net/shminerwiki/2/2c/2x_Ore_Income_Buff.png",
  "3x Vein Spawn Rate": "https://static.wikitide.net/shminerwiki/9/91/3x_Vein_Spawn_Rate_Buff.png",
  "2x Game Speed": "https://static.wikitide.net/shminerwiki/d/d4/Game_Speed_Multiplier.png",
  "10x Bomb Recharge": "https://static.wikitide.net/shminerwiki/b/ba/Bomb_Recharge_Speed_10x_Buff.png",
  "2x Star Spawn Rate": "https://static.wikitide.net/shminerwiki/5/5b/2x_Spawn_Rate_Buff.png",
  "100% Auto-Catch": "https://static.wikitide.net/shminerwiki/8/88/Auto-Catch_Chance.png",
  "Archaeology +600 Attacks": "https://static.wikitide.net/shminerwiki/5/5a/Arch_Icon.png",
  "Fishing +12 Ticks": "https://static.wikitide.net/shminerwiki/8/8c/Fishing_Tick_Reduction.png",
};

const FALLBACK_ICON = "https://static.wikitide.net/shminerwiki/2/27/Blank_Button.png";

/** Get numeric weight for probability (use first value for tuple weights) */
export function getWeight(buff: FreeBuff | GemBuff): number {
  const w = buff.weight;
  return typeof w === "number" ? w : w[0];
}

/** Parse duration string (e.g. "2 min", "10 min") to minutes, or null if instant */
export function getDurationMinutes(duration: string | null): number | null {
  if (!duration) return null;
  const m = duration.match(/^(\d+)\s*min$/i);
  return m ? Number(m[1]) : null;
}

export function getFreeBuffIcon(name: string): string {
  return FREE_BUFF_ICONS[name] ?? FALLBACK_ICON;
}

export function getGemBuffIcon(name: string): string {
  return GEM_BUFF_ICONS[name] ?? FALLBACK_ICON;
}
