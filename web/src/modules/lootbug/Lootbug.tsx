import { useEffect, useMemo, useRef, useState } from "react";
import "./lootbug.css";
import { Tooltip } from "../../components/Tooltip";
import { Collapsible } from "../../components/Collapsible";
import { loadJson, saveJson } from "../../lib/storage";
import {
  calculateCherryChargesGemsPerHour,
  defaultGameParameters,
  getGameSpeedMultiplier,
  type GameParameters,
} from "../../lib/gemev/freebieEv";
import {
  FREE_BUFFS,
  GEM_BUFFS,
  getDurationMinutes,
  getFreeBuffIcon,
  getGemBuffIcon,
  getWeight,
} from "../../lib/lootbug/constants";

const DEFAULT_ACTIVE_GEM_BUFFS = ["2x Game Speed", "10x Bomb Recharge"];

const LOOTBUG_BASE_SPAWN_MIN = 20;
const STORAGE_KEY = "obeliskfarm:web:lootbug_save.json:v1";
const GEMEV_STORAGE_KEY = "obeliskfarm:web:gemev_save.json:v1";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";
const FISHING_EXTERNAL_KEY = "obeliskfarm:web:fishing_external.json";
const ARCH_EXTERNAL_KEY = "obeliskfarm:web:arch_external.json";

type LootbugState = {
  spawnRateMultiplier: number;
  tripleChancePct: number;
  goldenChancePct: number;
  gemCostReduction: number;
  lootMultiplier: number;
  activeGemBuffs: string[];
};

const DEFAULT: LootbugState = {
  spawnRateMultiplier: 1,
  tripleChancePct: 0,
  goldenChancePct: 0,
  gemCostReduction: 0,
  lootMultiplier: 1,
  activeGemBuffs: DEFAULT_ACTIVE_GEM_BUFFS,
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Format decimal minutes as m:ss (e.g. 5.5 → "5:30"). */
function formatMinSec(minDecimal: number): string {
  if (!Number.isFinite(minDecimal) || minDecimal < 0) return "0:00";
  let m = Math.floor(minDecimal);
  let s = Math.round((minDecimal - m) * 60);
  if (s >= 60) {
    s = 0;
    m += 1;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format decimal minutes as MM:SS min (e.g. 2 → "02:00 min"). */
function formatMinSecWithUnit(minDecimal: number): string {
  if (!Number.isFinite(minDecimal) || minDecimal < 0) return "00:00 min";
  let m = Math.floor(minDecimal);
  let s = Math.round((minDecimal - m) * 60);
  if (s >= 60) {
    s = 0;
    m += 1;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} min`;
}

/** True if buff is event-based (ticks, attacks, chests, charges, gems) rather than duration-based. */
function isEventBuff(buffName: string): boolean {
  return (
    buffName === "Fishing +12 Ticks" ||
    buffName === "Archaeology +600 Attacks" ||
    buffName === "+3 Item Chests" ||
    buffName === "+1 Relic Chest" ||
    buffName === "+100 Cherry Charges" ||
    buffName === "+2 Gems" ||
    buffName === "+1 Item Chest" ||
    buffName === "+10 Cherry Charges"
  );
}

/** Red heatmap for negative values: more negative = stronger red. */
function heatmapRed(gemPerHour: number): string {
  if (gemPerHour >= 0) return "inherit";
  const t = Math.min(1, Math.abs(gemPerHour) / 80);
  const r = Math.round(180 + t * 75);
  const g = Math.round(60 - t * 60);
  const b = Math.round(60 - t * 60);
  return `rgb(${r},${g},${b})`;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parseNumber(raw: string): number {
  const cleaned = raw.trim().replaceAll(",", ".").replaceAll(" ", "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Gem EV value of "+N Cherry Charges" from Gem EV bomb cycle (Late = gem bomb value, Early = battery refill value). */
function getCherryChargesValueGemEv(params: GameParameters, buffName: string): number | null {
  const m = /^\+(\d+)\s*Cherry Charges$/.exec(buffName);
  if (!m) return null;
  const charges = parseInt(m[1], 10);
  if (!Number.isFinite(charges) || charges <= 0) return null;
  return calculateCherryChargesGemsPerHour(params, charges);
}

function NumInput(props: {
  label: React.ReactNode;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  decimals?: number;
  suffix?: string;
}) {
  const { label, value, onChange, min = 0, max = 1e6, decimals = 2, suffix } = props;
  const isEditingRef = useRef(false);
  const [raw, setRaw] = useState<string>(() =>
    Number.isFinite(value) ? value.toFixed(decimals).replace(/\.?0+$/, "") : ""
  );

  useEffect(() => {
    if (isEditingRef.current) return;
    setRaw(Number.isFinite(value) ? value.toFixed(decimals).replace(/\.?0+$/, "") : "");
  }, [value, decimals]);

  function commit() {
    const n = parseNumber(raw);
    const next = clamp(n, min, max);
    onChange(next);
    isEditingRef.current = false;
    setRaw(Number.isFinite(next) ? next.toFixed(decimals).replace(/\.?0+$/, "") : "");
  }

  return (
    <div className="lootbugRow">
      {label}
      <div className="lootbugInputWrap">
        <input
          className="lootbugInput"
          type="text"
          inputMode="decimal"
          value={raw}
          onChange={(e) => {
            isEditingRef.current = true;
            setRaw(e.target.value);
          }}
          onBlur={() => commit()}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        {suffix ? <span className="lootbugSuffix">{suffix}</span> : null}
      </div>
    </div>
  );
}

function IntStepper(props: {
  label: React.ReactNode;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const { label, value, onChange, min = 0, max = 999, suffix } = props;
  const isEditingRef = useRef(false);
  const [raw, setRaw] = useState<string>(() => String(clampInt(value, min, max)));

  useEffect(() => {
    if (isEditingRef.current) return;
    setRaw(String(clampInt(value, min, max)));
  }, [value, min, max]);

  function commit() {
    const n = parseNumber(raw);
    const next = clampInt(n, min, max);
    onChange(next);
    isEditingRef.current = false;
    setRaw(String(next));
  }

  const clamped = clampInt(value, min, max);

  return (
    <div className="lootbugRow">
      {label}
      <div className="lootbugStepper">
        <button
          type="button"
          className="lootbugStepBtn"
          disabled={clamped <= min}
          onClick={() => onChange(clampInt(clamped - 1, min, max))}
        >
          −
        </button>
        <input
          className="lootbugInput lootbugStepperInput"
          type="text"
          inputMode="numeric"
          value={raw}
          onChange={(e) => {
            isEditingRef.current = true;
            setRaw(e.target.value);
          }}
          onBlur={() => commit()}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        {suffix ? <span className="lootbugSuffix">{suffix}</span> : null}
        <button
          type="button"
          className="lootbugStepBtn"
          disabled={clamped >= max}
          onClick={() => onChange(clampInt(clamped + 1, min, max))}
        >
          +
        </button>
      </div>
    </div>
  );
}

const STATS: Array<{
  id: keyof Omit<LootbugState, "gemCostReduction">;
  label: string;
  description: string;
  sources: string[];
  suffix?: string;
  decimals?: number;
}> = [
  {
    id: "spawnRateMultiplier",
    label: "Lootbug Spawn Rate (x)",
    description: "Increases the rate at which Lootbugs appear. Base: once every 20 in-game minutes.",
    sources: [
      "Base: once every 20 in-game minutes",
      "Drones: Fueled Bomb Bear Drone",
      "Items: Bread (Eros idol buff) × Lootbug Lantern",
      "Challenges: Extreme Challenge Upgrade",
      "Cards: Duck Card",
      "Pets: Duck Pet",
      "Stargazing: Sagittarius",
      "Upgrades: World 2 Upgrade",
    ],
    suffix: "×",
    decimals: 2,
  },
  {
    id: "lootMultiplier",
    label: "Lootbug Loot Multi (x)",
    description:
      "The multiplier on Lootbug rewards. Also extends buff duration for free and gem buffs. Non-integer results randomly round to adjacent integers.",
    sources: [
      "Skill-Tree: Anyone Up Lootin' They Bugs",
      "Store: Lootbug Bonanza Bundle",
      "Cards: Lootbug Misc Card",
      "Stargazing: Super Star Upgrade",
      "Fishing: Tier 2 Storm Serpent Tribute",
    ],
    suffix: "×",
    decimals: 2,
  },
  {
    id: "tripleChancePct",
    label: "Triple Lootbug Chance (%)",
    description: "The chance for 3 Lootbugs to appear when a spawn occurs.",
    sources: [
      "Cards: Whale Card",
      "Pets: Whale Pet",
      "Stargazing: Libra",
      "Skins: Skin Reward",
    ],
    suffix: "%",
    decimals: 2,
  },
  {
    id: "goldenChancePct",
    label: "Golden Lootbug Chance (%)",
    description: "The chance for the Lootbug purchasable loot to be free (Gem buff for free).",
    sources: [
      "Store: Golden Lootbug Bundle, Founder Perk (Tier 5)",
      "Stargazing: Aquarius",
    ],
    suffix: "%",
    decimals: 2,
  },
];

export function Lootbug() {
  const [state, setState] = useState<LootbugState>(() => {
    const saved = loadJson<Partial<LootbugState>>(STORAGE_KEY);
    const s = { ...DEFAULT, ...saved } as LootbugState;
    s.spawnRateMultiplier = clamp(s.spawnRateMultiplier, 0.1, 20);
    s.tripleChancePct = clamp(s.tripleChancePct, 0, 100);
    s.goldenChancePct = clamp(s.goldenChancePct, 0, 100);
    s.gemCostReduction = clampInt(s.gemCostReduction, 0, 999);
    s.lootMultiplier = clamp(s.lootMultiplier, 0.1, 5);
    const validNames = new Set(GEM_BUFFS.map((b) => b.name));
    s.activeGemBuffs = Array.isArray(s.activeGemBuffs)
      ? s.activeGemBuffs.filter((name) => validNames.has(name))
      : [...DEFAULT_ACTIVE_GEM_BUFFS];
    if (s.activeGemBuffs.length === 0) s.activeGemBuffs = [...DEFAULT_ACTIVE_GEM_BUFFS];
    return s;
  });

  useEffect(() => {
    saveJson(STORAGE_KEY, state);
  }, [state]);

  const update = (patch: Partial<LootbugState>) => setState((s) => ({ ...s, ...patch }));

  const gameSpeedParams = useMemo<GameParameters>(() => {
    const base = defaultGameParameters();
    const saved = loadJson<{ params?: Partial<GameParameters> }>(GEMEV_STORAGE_KEY);
    const merged: GameParameters = { ...base, ...(saved?.params ?? {}) };
    let mult = "game_speed_multiplier" in merged ? merged.game_speed_multiplier : 1.0;
    const gameSpeedPct = (merged as { game_speed_pct?: number }).game_speed_pct;
    if (mult === 1.0 && typeof gameSpeedPct === "number" && gameSpeedPct > 0)
      mult = 1.0 + clampInt(gameSpeedPct, 0, 12) / 100.0;
    merged.game_speed_multiplier = clamp(Number(mult), 1.0, 10.0);
    return merged;
  }, []);

  const gameSpeed = useMemo(() => getGameSpeedMultiplier(gameSpeedParams), [gameSpeedParams]);

  /** Bomb Bear Drone: when fueled in Drone module, multiplies Lootbug spawn rate. Only used for Drone's "Gem EV/h from Bomb Bear" delta; not applied to Lootbug gains (user enters spawn rate manually). */
  const bombBearLootbugSpawnRateMult = (() => {
    const ext = loadJson<{ bombBearLootbugSpawnRateMult?: number }>(GEMEV_EXTERNAL_KEY);
    const v = ext?.bombBearLootbugSpawnRateMult;
    return typeof v === "number" && v >= 1 ? v : 1;
  })();

  const spawnRateMult = clamp(state.spawnRateMultiplier, 0.1, 20);
  const effectiveSpawnRateMult = spawnRateMult;
  const triplePct = clamp(state.tripleChancePct, 0, 100) / 100;
  const effectiveSpawnMinGame = effectiveSpawnRateMult > 0 ? LOOTBUG_BASE_SPAWN_MIN / effectiveSpawnRateMult : 0;
  const effectiveSpawnMinReal =
    gameSpeed > 0 && effectiveSpawnMinGame > 0 ? effectiveSpawnMinGame / gameSpeed : 0;
  const spawnsPerHour = effectiveSpawnMinReal > 0 ? 60 / effectiveSpawnMinReal : 0;
  const expectedLootbugsPerSpawn = 1 + 2 * triplePct;
  const lootbugsPerHour = spawnsPerHour * expectedLootbugsPerSpawn;

  const totalFreeWeight = useMemo(
    () => FREE_BUFFS.reduce((s, b) => s + getWeight(b), 0),
    [],
  );
  const activeGemBuffs = Array.isArray(state.activeGemBuffs) ? state.activeGemBuffs : DEFAULT_ACTIVE_GEM_BUFFS;
  const buyGemBuffsSet = useMemo(() => new Set(activeGemBuffs), [activeGemBuffs]);
  const totalGemWeightAll = useMemo(
    () => GEM_BUFFS.reduce((s, b) => s + getWeight(b), 0),
    [],
  );

  const lootMultiplier = clamp(state.lootMultiplier, 0.1, 5);

  const gemsPerHour = useMemo(() => {
    const plus2Gems = FREE_BUFFS.find((b) => b.name === "+2 Gems");
    if (!plus2Gems || totalFreeWeight <= 0) return 0;
    const perHour = (lootbugsPerHour * getWeight(plus2Gems)) / totalFreeWeight;
    return perHour * 2 * lootMultiplier;
  }, [lootbugsPerHour, totalFreeWeight, lootMultiplier]);

  const gameSpeed2xMinPerHour = useMemo(() => {
    if (gameSpeed <= 0) return 0;
    const free2x = FREE_BUFFS.find((b) => b.name === "2x Game Speed");
    const gem2x = GEM_BUFFS.find((b) => b.name === "2x Game Speed");
    if (!free2x || !gem2x) return 0;
    const freePerHour =
      totalFreeWeight > 0 ? (lootbugsPerHour * getWeight(free2x)) / totalFreeWeight : 0;
    const gemPerHour =
      totalGemWeightAll > 0 ? (lootbugsPerHour * getWeight(gem2x)) / totalGemWeightAll : 0;
    const freeMin = getDurationMinutes(free2x.duration) ?? 0;
    const gemMin = getDurationMinutes(gem2x.duration) ?? 0;
    const freeMinPerHour = (freePerHour * freeMin * lootMultiplier) / gameSpeed;
    const gemMinPerHour = (gemPerHour * gemMin * lootMultiplier) / gameSpeed;
    return freeMinPerHour + gemMinPerHour;
  }, [lootbugsPerHour, totalFreeWeight, totalGemWeightAll, gameSpeed, lootMultiplier]);

  const bombRecharge10xMinPerHour = useMemo(() => {
    if (gameSpeed <= 0) return 0;
    const buff = GEM_BUFFS.find((b) => b.name === "10x Bomb Recharge");
    if (!buff || totalGemWeightAll <= 0) return 0;
    const perHour = (lootbugsPerHour * getWeight(buff)) / totalGemWeightAll;
    const durMin = getDurationMinutes(buff.duration) ?? 0;
    return (perHour * durMin * lootMultiplier) / gameSpeed;
  }, [lootbugsPerHour, totalGemWeightAll, gameSpeed, lootMultiplier]);

  /** Free buff "+1 Item Chest" per hour (× loot multiplier); written to external for Items / Chests module. */
  const lootbugItemChestsPerHour = useMemo(() => {
    const buff = FREE_BUFFS.find((b) => b.name === "+1 Item Chest");
    if (!buff || totalFreeWeight <= 0) return 0;
    const procsPerHour = (lootbugsPerHour * getWeight(buff)) / totalFreeWeight;
    return procsPerHour * lootMultiplier;
  }, [lootbugsPerHour, totalFreeWeight, lootMultiplier]);

  /** Gem EV/h from Lootbug "+1 Item Chest": value per chest from Items. When Chaos Totem 100% uptime, only Charge Magnet; else Charge Magnet + Chaos Totem. */
  const lootbugChestGemEvPerHour = useMemo(() => {
    const ext = loadJson<{ valueOfOneChestForLootbug?: number }>(GEMEV_EXTERNAL_KEY);
    const valuePerChest = typeof ext?.valueOfOneChestForLootbug === "number" ? ext.valueOfOneChestForLootbug : 0;
    return lootbugItemChestsPerHour * valuePerChest;
  }, [lootbugItemChestsPerHour]);

  const goldenPct = clamp(state.goldenChancePct, 0, 100) / 100;

  /** 2× Star Spawn Rate from Lootbug: free (2 min) + gem (10 min). Gem part: full if "2x Star Spawn Rate" is bought, else only golden occurrence. Written to external for Drone overlap incl. Lootbug. Loot multiplier extends buff duration. */
  const lootbug2xStarMinPerHour = useMemo(() => {
    if (gameSpeed <= 0) return 0;
    const freeBuff = FREE_BUFFS.find((b) => b.name === "2x Star Spawn Rate");
    const gemBuff = GEM_BUFFS.find((b) => b.name === "2x Star Spawn Rate");
    const freeMin = getDurationMinutes(freeBuff?.duration ?? null) ?? 0;
    const gemMin = getDurationMinutes(gemBuff?.duration ?? null) ?? 0;
    let freeMinPerHour = 0;
    if (freeBuff && totalFreeWeight > 0) {
      const perHour = (lootbugsPerHour * getWeight(freeBuff)) / totalFreeWeight;
      freeMinPerHour = (perHour * freeMin * lootMultiplier) / gameSpeed;
    }
    let gemMinPerHour = 0;
    if (gemBuff && totalGemWeightAll > 0) {
      const perHour = (lootbugsPerHour * getWeight(gemBuff)) / totalGemWeightAll;
      const effectiveRate = buyGemBuffsSet.has("2x Star Spawn Rate") ? 1 : goldenPct;
      gemMinPerHour = (perHour * effectiveRate * gemMin * lootMultiplier) / gameSpeed;
    }
    return freeMinPerHour + gemMinPerHour;
  }, [lootbugsPerHour, totalFreeWeight, totalGemWeightAll, gameSpeed, buyGemBuffsSet, goldenPct, lootMultiplier]);

  /** 2× Star from Lootbug: free buff portion only (2 min). */
  const lootbug2xStarFreeMinPerHour = useMemo(() => {
    if (gameSpeed <= 0) return 0;
    const freeBuff = FREE_BUFFS.find((b) => b.name === "2x Star Spawn Rate");
    const freeMin = getDurationMinutes(freeBuff?.duration ?? null) ?? 0;
    if (!freeBuff || totalFreeWeight <= 0) return 0;
    const perHour = (lootbugsPerHour * getWeight(freeBuff)) / totalFreeWeight;
    return (perHour * freeMin * lootMultiplier) / gameSpeed;
  }, [lootbugsPerHour, totalFreeWeight, gameSpeed, lootMultiplier]);

  /** 2× Star from Lootbug: gem buff portion only (10 min when bought, or golden). */
  const lootbug2xStarGemMinPerHour = useMemo(() => {
    if (gameSpeed <= 0) return 0;
    const gemBuff = GEM_BUFFS.find((b) => b.name === "2x Star Spawn Rate");
    const gemMin = getDurationMinutes(gemBuff?.duration ?? null) ?? 0;
    if (!gemBuff || totalGemWeightAll <= 0) return 0;
    const perHour = (lootbugsPerHour * getWeight(gemBuff)) / totalGemWeightAll;
    const effectiveRate = buyGemBuffsSet.has("2x Star Spawn Rate") ? 1 : goldenPct;
    return (perHour * effectiveRate * gemMin * lootMultiplier) / gameSpeed;
  }, [lootbugsPerHour, totalGemWeightAll, gameSpeed, buyGemBuffsSet, goldenPct, lootMultiplier]);

  /** Fishing +12 Ticks (gem buff): ticks per hour = procs × 12 × lootMultiplier. Loot Multi multiplies the tick count (e.g. 1.2× → 14 ticks per proc). Written to Fishing module. */
  const LOOTBUG_FISHING_TICKS_PER_PROC = 12;
  const lootbugFishing12TicksProcsPerHour = useMemo(() => {
    const buff = GEM_BUFFS.find((b) => b.name === "Fishing +12 Ticks");
    if (!buff || totalGemWeightAll <= 0) return 0;
    const perHour = (lootbugsPerHour * getWeight(buff)) / totalGemWeightAll;
    const effectiveRate = buyGemBuffsSet.has("Fishing +12 Ticks") ? 1 : goldenPct;
    const procsPerHour = perHour * effectiveRate;
    return procsPerHour * LOOTBUG_FISHING_TICKS_PER_PROC * lootMultiplier;
  }, [lootbugsPerHour, totalGemWeightAll, buyGemBuffsSet, goldenPct, lootMultiplier]);

  /** Archaeology +600 Attacks (gem buff): attacks per hour = procs × 600 × lootMultiplier. Loot Multi multiplies the attack count. Written to Arch module. */
  const LOOTBUG_ARCH_ATTACKS_PER_PROC = 600;
  const lootbugArch600AttacksPerHour = useMemo(() => {
    const buff = GEM_BUFFS.find((b) => b.name === "Archaeology +600 Attacks");
    if (!buff || totalGemWeightAll <= 0) return 0;
    const perHour = (lootbugsPerHour * getWeight(buff)) / totalGemWeightAll;
    const effectiveRate = buyGemBuffsSet.has("Archaeology +600 Attacks") ? 1 : goldenPct;
    const procsPerHour = perHour * effectiveRate;
    return procsPerHour * LOOTBUG_ARCH_ATTACKS_PER_PROC * lootMultiplier;
  }, [lootbugsPerHour, totalGemWeightAll, buyGemBuffsSet, goldenPct, lootMultiplier]);

  const totalGemCostPerHour = useMemo(() => {
    if (totalGemWeightAll <= 0) return 0;
    let sum = 0;
    for (const buff of GEM_BUFFS) {
      if (!buyGemBuffsSet.has(buff.name)) continue;
      const perHour = (lootbugsPerHour * getWeight(buff)) / totalGemWeightAll;
      const actualCost = Math.max(0, buff.cost - state.gemCostReduction);
      sum += perHour * actualCost * (1 - goldenPct);
    }
    return sum;
  }, [lootbugsPerHour, totalGemWeightAll, state.gemCostReduction, goldenPct, buyGemBuffsSet]);

  /** Lootbug's share of Gem EV/h from 10× Bomb Recharge (from Gem EV module). */
  const lootbug10xGemEvPerHour = (() => {
    const ext = loadJson<{ gemBomb10xImpact?: number; total10xMinPerHour?: number }>(GEMEV_EXTERNAL_KEY);
    const total10x = typeof ext?.total10xMinPerHour === "number" ? ext.total10xMinPerHour : 0;
    const impact = typeof ext?.gemBomb10xImpact === "number" ? ext.gemBomb10xImpact : 0;
    if (total10x <= 0) return 0;
    return impact * (bombRecharge10xMinPerHour / total10x);
  })();

  /** Hourly cost for 10× Bomb Recharge when Buy is checked (for net Gem EV display). */
  const costPerHour10xBombRecharge = useMemo(() => {
    if (!buyGemBuffsSet.has("10x Bomb Recharge") || totalGemWeightAll <= 0) return 0;
    const buff = GEM_BUFFS.find((b) => b.name === "10x Bomb Recharge");
    if (!buff) return 0;
    const perHour = (lootbugsPerHour * getWeight(buff)) / totalGemWeightAll;
    const actualCost = Math.max(0, buff.cost - state.gemCostReduction);
    return perHour * actualCost * (1 - goldenPct);
  }, [buyGemBuffsSet, totalGemWeightAll, lootbugsPerHour, state.gemCostReduction, goldenPct]);

  /** Gem EV/h minus hourly cost for 10× Bomb Recharge (value from Gem buffs table). */
  const net10xGemEvPerHour = lootbug10xGemEvPerHour - costPerHour10xBombRecharge;

  const netGemsPerHour = gemsPerHour - totalGemCostPerHour;

  /** Gem value of +10 Cherry Charges free buff per hour (for EV per claim). Only +2 Gems, +10 Cherry and 10× count toward overnight EV. Loot multiplier applies to charges. */
  const cherryChargesGemsPerHourFromLootbug = useMemo(() => {
    const buff = FREE_BUFFS.find((b) => b.name === "+10 Cherry Charges");
    if (!buff || totalFreeWeight <= 0 || lootbugsPerHour <= 0) return 0;
    const procsPerHour = lootbugsPerHour * (getWeight(buff) / totalFreeWeight);
    const chargesPerHourFromBuff = procsPerHour * 10 * lootMultiplier;
    return calculateCherryChargesGemsPerHour(gameSpeedParams, chargesPerHourFromBuff);
  }, [lootbugsPerHour, totalFreeWeight, lootMultiplier, gameSpeedParams]);

  /** Extra Gem EV/h from Bomb Bear: user enters spawn rate WITH Bomb Bear. Base = entered / mult; extra = gains(entered) − gains(base) = gains × (mult − 1) / mult. Uses net (gross gains − costs). */
  const bombBearLootbugGemsEvPerHour = useMemo(() => {
    if (bombBearLootbugSpawnRateMult <= 1) return 0;
    const grossGains = gemsPerHour + lootbug10xGemEvPerHour + lootbugChestGemEvPerHour;
    const netGains = grossGains - totalGemCostPerHour;
    return netGains * (bombBearLootbugSpawnRateMult - 1) / bombBearLootbugSpawnRateMult;
  }, [bombBearLootbugSpawnRateMult, gemsPerHour, lootbug10xGemEvPerHour, lootbugChestGemEvPerHour, totalGemCostPerHour]);

  /** EV per single lootbug claim (gem value): only +2 Gems, +10 Cherry Charges, and 10× Bomb Recharge (when that gem buff exists on a banked lootbug roll). Used by Overnight Gains. */
  const lootbugEvPerClaim = lootbugsPerHour > 0
    ? (gemsPerHour + cherryChargesGemsPerHourFromLootbug + net10xGemEvPerHour) / lootbugsPerHour
    : 0;

  /** EV per lootbug spawn event (1 banked = 1 spawn, can be triple = 3 claims). Used by Overnight for banked lootbugs. */
  const lootbugEvPerSpawn = lootbugEvPerClaim * expectedLootbugsPerSpawn;

  useEffect(() => {
    const ext = loadJson<{
      lootbugBomb10xMinPerHour?: number;
      droneBomb10xMinPerHour?: number;
      lootbugItemChestsPerHour?: number;
      bombBearLootbugGemsEvPerHour?: number;
      lootbugGemsPerHour?: number;
      lootbugNet10xGemEvPerHour?: number;
      lootbugNetGemsPerHour?: number;
      lootbug2xStarMinPerHour?: number;
      lootbugEvPerClaim?: number;
      lootbugEvPerSpawn?: number;
      lootbugGainsGross?: number;
      lootbug10xGemEvPerHour?: number;
      lootbugChestGemEvPerHour?: number;
      lootbugTotalGemCostPerHour?: number;
    }>(GEMEV_EXTERNAL_KEY) ?? {};
    ext.lootbugBomb10xMinPerHour = bombRecharge10xMinPerHour;
    ext.lootbugItemChestsPerHour = lootbugItemChestsPerHour;
    ext.bombBearLootbugGemsEvPerHour = bombBearLootbugGemsEvPerHour;
    ext.lootbugGemsPerHour = gemsPerHour;
    ext.lootbugNet10xGemEvPerHour = net10xGemEvPerHour;
    ext.lootbugNetGemsPerHour = netGemsPerHour;
    ext.lootbug2xStarMinPerHour = lootbug2xStarMinPerHour;
    ext.lootbugEvPerClaim = lootbugEvPerClaim;
    ext.lootbugEvPerSpawn = lootbugEvPerSpawn;
    ext.lootbugGainsGross = gemsPerHour + lootbug10xGemEvPerHour + lootbugChestGemEvPerHour;
    ext.lootbug10xGemEvPerHour = lootbug10xGemEvPerHour;
    ext.lootbugChestGemEvPerHour = lootbugChestGemEvPerHour;
    ext.lootbugTotalGemCostPerHour = totalGemCostPerHour;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [bombRecharge10xMinPerHour, lootbugItemChestsPerHour, bombBearLootbugGemsEvPerHour, gemsPerHour, net10xGemEvPerHour, netGemsPerHour, lootbug2xStarMinPerHour, lootbugEvPerClaim, lootbugEvPerSpawn, lootbug10xGemEvPerHour, lootbugChestGemEvPerHour, totalGemCostPerHour]);

  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(FISHING_EXTERNAL_KEY) ?? {};
    ext.lootbugFishing12TicksProcsPerHour = buyGemBuffsSet.has("Fishing +12 Ticks") ? lootbugFishing12TicksProcsPerHour : 0;
    saveJson(FISHING_EXTERNAL_KEY, ext);
  }, [lootbugFishing12TicksProcsPerHour, buyGemBuffsSet]);

  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(ARCH_EXTERNAL_KEY) ?? {};
    ext.lootbugArch600AttacksPerHour = lootbugArch600AttacksPerHour;
    saveJson(ARCH_EXTERNAL_KEY, ext);
  }, [lootbugArch600AttacksPerHour]);

  /** +% Fishing gains from Lootbug Fishing +12 Ticks gem buff. Requires Fishing module to have run (totalEffectiveTicksPerHour). */
  const lootbugFishingGainsPct = useMemo(() => {
    const ext = loadJson<{ totalEffectiveTicksPerHour?: number }>(FISHING_EXTERNAL_KEY);
    const totalTicks = typeof ext?.totalEffectiveTicksPerHour === "number" ? ext.totalEffectiveTicksPerHour : 0;
    const ticksWithoutLootbug = totalTicks - lootbugFishing12TicksProcsPerHour;
    if (lootbugFishing12TicksProcsPerHour <= 0 || ticksWithoutLootbug <= 0) return null;
    return (lootbugFishing12TicksProcsPerHour / ticksWithoutLootbug) * 100;
  }, [lootbugFishing12TicksProcsPerHour]);

  /** +% Star gains from Lootbug's 2× Star (gem buff portion only). Baseline = star mult without this part; uses Stargazing total when available. */
  const lootbug2xStarGemGainsPct = useMemo(() => {
    if (lootbug2xStarGemMinPerHour <= 0) return null;
    const sg = loadJson<{ total2xStarMinPerHour?: number }>("obeliskfarm:web:stargazing_external.json");
    const total2x = typeof sg?.total2xStarMinPerHour === "number" ? sg.total2xStarMinPerHour : 0;
    const other2x = Math.max(0, total2x - lootbug2xStarGemMinPerHour);
    const baselineMult = 1 + other2x / 60;
    const pct = (lootbug2xStarGemMinPerHour / 60 / baselineMult) * 100;
    return pct;
  }, [lootbug2xStarGemMinPerHour]);

  /** +% Star gains from Lootbug's 2× Star (free buff portion only). Baseline = star mult without this part; uses Stargazing total when available. */
  const lootbug2xStarFreeGainsPct = useMemo(() => {
    if (lootbug2xStarFreeMinPerHour <= 0) return null;
    const sg = loadJson<{ total2xStarMinPerHour?: number }>("obeliskfarm:web:stargazing_external.json");
    const total2x = typeof sg?.total2xStarMinPerHour === "number" ? sg.total2xStarMinPerHour : 0;
    const other2x = Math.max(0, total2x - lootbug2xStarFreeMinPerHour);
    const baselineMult = 1 + other2x / 60;
    const pct = (lootbug2xStarFreeMinPerHour / 60 / baselineMult) * 100;
    return pct;
  }, [lootbug2xStarFreeMinPerHour]);

  const GEM_ICON = "https://static.wikitide.net/shminerwiki/a/aa/Gem.png";
  const GAME_SPEED_ICON = "https://static.wikitide.net/shminerwiki/d/d4/Game_Speed_Multiplier.png";
  const BOMB_RECHARGE_ICON =
    "https://static.wikitide.net/shminerwiki/b/ba/Bomb_Recharge_Speed_10x_Buff.png";
  const CHEST_ICON = "https://static.wikitide.net/shminerwiki/a/a8/Item_Chest.png";

  return (
    <div className="container">
      <div className="lootbugGrid">
        <div className={`lootbugGameSpeedToggle lootbugGameSpeedTop ${gameSpeed > 1 ? "lootbugGameSpeedToggleOn" : ""}`}>
          <div className="lootbugGameSpeedReadOnly">
            <span className="lootbugLabel">
              Game speed
              <Tooltip
                content={{
                  title: "Game speed",
                  sections: [
                    {
                      heading: "Source",
                      lines: [
                        "Taken from Gem EV Calculator. Same value as Stats screen.",
                        "Lootbugs spawn every 20 game minutes; game speed affects real-time spawn rate.",
                      ],
                    },
                    { heading: "Edit", lines: ["Change it in the Gem EV Calculator module."] },
                  ],
                }}
              />
            </span>
            <span className="lootbugValue lootbugGameSpeedValue">{gameSpeed.toFixed(2)}×</span>
          </div>
        </div>

        <Collapsible id="lootbug-stats" title="Lootbug stats" defaultExpanded={false}>
          <div className="lootbugSection">
            <div className="lootbugSectionTitle">Your stats</div>
          {effectiveSpawnMinReal > 0 && (
            <div className="lootbugRow">
              <span className="lootbugLabel">
                Spawn time & occurence rate
                <Tooltip
                  content={{
                    title: "Spawn interval",
                    lines: [
                      "Time between spawns in real time. Game time ÷ game speed.",
                      "Lootbugs/h: spawns per hour × expected lootbugs per spawn (1 or 3 with Triple chance).",
                    ],
                  }}
                />
              </span>
              <span className="lootbugValue">
                {effectiveSpawnMinReal >= 1
                  ? effectiveSpawnMinReal.toFixed(1) + " min"
                  : (effectiveSpawnMinReal * 60).toFixed(1) + " s"}
                {" · "}
                {lootbugsPerHour.toFixed(1)} lootbugs/h
              </span>
            </div>
          )}
          {STATS.map((stat) =>
            (stat.id as string) === "goldenChancePct" ? (
              <IntStepper
                key={stat.id}
                label={
                  <span className="lootbugStatLabel">
                    <span className="lootbugLabel">
                      {stat.label}{" "}
                      <Tooltip
                        content={{
                          title: stat.label,
                          sections: [
                            {
                              heading: "Description",
                              lines: stat.description.split(/(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean),
                            },
                            { heading: "Sources", lines: stat.sources },
                          ],
                        }}
                      />
                    </span>
                  </span>
                }
                value={Math.round(state.goldenChancePct)}
                onChange={(n) => update({ goldenChancePct: clamp(n, 0, 100) })}
                min={0}
                max={100}
              />
            ) : (
              <NumInput
                key={stat.id}
                label={
                  <span className="lootbugStatLabel">
                    <span className="lootbugLabel">
                      {stat.label}{" "}
                      <Tooltip
                        content={{
                          title: stat.label,
                          sections: [
                            {
                              heading: "Description",
                              lines: stat.description.split(/(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean),
                            },
                            { heading: "Sources", lines: stat.sources },
                                ...(stat.id === "spawnRateMultiplier"
                              ? [
                                  {
                                    heading: "Enter value",
                                    lines: [
                                      "Enter your spawn rate as measured in-game. If you measure with Bomb Bear ON, use that value and keep Bomb Bear ON in the Drone module.",
                                    ],
                                  },
                                  {
                                    heading: "Bomb Bear flow",
                                    lines: [
                                      "Lootbug gains below use this value directly (your actual gains).",
                                      "Drone module computes extra from Bomb Bear: gains × (Bomb Bear mult − 1) ÷ mult. That shows how much gain comes from the Drone alone.",
                                    ],
                                  },
                                ]
                              : []),
                          ],
                        }}
                      />
                    </span>
                  </span>
                }
                value={state[stat.id] as number}
                onChange={(n) => update({ [stat.id]: n })}
                min={stat.id === "spawnRateMultiplier" || stat.id === "lootMultiplier" ? 0.1 : 0}
                max={
                  stat.id === "tripleChancePct" || stat.id === "goldenChancePct"
                    ? 100
                    : stat.id === "spawnRateMultiplier"
                      ? 20
                      : stat.id === "lootMultiplier"
                        ? 5
                        : 100
                }
                decimals={stat.decimals ?? 0}
                suffix={stat.suffix}
              />
            )
          )}
          <IntStepper
            label={
              <span className="lootbugStatLabel">
                <span className="lootbugLabel">
                  Lootbug Gem Cost Reduction{" "}
                  <Tooltip
                    content={{
                      title: "Lootbug Gem Cost Reduction",
                      sections: [
                        { heading: "Description", lines: ["The amount by which the gem cost of purchasable loot is reduced."] },
                        { heading: "Sources", lines: ["Skill-Tree: Saving For A Rainy Day", "Pets: Whale Pet Skin", "Skins: Skin Rewards"] },
                      ],
                    }}
                  />
                </span>
              </span>
            }
            value={state.gemCostReduction}
            onChange={(n) => update({ gemCostReduction: n })}
            min={0}
            max={999}
          />
        </div>
      </Collapsible>

      <Collapsible
        id="lootbug-gains"
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Lootbug gains
            <Tooltip
              content={{
                title: "Lootbug gains",
                sections: [
                  {
                    heading: "Source",
                    lines: [
                      "All values use your entered spawn rate. Gem buff gains shown gross; costs listed separately for clarity.",
                    ],
                  },
                  {
                    heading: "Bomb Bear",
                    lines: [
                      "If you measured spawn rate with Bomb Bear ON, these gains already include that. The Drone module shows the extra gain from Bomb Bear alone.",
                    ],
                  },
                ],
              }}
            />
          </span>
        }
        defaultExpanded={false}
      >
        <div className="lootbugSection">
          <div className="lootbugGainsBlock">
            <span className="lootbugSectionTitle">Free buffs</span>
            <div className="lootbugRow">
              <span className="lootbugStatLabel">
                <img src={GEM_ICON} alt="" className="lootbugStatIcon" aria-hidden />
                <span className="lootbugLabel">
                  Gems (raw) / h
                  <Tooltip
                    content={{
                      title: "Gems (raw) / h",
                      lines: [
                        "Raw gems from +2 Gems free buff per hour.",
                        "Per hour × 2 × Loot multiplier.",
                      ],
                    }}
                  />
                </span>
              </span>
              <span
                className={`lootbugValue ${gemsPerHour > 0 ? "lootbugNetGemEvPositive" : ""}`}
              >
                {gemsPerHour > 0 ? `+${gemsPerHour.toFixed(1)}` : "—"}
              </span>
            </div>
            <div className="lootbugRow">
              <span className="lootbugStatLabel">
                <img src={CHEST_ICON} alt="" className="lootbugStatIcon" aria-hidden />
                <span className="lootbugLabel">
                  Item Chests Gem EV/h
                  <Tooltip
                    content={{
                      title: "Item Chests Gem EV/h",
                      sections: [
                        {
                          heading: "Source",
                          lines: [
                            "Gem value per hour from the +1 Item Chest free buff. Uses value per chest from the Items module.",
                          ],
                        },
                        {
                          heading: "Chaos Totem 100% uptime",
                          lines: [
                            "When Bombs has Chaos Totem 100% checked, only Charge Magnet value counts (extra chests do not improve Chaos).",
                          ],
                        },
                        {
                          heading: "Otherwise",
                          lines: [
                            "Charge Magnet and Chaos Totem contribution from chest drops are both included.",
                          ],
                        },
                      ],
                    }}
                  />
                </span>
              </span>
              <span
                className={`lootbugValue ${lootbugChestGemEvPerHour > 0 ? "lootbugNetGemEvPositive" : ""}`}
              >
                {lootbugChestGemEvPerHour > 0 ? `+${lootbugChestGemEvPerHour.toFixed(1)}` : "—"}
              </span>
            </div>
            {lootbug2xStarFreeGainsPct != null ? (
              <div className="lootbugRow">
                <span className="lootbugStatLabel">
                  <img src={getGemBuffIcon("2x Star Spawn Rate")} alt="" className="lootbugStatIcon" aria-hidden />
                  <span className="lootbugLabel">
                    2× Star Spawn Rate: Star gains
                    <Tooltip
                      content={{
                        title: "Star gains from 2× Star Spawn Rate (free buff only)",
                        sections: [
                          {
                            heading: "Free buff portion",
                            lines: [
                              "Increase in star gains from Lootbug's 2× Star Spawn Rate free buff (2 min). Gem buff part is under Gem buffs.",
                              "Baseline = star mult without this free portion. Open Stargazing once to sync.",
                            ],
                          },
                        ],
                      }}
                    />
                  </span>
                </span>
                <span className={`lootbugValue ${lootbug2xStarFreeGainsPct > 0 ? "lootbugNetGemEvPositive" : ""}`}>
                  +{lootbug2xStarFreeGainsPct.toFixed(1)}%
                </span>
              </div>
            ) : null}
          </div>
          <div className="lootbugGainsBlock">
            <span className="lootbugSectionTitle">Gem buffs</span>
            {lootbug2xStarGemGainsPct != null ? (
              <div className="lootbugRow">
                <span className="lootbugStatLabel">
                  <img src={getGemBuffIcon("2x Star Spawn Rate")} alt="" className="lootbugStatIcon" aria-hidden />
                  <span className="lootbugLabel">
                    2× Star Spawn Rate: Star gains
                    <Tooltip
                      content={{
                        title: "Star gains from 2× Star Spawn Rate (gem buff only)",
                        sections: [
                          {
                            heading: "Gem buff portion",
                            lines: [
                              "Increase in star gains from Lootbug's 2× Star Spawn Rate gem buff (10 min when bought, or Golden Lootbug). Free buff part is under Free buffs.",
                              "Baseline = star mult without this gem portion. Open Stargazing once to sync.",
                            ],
                          },
                        ],
                      }}
                    />
                  </span>
                </span>
                <span className={`lootbugValue ${lootbug2xStarGemGainsPct > 0 ? "lootbugNetGemEvPositive" : ""}`}>
                  +{lootbug2xStarGemGainsPct.toFixed(1)}%
                </span>
              </div>
            ) : null}
            {buyGemBuffsSet.has("2x Game Speed") && (
              <div className="lootbugRow">
                <span className="lootbugStatLabel">
                  <img src={GAME_SPEED_ICON} alt="" className="lootbugStatIcon" aria-hidden />
                  <span className="lootbugLabel">
                    2× Game Speed / h
                    <Tooltip
                      content={{
                        title: "2× Game Speed / h",
                        lines: [
                          "Total min/h with 2× Game Speed active (free + gem buff).",
                          "Free buff (2 min) + Gem buff (10 min) added together.",
                        ],
                      }}
                    />
                  </span>
                </span>
                <span className="lootbugValue">{formatMinSecWithUnit(gameSpeed2xMinPerHour)}</span>
              </div>
            )}
            {lootbugFishingGainsPct != null ? (
                <div className="lootbugRow">
                  <span className="lootbugStatLabel">
                    <img src={getGemBuffIcon("Fishing +12 Ticks")} alt="" className="lootbugStatIcon" aria-hidden />
                    <span className="lootbugLabel">
                      Fishing +{Math.round(12 * lootMultiplier)} Ticks: Fishing gains
                      <Tooltip
                        content={{
                          title: "Fishing gains from Lootbug gem buff",
                          sections: [
                            {
                              heading: "What the +% means",
                              lines: [
                                "Increase in fishing gains when you add this Lootbug buff on top of your current setup.",
                                "Baseline = gains without this buff (base ticks + Angler + Gift Sushi). So the +% is relative to all other buffs included, not base only.",
                              ],
                            },
                            {
                              heading: "Sync",
                              lines: ["Uses total effective ticks from Fishing. Open Fishing once to sync."],
                            },
                          ],
                        }}
                      />
                    </span>
                  </span>
                  <span className={`lootbugValue ${lootbugFishingGainsPct > 0 ? "lootbugNetGemEvPositive" : ""}`}>
                    +{lootbugFishingGainsPct.toFixed(1)}%
                  </span>
                </div>
              ) : null}
            {buyGemBuffsSet.has("10x Bomb Recharge") && (
              <div className="lootbugRow">
                <span className="lootbugStatLabel">
                  <img src={BOMB_RECHARGE_ICON} alt="" className="lootbugStatIcon" aria-hidden />
                  <span className="lootbugLabel">
                    10× Bomb Recharge Gem EV/h
                    <Tooltip
                      content={{
                        title: "10× Bomb Recharge Gem EV/h",
                        lines: [
                          "Share of Gem EV per hour from the 10× Bomb Recharge buff (from Lootbug). Gross value before cost.",
                          "Cost is shown in Costs for Lootbug Gem buffs below.",
                        ],
                      }}
                    />
                  </span>
                </span>
                <span
                  className={`lootbugValue ${lootbug10xGemEvPerHour > 0 ? "lootbugNetGemEvPositive" : ""}`}
                >
                  {lootbug10xGemEvPerHour > 0 ? `+${lootbug10xGemEvPerHour.toFixed(1)}` : "—"}
                </span>
              </div>
            )}
            {buyGemBuffsSet.size > 0 && (
              <div className="lootbugRow">
                <span className="lootbugStatLabel">
                  <img src={GEM_ICON} alt="" className="lootbugStatIcon" aria-hidden />
                  <span className="lootbugLabel">
                    Costs for Lootbug Gem buffs
                    <Tooltip
                      content={{
                        title: "Costs for Lootbug Gem buffs",
                        lines: [
                          "Hourly gem cost when you Buy the checked gem buffs (10× Bomb Recharge, 2× Game Speed, Fishing +12 Ticks, etc.).",
                          "Per hour × actual cost × (1 − Golden Lootbug %). Golden = free.",
                        ],
                      }}
                    />
                  </span>
                </span>
                <span
                  className={`lootbugValue lootbugCostsValue ${totalGemCostPerHour > 0 ? "lootbugCostsValueNegative" : ""}`}
                  aria-label={totalGemCostPerHour > 0 ? `−${totalGemCostPerHour.toFixed(1)} gems per hour cost` : "0"}
                >
                  {totalGemCostPerHour > 0 ? `−${totalGemCostPerHour.toFixed(1)}` : "0"}
                </span>
              </div>
            )}
            {!buyGemBuffsSet.has("2x Game Speed") && !buyGemBuffsSet.has("10x Bomb Recharge") && (
              <p className="lootbugHint" style={{ marginTop: 4, marginBottom: 0 }}>
                Enable and buy gem buffs above to see gains here.
              </p>
            )}
          </div>
        </div>
      </Collapsible>

      <Collapsible id="lootbug-free-buffs" title="Free buffs" defaultExpanded={false}>
        <div className="lootbugSection lootbugBuffsSection">
          <table className="lootbugTable">
              <thead>
                <tr>
                  <th>Buff</th>
                  <th className="lootbugTableThRight">
                    Per hour
                    <Tooltip
                      content={{
                        title: "Per hour",
                        lines: [
                          "Average occurrences of this buff per hour.",
                          "Includes weightings: lootbugs/h × (weight ÷ total weight).",
                        ],
                      }}
                    />
                  </th>
                  <th className="lootbugTableThRight">
                    min/h (min:sec)
                    <Tooltip
                      content={{
                        title: "min/h",
                        sections: [
                          {
                            heading: "Real time",
                            lines: [
                              "Average minutes per hour this buff is active (real time). Format: MM:SS min.",
                              "Formula: per hour × duration (game min) × loot multiplier ÷ game speed. Loot multiplier extends buff duration.",
                            ],
                          },
                        ],
                      }}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {FREE_BUFFS.map((buff) => {
                  const weight = getWeight(buff);
                  const perHourProcs = totalFreeWeight > 0 ? (lootbugsPerHour * weight) / totalFreeWeight : 0;
                  /** Effective quantity per hour (with loot multi). */
                  const perHour =
                    buff.name === "+2 Gems"
                      ? perHourProcs * 2 * lootMultiplier
                      : buff.name === "+1 Item Chest"
                        ? perHourProcs * lootMultiplier
                        : buff.name === "+1 Relic Chest"
                          ? perHourProcs * lootMultiplier
                          : buff.name === "+10 Cherry Charges"
                            ? perHourProcs * 10 * lootMultiplier
                            : perHourProcs;
                  const durMin = getDurationMinutes(buff.duration);
                  const effectiveDurMin = durMin != null ? durMin * lootMultiplier : null;
                  const minPerHour =
                    effectiveDurMin != null && gameSpeed > 0 ? (perHourProcs * effectiveDurMin) / gameSpeed : null;
                  const realDurMin = effectiveDurMin != null && gameSpeed > 0 ? effectiveDurMin / gameSpeed : null;
                  const cherryValue =
                    buff.name === "+10 Cherry Charges"
                      ? calculateCherryChargesGemsPerHour(gameSpeedParams, perHour)
                      : getCherryChargesValueGemEv(gameSpeedParams, buff.name);
                  return (
                    <tr key={buff.name}>
                      <td>
                        <span className="lootbugBuffCell">
                          <img src={getFreeBuffIcon(buff.name)} alt="" className="lootbugBuffIcon" aria-hidden />
                          <span>
                            {buff.name}
                            {cherryValue != null ? (
                              <span className="lootbugCherryValue">
                                {" "}
                                <Tooltip
                                  content={{
                                    title: "Cherry charges value",
                                    sections: [
                                      {
                                        heading: "Source",
                                        lines: [
                                          "Value from Gem EV bomb cycle. Late: cherry counts as gem bomb detonations. Early: cherry counts as battery detonations (refills).",
                                        ],
                                      },
                                      {
                                        heading: "Gem EV",
                                        lines: [
                                          `≈${cherryValue.toFixed(1)} gem/h for this many cherry charges. Uses bomb cycle from Gem EV.`,
                                        ],
                                      },
                                    ],
                                  }}
                                />
                                <span className="lootbugCherryValueText">
                                  ≈{cherryValue.toFixed(1)} gem/h
                                </span>
                              </span>
                            ) : null}
                          </span>
                          {buff.duration ? (
                            <span className="lootbugBuffDuration">
                              {realDurMin != null
                                ? (() => {
                                    const m = Math.floor(realDurMin);
                                    const s = Math.round((realDurMin * 60) % 60);
                                    return ` (${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} min)`;
                                  })()
                                : ` (${buff.duration})`}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="lootbugTableNum">
                        {isEventBuff(buff.name) ? `${Math.round(perHour)} events` : perHour.toFixed(2)}
                      </td>
                      <td className="lootbugTableNum">
                        {minPerHour != null ? formatMinSecWithUnit(minPerHour) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      </Collapsible>

      <Collapsible id="lootbug-gem-buffs" title="Gem buffs" defaultExpanded={false}>
        <div className="lootbugSection lootbugBuffsSection">
          <p className="lootbugHint" style={{ marginBottom: 10 }}>
            Per hour and min/h use the full pool (all buffs can appear). Toggle Buy for buffs you pay for; only those count toward Gem/h.
          </p>
          <table className="lootbugTable">
              <thead>
                <tr>
                  <th className="lootbugTableThActive">
                    Buy
                    <Tooltip
                      content={{
                        title: "Buy",
                        lines: [
                          "When checked, you pay for this buff when it appears (Gem/h).",
                          "Per hour and min/h are always from the full pool.",
                        ],
                      }}
                    />
                  </th>
                  <th>Buff</th>
                  <th className="lootbugTableThRight">
                    Per hour
                    <Tooltip
                      content={{
                        title: "Per hour",
                        sections: [
                          {
                            heading: "Events",
                            lines: [
                              "Fishing ticks, Arch attacks, Item Chests, Cherry Charges: events/h (quantity × loot multi). Unit: events.",
                            ],
                          },
                          {
                            heading: "Other buffs",
                            lines: [
                              "Occurrences per hour (full pool). Formula: lootbugs/h × (weight ÷ total weight of all gem buffs).",
                            ],
                          },
                        ],
                      }}
                    />
                  </th>
                  <th className="lootbugTableThRight">
                    min/h (min:sec)
                    <Tooltip
                      content={{
                        title: "min/h",
                        sections: [
                          {
                            heading: "Real time",
                            lines: [
                              "Average minutes per hour this buff is active (real time). Format: MM:SS min. From full pool.",
                              "Formula: per hour × duration (game min) × loot multiplier ÷ game speed. Loot multiplier extends buff duration.",
                            ],
                          },
                        ],
                      }}
                    />
                  </th>
                  <th className="lootbugTableThRight">
                    Gem/h
                    <Tooltip
                      content={{
                        title: "Gem/h",
                        sections: [
                          {
                            heading: "Cost",
                            lines: [
                              "Gems spent per hour for this buff when you Buy it.",
                              "Per hour × actual cost × (1 − Golden Lootbug %). Golden = free.",
                            ],
                          },
                        ],
                      }}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {GEM_BUFFS.map((buff) => {
                  const isBuy = buyGemBuffsSet.has(buff.name);
                  const weight = getWeight(buff);
                  const perHourProcs =
                    totalGemWeightAll > 0 ? (lootbugsPerHour * weight) / totalGemWeightAll : 0;
                  /** Effective quantity per hour (with loot multi). For Fishing/Arch uses buy or golden rate. */
                  const perHour =
                    buff.name === "Fishing +12 Ticks"
                      ? lootbugFishing12TicksProcsPerHour
                      : buff.name === "Archaeology +600 Attacks"
                        ? lootbugArch600AttacksPerHour
                        : buff.name === "+3 Item Chests"
                          ? perHourProcs * 3 * lootMultiplier
                          : buff.name === "+1 Relic Chest"
                            ? perHourProcs * lootMultiplier
                            : buff.name === "+100 Cherry Charges"
                              ? perHourProcs * 100 * lootMultiplier
                              : perHourProcs;
                  const durMin = getDurationMinutes(buff.duration);
                  const effectiveDurMin = durMin != null ? durMin * lootMultiplier : null;
                  const minPerHour =
                    effectiveDurMin != null && gameSpeed > 0 ? (perHourProcs * effectiveDurMin) / gameSpeed : null;
                  const realDurMin = effectiveDurMin != null && gameSpeed > 0 ? effectiveDurMin / gameSpeed : null;
                  const actualCost = isBuy ? Math.max(0, buff.cost - state.gemCostReduction) : 0;
                  const gemCostWithGolden =
                    isBuy && actualCost > 0 ? perHourProcs * actualCost * (1 - goldenPct) : 0;
                  const gemPerHourDisplay =
                    isBuy && gemCostWithGolden > 0 ? -gemCostWithGolden : null;
                  const cherryValue =
                    buff.name === "+100 Cherry Charges"
                      ? calculateCherryChargesGemsPerHour(gameSpeedParams, perHour)
                      : getCherryChargesValueGemEv(gameSpeedParams, buff.name);
                  function toggleBuy() {
                    setState((s) => {
                      const list = Array.isArray(s.activeGemBuffs) ? s.activeGemBuffs : DEFAULT_ACTIVE_GEM_BUFFS;
                      const next = list.includes(buff.name)
                        ? list.filter((n) => n !== buff.name)
                        : [...list, buff.name];
                      return { ...s, activeGemBuffs: next };
                    });
                  }
                  return (
                    <tr key={buff.name} className={!isBuy ? "lootbugRowInactive" : undefined}>
                      <td className="lootbugTableThActive">
                        <input
                          type="checkbox"
                          checked={isBuy}
                          onChange={toggleBuy}
                          aria-label={`${buff.name} buy`}
                          className="lootbugCheckbox"
                        />
                      </td>
                      <td>
                        <span className="lootbugBuffCell">
                          <img src={getGemBuffIcon(buff.name)} alt="" className="lootbugBuffIcon" aria-hidden />
                          <span>
                            {buff.name === "Fishing +12 Ticks"
                              ? `Fishing +${Math.round(12 * lootMultiplier)} Ticks`
                              : buff.name === "Archaeology +600 Attacks"
                                ? `Archaeology +${Math.round(600 * lootMultiplier)} Attacks`
                                : buff.name}
                            {cherryValue != null ? (
                              <span className="lootbugCherryValue">
                                {" "}
                                <Tooltip
                                  content={{
                                    title: "Cherry charges value",
                                    sections: [
                                      {
                                        heading: "Source",
                                        lines: [
                                          "Value from Gem EV bomb cycle. Late: cherry counts as gem bomb detonations. Early: cherry counts as battery detonations (refills).",
                                        ],
                                      },
                                      {
                                        heading: "Gem EV",
                                        lines: [
                                          `≈${cherryValue.toFixed(1)} gem/h for this many cherry charges. Uses bomb cycle from Gem EV.`,
                                        ],
                                      },
                                    ],
                                  }}
                                />
                                <span className="lootbugCherryValueText">
                                  ≈{cherryValue.toFixed(1)} gem/h
                                </span>
                              </span>
                            ) : null}
                          </span>
                          {buff.duration ? (
                            <span className="lootbugBuffDuration">
                              {realDurMin != null
                                ? (() => {
                                    const m = Math.floor(realDurMin);
                                    const s = Math.round((realDurMin * 60) % 60);
                                    return ` (${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} min)`;
                                  })()
                                : ` (${buff.duration})`}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="lootbugTableNum">
                        {isEventBuff(buff.name) ? `${Math.round(perHour)} events` : perHour.toFixed(2)}
                      </td>
                      <td className="lootbugTableNum">
                        {minPerHour != null ? formatMinSecWithUnit(minPerHour) : "—"}
                      </td>
                      <td
                        className="lootbugTableNum lootbugGemPerHour"
                        style={
                          gemPerHourDisplay != null && gemPerHourDisplay < 0
                            ? { color: heatmapRed(gemPerHourDisplay) }
                            : undefined
                        }
                      >
                        {!isBuy
                          ? "—"
                          : actualCost === 0 || gemCostWithGolden === 0
                            ? "FREE"
                            : gemPerHourDisplay != null
                              ? gemPerHourDisplay.toFixed(1)
                              : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      </Collapsible>
      </div>
    </div>
  );
}
