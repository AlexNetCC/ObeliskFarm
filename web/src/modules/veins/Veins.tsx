import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./veins.css";
import { Tooltip } from "../../components/Tooltip";
import { Collapsible } from "../../components/Collapsible";
import { loadJson, saveJson } from "../../lib/storage";

const STORAGE_KEY = "obeliskfarm:web:veins_save.json:v2";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";

const WIKI_IMG = "https://shminer.miraheze.org/wiki/Special:FilePath";

/** Vein types from wiki: Floors, Spawn rarity, and gallery icon. https://shminer.miraheze.org/wiki/Veins#Veins */
const VEIN_TYPES: Array<{ id: string; name: string; floorMin: number; floorMax: number; rarity: number; iconFile: string }> = [
  { id: "stone", name: "Stone Vein", floorMin: 1, floorMax: 8, rarity: 15, iconFile: "Stone_Vein_Full.png" },
  { id: "magma", name: "Magma Vein", floorMin: 9, floorMax: 18, rarity: 20, iconFile: "Magma_Vein_Full.png" },
  { id: "virtual", name: "Virtual Vein", floorMin: 19, floorMax: 24, rarity: 25, iconFile: "Virtual_Vein_Full.png" },
  { id: "space", name: "Space Vein", floorMin: 25, floorMax: 30, rarity: 30, iconFile: "Space_Vein_Full.png" },
  { id: "cloud", name: "Cloud Vein", floorMin: 31, floorMax: 36, rarity: 35, iconFile: "Cloud_Vein_Full.png" },
  { id: "atomic", name: "Atomic Vein", floorMin: 37, floorMax: 42, rarity: 40, iconFile: "Atomic_Vein_Full.png" },
  { id: "deepsea", name: "Deep Sea Vein", floorMin: 43, floorMax: 48, rarity: 50, iconFile: "Deepsea_Vein_Full.png" },
  { id: "beach", name: "Beach Vein", floorMin: 49, floorMax: 54, rarity: 50, iconFile: "Beach_Vein_Full.png" },
  { id: "valley", name: "Valley Vein", floorMin: 55, floorMax: 60, rarity: 50, iconFile: "Valley_Vein_Full.png" },
  { id: "jungle", name: "Jungle Vein", floorMin: 61, floorMax: 66, rarity: 50, iconFile: "Jungle_Vein_Full.png" },
  { id: "volcano", name: "Volcano Vein", floorMin: 67, floorMax: 72, rarity: 50, iconFile: "Volcano_Vein_Full.png" },
  { id: "jurassic", name: "Jurassic Vein", floorMin: 73, floorMax: 78, rarity: 70, iconFile: "Jurassic_Vein_Full.png" },
  { id: "roman", name: "Roman Vein", floorMin: 79, floorMax: 84, rarity: 70, iconFile: "Roman_Vein_Full.png" },
  { id: "industrial", name: "Industrial Vein", floorMin: 85, floorMax: 90, rarity: 70, iconFile: "Industrial_Vein_Full.png" },
  { id: "warfront", name: "Warfront Vein", floorMin: 91, floorMax: 96, rarity: 70, iconFile: "Warfront_Vein_Full.png" },
  { id: "neon", name: "Neon Vein", floorMin: 97, floorMax: 102, rarity: 70, iconFile: "Neon_Vein_Full.png" },
  { id: "wonderland", name: "Wonderland Vein", floorMin: 103, floorMax: 108, rarity: 100, iconFile: "Wonderland_Vein_Full.png" },
  { id: "pirate", name: "Pirate Vein", floorMin: 109, floorMax: 114, rarity: 100, iconFile: "Pirate_Vein_Full.png" },
  { id: "arabian", name: "Arabian Vein", floorMin: 115, floorMax: 120, rarity: 100, iconFile: "Arabian_Vein_Full.png" },
];

/** Floors to never suggest (bomb recharge rate debuff). */
const FLOORS_BOMB_RECHARGE_DEBUFF = [67, 68, 79, 80, 81, 82];

/** Floors with −25% game speed; effective output is 0.75×. */
const FLOORS_GAME_SPEED_25_PCT = [71, 72, 89, 90, 91, 92, 97, 98];

function gameSpeedMult(floor: number): number {
  return FLOORS_GAME_SPEED_25_PCT.includes(floor) ? 0.75 : 1;
}

function veinIconUrl(iconFile: string): string {
  return `${WIKI_IMG}/${encodeURIComponent(iconFile)}`;
}

/** Short-scale suffixes for large numbers (e.g. 1.1m, 2.3b, 5.2t). Used when |value| >= 1e3. */
const COMPACT_SUFFIXES: Array<{ div: number; suffix: string }> = [
  { div: 1e27, suffix: "oc" },
  { div: 1e24, suffix: "sp" },
  { div: 1e21, suffix: "sx" },
  { div: 1e18, suffix: "qi" },
  { div: 1e15, suffix: "q" },
  { div: 1e12, suffix: "t" },
  { div: 1e9, suffix: "b" },
  { div: 1e6, suffix: "m" },
  { div: 1e3, suffix: "k" },
];

function formatCompact(value: number, decimals: number = 1): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  for (const { div, suffix } of COMPACT_SUFFIXES) {
    if (abs >= div) {
      const scaled = abs / div;
      const formatted = scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(decimals);
      return `${sign}${formatted.replace(/\.?0+$/, "")}${suffix}`;
    }
  }
  return sign + (abs >= 1 ? abs.toFixed(decimals).replace(/\.?0+$/, "") : abs.toFixed(2));
}

/** Like formatCompact but always exactly 1 decimal (e.g. 136.0b, never 136b). */
function formatCompact1Dec(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0.0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  for (const { div, suffix } of COMPACT_SUFFIXES) {
    if (abs >= div) {
      const scaled = abs / div;
      const formatted = scaled.toFixed(1);
      return `${sign}${formatted}${suffix}`;
    }
  }
  return sign + abs.toFixed(1);
}

/** Poisson(lambda): sum over simulated period is Poisson(hours * vph) per type per run. */
function poisson(lambda: number): number {
  if (!Number.isFinite(lambda) || lambda <= 0) return 0;
  if (lambda > 1e6) return Math.round(lambda + Math.sqrt(lambda) * (Math.random() * 2 - 1) * 2);
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (i - lo) * (sorted[hi] - sorted[lo]);
}

/** Box plot stats from sorted sample (min, Q1, med, Q3, max). */
function boxPlotStats(sorted: number[]): { min: number; q1: number; med: number; q3: number; max: number } {
  const n = sorted.length;
  if (n === 0) return { min: 0, q1: 0, med: 0, q3: 0, max: 0 };
  const min = sorted[0] ?? 0;
  const max = sorted[n - 1] ?? 0;
  const q1 = sorted[Math.floor(0.25 * n)] ?? 0;
  const med = sorted[Math.floor(0.5 * n)] ?? 0;
  const q3 = sorted[Math.floor(0.75 * n)] ?? 0;
  return { min, q1, med, q3, max };
}

/** Build histogram with numBins bins over [min, max]. Returns counts per bin. */
function histogram(sorted: number[], numBins: number): { bins: number[]; min: number; max: number } {
  if (sorted.length === 0) return { bins: [], min: 0, max: 0 };
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const span = max - min || 1;
  const bins = new Array<number>(numBins).fill(0);
  for (const v of sorted) {
    const i = Math.min(numBins - 1, Math.floor(((v - min) / span) * numBins));
    bins[i]++;
  }
  return { bins, min, max };
}

/** Card gain multipliers: Standard 1.5×, Gilded 2×, Polychrome user-defined (same for all). */
const CARD_MULT_STANDARD = 1.5;
const CARD_MULT_GILDED = 2;

/** Base multipliers for vein types (game defaults). */
const GOLDEN_VEIN_BASE_MULT = 5;
const RAINBOW_VEIN_BASE_MULT = 20;
const GLEAMING_VEIN_BASE_MULT = 5;

/** 0 = none, 1 = Standard, 2 = Gilded, 3 = Polychrome */
export type VeinCardTier = 0 | 1 | 2 | 3;

/** Clickable tier toggles: Card / Gilded / Poly. Same pattern as Stargazing star cards; no "None" button – click active to clear. */
function VeinCardTierToggles(props: { value: VeinCardTier; onChange: (tier: VeinCardTier) => void }) {
  const { value, onChange } = props;
  const cur = value;
  const mk = (tier: 1 | 2 | 3, label: string) => (
    <button
      type="button"
      className={`btn btnSecondary veinsCardTierBtn ${cur === tier ? "cardBtnActive" : ""}`}
      onClick={() => onChange(cur === tier ? 0 : tier)}
      aria-pressed={cur === tier}
    >
      {label} {cur === tier ? "✓" : ""}
    </button>
  );
  return (
    <div className="veinsCardTierRow">
      {mk(1, "Card")}
      {mk(2, "Gilded")}
      {mk(3, "Poly")}
    </div>
  );
}

type VeinsState = {
  floor: number;
  /** Ore nodes on the floor (used in wiki spawn formula denominator). */
  oresPerFloor: number;
  /** Floor clears per minute (like Stargazing). veins/h = veins per floor × this × 60. */
  floorClearsPerMin: number;
  /** Offline farming: −15% gain. */
  afk: boolean;
  /** Global Polychrome multiplier (×) applied to all veins set to Polychrome. */
  polychromeMult: number;
  /** Per-vein: 2× Research (doubles spawn rate in formula). */
  veinResearch2x: Record<string, boolean>;
  /** Per-vein: Card tier (None / Standard / Gilded / Polychrome). */
  veinCardTier: Record<string, VeinCardTier>;
  veinSpawnRateMult: number;
  veinIncomeMult: number;
  goldenChancePct: number;
  goldenMult: number;
  rainbowChancePct: number;
  rainbowMult: number;
  gleamingChancePct: number;
  gleamingMult: number;
  /** Veinmorpher Bomb: two independent rolls per floor — morph all ores→veins, and make all veins golden. */
  veinmorpherMorphChancePct: number;
  veinmorpherGoldenChancePct: number;
  /** Void Drone active: when off, only the current floor's vein type is farmed (no portals from lower floors). */
  voidDroneOn: boolean;
  voidPortalChancePct: number;
  voidPortalMult: number;
  voidSuitMult: number;
  goldenPortalChancePct: number;
  goldenPortalMult: number;
  rainbowPortalChancePct: number;
  rainbowPortalMult: number;
  /** Vein to maximize in the best-floors suggestion (Void assumed ON). */
  maximizeVeinId: string;
};

const DEFAULT: VeinsState = {
  floor: 102,
  oresPerFloor: 10,
  floorClearsPerMin: 1,
  afk: false,
  polychromeMult: 5,
  veinResearch2x: {},
  veinCardTier: {},
  voidDroneOn: true,
  veinSpawnRateMult: 1,
  veinIncomeMult: 1,
  goldenChancePct: 0,
  goldenMult: GOLDEN_VEIN_BASE_MULT,
  rainbowChancePct: 0,
  rainbowMult: RAINBOW_VEIN_BASE_MULT,
  gleamingChancePct: 0,
  gleamingMult: GLEAMING_VEIN_BASE_MULT,
  veinmorpherMorphChancePct: 0,
  veinmorpherGoldenChancePct: 0,
  voidPortalChancePct: 10,
  voidPortalMult: 3,
  voidSuitMult: 30,
  goldenPortalChancePct: 0,
  goldenPortalMult: 1,
  rainbowPortalChancePct: 0,
  rainbowPortalMult: 1,
  maximizeVeinId: "volcano",
};

function getVeinForFloor(floor: number): (typeof VEIN_TYPES)[number] | null {
  return VEIN_TYPES.find((v) => v.floorMin <= floor && floor <= v.floorMax) ?? null;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
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

function NumInput(props: {
  label: React.ReactNode;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  decimals?: number;
  suffix?: string;
  tooltip?: { title: string; lines: string[] };
}) {
  const { label, value, onChange, min = 0, max = 1e6, decimals = 2, suffix, tooltip } = props;
  const isEditingRef = useRef(false);
  const [raw, setRaw] = useState<string>(() =>
    Number.isFinite(value) ? value.toFixed(decimals).replace(/\.?0+$/, "") : ""
  );

  useEffect(() => {
    if (!isEditingRef.current)
      setRaw(Number.isFinite(value) ? value.toFixed(decimals).replace(/\.?0+$/, "") : "");
  }, [value, decimals]);

  function commit() {
    const n = parseNumber(raw);
    const next = clamp(n, min ?? 0, max ?? 1e6);
    onChange(next);
    isEditingRef.current = false;
    setRaw(Number.isFinite(next) ? next.toFixed(decimals).replace(/\.?0+$/, "") : "");
  }

  return (
    <div className="veinsRow">
      <div className="veinsLabelWrap">
        {label}
        {tooltip ? (
          <Tooltip content={{ title: tooltip.title, lines: tooltip.lines }} label="?" />
        ) : null}
      </div>
      <div className="veinsInputWrap">
        <input
          className="veinsInput mono"
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
        {suffix ? <span className="veinsSuffix">{suffix}</span> : null}
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
  tooltip?: { title: string; lines: string[] };
}) {
  const { label, value, onChange, min = 0, max = 999, suffix, tooltip } = props;
  const isEditingRef = useRef(false);
  const [raw, setRaw] = useState<string>(() => String(clampInt(value, min, max)));

  useEffect(() => {
    if (!isEditingRef.current) setRaw(String(clampInt(value, min, max)));
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
    <div className="veinsRow">
      <div className="veinsLabelWrap">
        {label}
        {tooltip ? (
          <Tooltip content={{ title: tooltip.title, lines: tooltip.lines }} label="?" />
        ) : null}
      </div>
      <div className="veinsStepper">
        <button
          type="button"
          className="veinsStepBtn"
          disabled={clamped <= (min ?? 0)}
          onClick={() => onChange(clampInt(clamped - 1, min ?? 0, max ?? 999))}
        >
          −
        </button>
        <input
          className="veinsInput veinsStepperInput mono"
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
        {suffix ? <span className="veinsSuffix">{suffix}</span> : null}
        <button
          type="button"
          className="veinsStepBtn"
          disabled={clamped >= (max ?? 999)}
          onClick={() => onChange(clampInt(clamped + 1, min ?? 0, max ?? 999))}
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Wiki formula: P(vein) = (VSRM × (1 + I(2× Research))) / (Rarity × Ores Per Floor), capped at 1.
 * Expected veins per floor = oresPerFloor × min(1, P(vein)).
 * Buffs (e.g. 3× Vein Spawn Rate, Veinseeker) are implicit in the Vein Spawn Rate / Golden Multi you enter from Stats.
 * https://shminer.miraheze.org/wiki/Veins#Vein_Spawn_Rate
 */
function expectedVeinsPerFloorFromSpawn(
  veinSpawnRateMult: number,
  research2x: boolean,
  rarity: number,
  oresPerFloor: number
): number {
  if (rarity <= 0 || oresPerFloor <= 0) return 0;
  const numerator = veinSpawnRateMult * (research2x ? 2 : 1);
  const p = numerator / (rarity * oresPerFloor);
  return oresPerFloor * Math.min(1, p);
}

/** Card gain mult: None 1×, Standard 1.5×, Gilded 2×, Polychrome = user value. */
function cardGainMult(tier: VeinCardTier, polychromeMult: number): number {
  if (tier === 0) return 1;
  if (tier === 1) return CARD_MULT_STANDARD;
  if (tier === 2) return CARD_MULT_GILDED;
  return polychromeMult;
}

/**
 * Expected type multiplier: Golden/Rainbow are a chain; Gleaming is independent and stacks multiplicatively.
 * Wiki: "Gleaming Veins can occur independently of Golden and Rainbow veins and their effect stacks on top
 * of other vein variants multiplicatively resulting in huge bonus to obtained gains with base vein multiplier of 5."
 * So: E[golden/rainbow] × (1 − gleamingChance + gleamingChance × gleamingMult).
 */
function expectedTypeMult(s: VeinsState): number {
  const g = s.goldenChancePct / 100;
  const r = s.rainbowChancePct / 100;
  const gl = s.gleamingChancePct / 100;
  const normal = 1 - g;
  const goldenNotRainbow = g * (1 - r);
  const rainbow = g * r;
  /** Rainbow is golden + rainbow: both mults apply (rainbow stacks on top of golden). */
  const goldenRainbowMult = normal * 1 + goldenNotRainbow * s.goldenMult + rainbow * s.goldenMult * s.rainbowMult;
  const gleamingMult = 1 - gl + gl * s.gleamingMult;
  return goldenRainbowMult * gleamingMult;
}

/**
 * Expected type multiplier when Veinmorpher "Vein → golden" triggers (all veins become golden).
 * Rainbow can still crit from golden with the configured rainbow chance; Gleaming stays independent.
 */
function expectedMorphGoldenTypeMult(s: VeinsState): number {
  const r = s.rainbowChancePct / 100;
  const gl = s.gleamingChancePct / 100;
  const goldenWithRainbow = s.goldenMult * ((1 - r) + r * s.rainbowMult);
  const gleamingMult = 1 - gl + gl * s.gleamingMult;
  return goldenWithRainbow * gleamingMult;
}

/**
 * Expected type multiplier for veins from Void portals. Each portal can be normal, golden (chance), or rainbow (crit of golden).
 * So: (1 − pGP)*typeMult + pGP*(1 − pRP)*typeMult*goldenPortalMult + pGP*pRP*typeMult*goldenPortalMult*rainbowPortalMult.
 */
function expectedPortalTypeMult(s: VeinsState, typeMult: number): number {
  const pGP = s.goldenPortalChancePct / 100;
  const pRP = s.rainbowPortalChancePct / 100;
  const gPM = Math.max(0, s.goldenPortalMult);
  const rPM = Math.max(0, s.rainbowPortalMult);
  if (pGP <= 0) return typeMult;
  const goldenPart = gPM * ((1 - pRP) + pRP * rPM);
  return typeMult * ((1 - pGP) + pGP * goldenPart);
}

/** Apply Veinmorpher "all veins become golden" blend to a given branch multiplier (e.g. portal branch). */
function applyMorphGoldenBlend(baseTypeMult: number, morphGoldenTypeMult: number, pGolden: number, fallbackTypeMult: number): number {
  if (pGolden <= 0) return baseTypeMult;
  if (fallbackTypeMult <= 0) return baseTypeMult;
  const ratio = morphGoldenTypeMult / fallbackTypeMult;
  return baseTypeMult * ((1 - pGolden) + pGolden * ratio);
}

/** Compute veins per hour by type and total for a given floor. Uses all state inputs; when forceVoidOn is true, Void is treated as ON (for floor comparison). */
function computeVeinsAtFloor(
  floor: number,
  s: VeinsState,
  typeMult: number,
  forceVoidOn: boolean
): { byType: Array<{ vein: (typeof VEIN_TYPES)[number]; veinsPerHour: number }>; totalVph: number } {
  const afkMult = s.afk ? 0.85 : 1;
  const floorsPerHour = s.floorClearsPerMin * 60;
  const voidOn = forceVoidOn || s.voidDroneOn;
  const currentVeinAtFloor = getVeinForFloor(floor);
  const relevantVeins = voidOn
    ? VEIN_TYPES.filter((v) => v.floorMin <= floor)
    : currentVeinAtFloor
      ? [currentVeinAtFloor]
      : [];
  const pMorph = s.veinmorpherMorphChancePct / 100;
  const pGolden = s.veinmorpherGoldenChancePct / 100;
  const morphGoldenTypeMult = expectedMorphGoldenTypeMult(s);
  const typeMultBlended = pGolden > 0 ? (1 - pGolden) * typeMult + pGolden * morphGoldenTypeMult : typeMult;
  const portalTypeMultBase = expectedPortalTypeMult(s, typeMult);
  const portalTypeMultBlended = applyMorphGoldenBlend(portalTypeMultBase, morphGoldenTypeMult, pGolden, typeMult);

  const byType: Array<{ vein: (typeof VEIN_TYPES)[number]; veinsPerHour: number }> = relevantVeins.map((vein) => {
    const research2x = s.veinResearch2x[vein.id] ?? false;
    const tier = (s.veinCardTier[vein.id] ?? 0) as VeinCardTier;
    const cardMult = cardGainMult(tier, s.polychromeMult);
    const fromSpawn = expectedVeinsPerFloorFromSpawn(
      s.veinSpawnRateMult,
      research2x,
      vein.rarity,
      s.oresPerFloor
    );
    const isCurrentFloorVein = currentVeinAtFloor?.id === vein.id;
    const remainingOres = Math.max(0, s.oresPerFloor - fromSpawn);
    const normalVpf =
      fromSpawn *
      cardMult *
      s.veinIncomeMult *
      (isCurrentFloorVein && pGolden > 0 ? typeMultBlended : typeMult);
    const veinmorpherVpf =
      isCurrentFloorVein && remainingOres > 0 && pMorph > 0
        ? pMorph * remainingOres * typeMultBlended * cardMult * s.veinIncomeMult
        : 0;
    const floorsTotal = Math.max(1, floor);
    const floorsInRange =
      vein.floorMin <= floor ? Math.min(vein.floorMax, floor) - vein.floorMin + 1 : 0;
    const voidVpf =
      voidOn &&
      s.voidPortalChancePct > 0 &&
      s.voidPortalMult > 0 &&
      s.voidSuitMult > 0 &&
      floorsInRange > 0 &&
      s.oresPerFloor > 0
        ? (s.voidPortalChancePct / 100) *
          (floorsInRange / floorsTotal) *
          s.voidPortalMult *
          s.voidSuitMult *
          ((fromSpawn / s.oresPerFloor) + pMorph * (1 - (fromSpawn / s.oresPerFloor))) *
          cardMult *
          s.veinIncomeMult *
          portalTypeMultBlended
        : 0;
    const vpf = (normalVpf + veinmorpherVpf + voidVpf) * afkMult;
    const vph = vpf * floorsPerHour;
return { vein, veinsPerHour: vph };
    });
  const rawTotalVph = byType.reduce((sum, x) => sum + x.veinsPerHour, 0);
  const speedMult = gameSpeedMult(floor);
  for (const x of byType) x.veinsPerHour *= speedMult;
  return { byType, totalVph: rawTotalVph * speedMult };
}

function VeinSelect(props: {
  value: string;
  onChange: (id: string) => void;
  veinTypes: Array<{ id: string; name: string; iconFile: string }>;
  veinIconUrl: (iconFile: string) => string;
  ariaLabelledBy?: string;
}) {
  const { value, onChange, veinTypes, veinIconUrl, ariaLabelledBy } = props;
  const [open, setOpen] = useState(false);
  const [hasBeenOpened, setHasBeenOpened] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = veinTypes.find((v) => v.id === value) ?? veinTypes[0];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  return (
    <div className="veinsVeinSelectWrap" ref={containerRef}>
      <button
        type="button"
        className="veinsVeinSelectTrigger"
        onClick={() => setOpen((o) => { if (!o) setHasBeenOpened(true); return !o; })}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={ariaLabelledBy}
        id="veins-maximize-vein"
      >
        <img src={veinIconUrl(selected.iconFile)} alt="" className="veinsVeinSelectIcon" />
        <span className="veinsVeinSelectLabel">{selected.name}</span>
        <span className="veinsVeinSelectChevron" aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {hasBeenOpened && (
      <ul
        className="veinsVeinSelectList"
        role="listbox"
        aria-labelledby={ariaLabelledBy}
        aria-hidden={!open}
        hidden={!open}
      >
        {veinTypes.map((v) => (
          <li
            key={v.id}
            role="option"
            aria-selected={v.id === value}
            className={`veinsVeinSelectOption ${v.id === value ? "veinsVeinSelectOptionSelected" : ""}`}
            onClick={() => {
              onChange(v.id);
              setOpen(false);
            }}
          >
            <img src={veinIconUrl(v.iconFile)} alt="" className="veinsVeinSelectIcon" loading="lazy" />
            <span>{v.name}</span>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}

export function Veins() {
  const [state, setState] = useState<VeinsState>(() => {
    const saved = loadJson<Partial<VeinsState & { floorsPerHour?: number; veinmorpherChancePct?: number; veinmorpherVeinChancePct?: number; veinmorpherGoldenChancePct?: number }>>(STORAGE_KEY);
    const merged = { ...DEFAULT, ...saved };
    if (saved?.veinResearch2x && typeof saved.veinResearch2x === "object")
      merged.veinResearch2x = { ...merged.veinResearch2x, ...saved.veinResearch2x };
    if (saved?.veinCardTier && typeof saved.veinCardTier === "object")
      merged.veinCardTier = { ...merged.veinCardTier, ...saved.veinCardTier };
    if (saved?.floorsPerHour != null)
      merged.floorClearsPerMin = saved.floorsPerHour / 60;
    if (saved?.veinmorpherMorphChancePct != null || saved?.veinmorpherGoldenChancePct != null) {
      if (saved.veinmorpherMorphChancePct != null) merged.veinmorpherMorphChancePct = saved.veinmorpherMorphChancePct;
      if (saved.veinmorpherGoldenChancePct != null) merged.veinmorpherGoldenChancePct = saved.veinmorpherGoldenChancePct;
    } else if (saved?.veinmorpherVeinChancePct != null || saved?.veinmorpherGoldenChancePct != null) {
      merged.veinmorpherMorphChancePct = saved.veinmorpherVeinChancePct ?? saved.veinmorpherGoldenChancePct ?? 0;
      merged.veinmorpherGoldenChancePct = saved.veinmorpherGoldenChancePct ?? saved.veinmorpherVeinChancePct ?? 0;
    } else if (saved?.veinmorpherChancePct != null) {
      merged.veinmorpherMorphChancePct = saved.veinmorpherChancePct;
      merged.veinmorpherGoldenChancePct = saved.veinmorpherChancePct;
    }
    delete (merged as Partial<VeinsState & { floorsPerHour?: number; voidFloorsBelow?: number; veinmorpherChancePct?: number; veinmorpherVeinChancePct?: number; veinmorpherGoldenChancePct?: number; veinSpawnRate2xBuff?: boolean; veinSpawnRate3xBuff?: boolean }>).floorsPerHour;
    delete (merged as Partial<VeinsState & { floorsPerHour?: number; voidFloorsBelow?: number; veinmorpherChancePct?: number; veinmorpherVeinChancePct?: number; veinmorpherGoldenChancePct?: number; veinSpawnRate2xBuff?: boolean; veinSpawnRate3xBuff?: boolean }>).voidFloorsBelow;
    delete (merged as Partial<VeinsState & { veinmorpherChancePct?: number }>).veinmorpherChancePct;
    delete (merged as Partial<VeinsState & { veinmorpherVeinChancePct?: number }>).veinmorpherVeinChancePct;
    delete (merged as Partial<VeinsState & { veinseekerOn?: boolean; veinseekerGoldenVeinMultPct?: number }>).veinseekerOn;
    delete (merged as Partial<VeinsState & { veinseekerOn?: boolean; veinseekerGoldenVeinMultPct?: number }>).veinseekerGoldenVeinMultPct;
    delete (merged as Partial<VeinsState & { veinSpawnRate2xBuff?: boolean; veinSpawnRate3xBuff?: boolean }>).veinSpawnRate2xBuff;
    delete (merged as Partial<VeinsState & { veinSpawnRate2xBuff?: boolean; veinSpawnRate3xBuff?: boolean }>).veinSpawnRate3xBuff;
    return merged;
  });

  const gemEvGameSpeed = useMemo(() => {
    const ext = loadJson<{ game_speed_multiplier?: number }>(GEMEV_EXTERNAL_KEY);
    const n = ext?.game_speed_multiplier;
    return typeof n === "number" && Number.isFinite(n) && n >= 1 ? n : 1;
  }, [state.floor, state.afk, state.voidDroneOn, state.veinSpawnRateMult, state.veinIncomeMult]);

  const autoFloorClearsPerMin = useMemo(
    () => Number((48 * gemEvGameSpeed).toFixed(2)),
    [gemEvGameSpeed]
  );

  useEffect(() => {
    setState((prev) => {
      if (Math.abs(prev.floorClearsPerMin - autoFloorClearsPerMin) < 1e-9) return prev;
      return { ...prev, floorClearsPerMin: autoFloorClearsPerMin };
    });
  }, [autoFloorClearsPerMin]);

  useEffect(() => {
    saveJson(STORAGE_KEY, state);
  }, [state]);

  const update = (patch: Partial<VeinsState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const currentVein = useMemo(() => getVeinForFloor(state.floor), [state.floor]);
  const typeMult = useMemo(() => expectedTypeMult(state), [state]);

  const { veinsPerFloor, veinsPerHour, veinsPerHourByType, effectiveGoldenChancePct } = useMemo(() => {
    const afkMult = state.afk ? 0.85 : 1;
    const floorsPerHour = state.floorClearsPerMin * 60;
    /** When Void Drone is off: only current floor's vein. When on: all vein types that can spawn on current floor or below (void). */
    const relevantVeins = state.voidDroneOn
      ? VEIN_TYPES.filter((v) => v.floorMin <= state.floor)
      : currentVein
        ? [currentVein]
        : [];
    const pMorph = state.veinmorpherMorphChancePct / 100;
    const pGolden = state.veinmorpherGoldenChancePct / 100;
    /** Golden trigger: with prob pGolden all veins on the floor become golden; those can still rainbow-crit by Rainbow chance. */
    const morphGoldenTypeMult = expectedMorphGoldenTypeMult(state);
    const typeMultBlended = pGolden > 0 ? (1 - pGolden) * typeMult + pGolden * morphGoldenTypeMult : typeMult;
    const portalTypeMultBase = expectedPortalTypeMult(state, typeMult);
    const portalTypeMultBlended = applyMorphGoldenBlend(portalTypeMultBase, morphGoldenTypeMult, pGolden, typeMult);

    const byType: Array<{ vein: (typeof VEIN_TYPES)[number]; veinsPerHour: number }> = relevantVeins.map((vein) => {
      const research2x = state.veinResearch2x[vein.id] ?? false;
      const tier = (state.veinCardTier[vein.id] ?? 0) as VeinCardTier;
      const cardMult = cardGainMult(tier, state.polychromeMult);
      const fromSpawn = expectedVeinsPerFloorFromSpawn(
        state.veinSpawnRateMult,
        research2x,
        vein.rarity,
        state.oresPerFloor
      );
      const isCurrentFloorVein = currentVein?.id === vein.id;
      const remainingOres = Math.max(0, state.oresPerFloor - fromSpawn);
      /** Normal veins: on current floor, golden trigger blends type vs golden mult. */
      const normalVpf =
        fromSpawn *
        cardMult *
        state.veinIncomeMult *
        (isCurrentFloorVein && pGolden > 0 ? typeMultBlended : typeMult);
      /** Morph trigger: with prob pMorph all remaining ores become veins (current type). They then use same blended mult (golden trigger independent). */
      const veinmorpherVpf =
        isCurrentFloorVein && remainingOres > 0 && pMorph > 0
          ? pMorph * remainingOres * typeMultBlended * cardMult * state.veinIncomeMult
          : 0;
      /** Void: portals run first. Each pull adds 1 ORE (random floor tin–current). Then normal vein spawn runs on floor ores + portal ores. So portal ores for type t = portals × P(pull from t); each ore becomes a vein with same rate as floor: fromSpawn/oresPerFloor. */
      const floorsTotal = Math.max(1, state.floor);
      const floorsInRange =
        vein.floorMin <= state.floor ? Math.min(vein.floorMax, state.floor) - vein.floorMin + 1 : 0;
      const voidVpf =
        state.voidDroneOn &&
        state.voidPortalChancePct > 0 &&
        state.voidPortalMult > 0 &&
        state.voidSuitMult > 0 &&
        floorsInRange > 0 &&
        state.oresPerFloor > 0
          ? (state.voidPortalChancePct / 100) *
            (floorsInRange / floorsTotal) *
            state.voidPortalMult *
            state.voidSuitMult *
            ((fromSpawn / state.oresPerFloor) + pMorph * (1 - (fromSpawn / state.oresPerFloor))) *
            cardMult *
            state.veinIncomeMult *
            portalTypeMultBlended
          : 0;
      const vpf = (normalVpf + veinmorpherVpf + voidVpf) * afkMult;
      const vph = vpf * floorsPerHour;
      return { vein, veinsPerHour: vph };
    });
    byType.sort((a, b) => b.veinsPerHour - a.veinsPerHour);
    const totalVeinsPerHour = byType.reduce((s, x) => s + x.veinsPerHour, 0);
    const current = currentVein ? byType.find((x) => x.vein.id === currentVein.id) : null;
    /** When Void is on, show total across all vein types; otherwise current floor only. */
    const displayVph = state.voidDroneOn ? totalVeinsPerHour : (current?.veinsPerHour ?? 0);
    /** Effective golden chance: golden trigger (independent) makes all veins golden with prob pGolden; else normal golden% g. So per-vein P(golden) = (1−pGolden)*g + pGolden. */
    const effectiveGoldenChancePct =
      (1 - pGolden) * state.goldenChancePct + pGolden * 100;
    const speedMult = gameSpeedMult(state.floor);
    const adjustedVph = displayVph * speedMult;
    const adjustedByType = byType.map((x) => ({ ...x, veinsPerHour: x.veinsPerHour * speedMult }));
    return {
      veinsPerFloor: floorsPerHour > 0 ? adjustedVph / floorsPerHour : 0,
      veinsPerHour: adjustedVph,
      veinsPerHourByType: adjustedByType,
      effectiveGoldenChancePct,
    };
  }, [currentVein, state.floor, state.voidDroneOn, state.voidPortalChancePct, state.voidPortalMult, state.voidSuitMult, state.goldenPortalChancePct, state.goldenPortalMult, state.rainbowPortalChancePct, state.rainbowPortalMult, state.veinResearch2x, state.veinCardTier, state.polychromeMult, state.veinSpawnRateMult, state.veinIncomeMult, state.oresPerFloor, state.floorClearsPerMin, state.afk, state.veinmorpherMorphChancePct, state.veinmorpherGoldenChancePct, state.goldenChancePct, state.goldenMult, typeMult]);

  /** Top 3 floors to maximize selected vein (Void always ON). Primary = selected vein vph; within ±10% and not statistically significant (95% CI), tie-break = higher total veins. */
  const top3FloorsForVein = useMemo(() => {
    const targetId = state.maximizeVeinId;
    if (!VEIN_TYPES.some((v) => v.id === targetId)) return [];
    const candidates: Array<{ floor: number; selectedVph: number; totalVph: number }> = [];
    for (let f = 1; f <= 120; f++) {
      if (FLOORS_BOMB_RECHARGE_DEBUFF.includes(f)) continue;
      const { byType, totalVph } = computeVeinsAtFloor(f, state, typeMult, true);
      const entry = byType.find((x) => x.vein.id === targetId);
      const selectedVph = entry?.veinsPerHour ?? 0;
      candidates.push({ floor: f, selectedVph, totalVph });
    }
    candidates.sort((a, b) => {
      const sa = a.selectedVph;
      const sb = b.selectedVph;
      const maxSel = Math.max(sa, sb) || 1e-9;
      const diffRel = (sa - sb) / maxSel;
      if (diffRel > 0.1) return -1;
      if (diffRel < -0.1) return 1;
      const diffAbs = sa - sb;
      const seDiff = Math.sqrt((sa + sb) / 8);
      if (Math.abs(diffAbs) < 1.96 * seDiff) return b.totalVph - a.totalVph;
      return diffAbs > 0 ? -1 : 1;
    });
    return candidates.slice(0, 3);
  }, [state, typeMult]);

  const [mcState, setMcState] = useState<{
    running: boolean;
    results: null | {
      runs: number;
      byFloor: Array<{
        floor: number;
        totalSamples: number[];
        byTypeSamples: Array<{ vein: (typeof VEIN_TYPES)[number]; samples: number[] }>;
      }>;
    };
  }>({ running: false, results: null });
  const [mcChartFloor, setMcChartFloor] = useState<number | null>(null);

  const [mcSitState, setMcSitState] = useState<{
    running: boolean;
    results: null | {
      runs: number;
      byFloor: Array<{
        floor: number;
        totalSamples: number[];
        byTypeSamples: Array<{ vein: (typeof VEIN_TYPES)[number]; samples: number[] }>;
      }>;
    };
  }>({ running: false, results: null });
  const [mcSitChartFloor, setMcSitChartFloor] = useState<number | null>(null);

  /** Shared boxplot UI: Top-3 MC = one row per floor (Total) + Chart button; Sit = one row per vein, no Chart. */
  const renderMcBoxplots = (
    dataRows: Array<{ key: string; floor: number; rank: 1 | 2 | 3; label: string; samples: number[]; iconFile?: string }>,
    loTot: number,
    spanTot: number,
    onChartClick?: (floor: number) => void
  ) => (
    <div className="veinsMcBoxplots">
      <div className="veinsMcBoxplotsHeader">
        Per floor – box plot (same scale)
        <Tooltip
          content={{
            title: "Box plot",
            lines: [
              "min: minimum. Q1: 25th percentile. mean: average. Q3: 75th percentile. max: maximum.",
              "Variance includes Poisson (counts) plus a dispersion term so morph/golden/rainbow-style randomness is reflected.",
            ],
          }}
          label="?"
        />
      </div>
      {dataRows.map((row) => {
        const sorted = row.samples.length > 0 ? [...row.samples].sort((a, b) => a - b) : [];
        const { min, q1, med, q3, max } = boxPlotStats(sorted);
        const meanVal = row.samples.length > 0 ? row.samples.reduce((a, b) => a + b, 0) / row.samples.length : 0;
        const toPct = (v: number) => ((v - loTot) / spanTot) * 100;
        const pctMin = toPct(min);
        const pctQ1 = toPct(q1);
        const pctMed = toPct(med);
        const pctQ3 = toPct(q3);
        const pctMax = toPct(max);
        const pctBoxCenter = (pctQ1 + pctQ3) / 2;
        return (
          <div key={row.key} className={`veinsMcBoxplotRow veinsMcBoxplotRowRank${row.rank}`}>
            <div className="veinsMcBoxplotHead">
              {row.iconFile != null ? (
                <img src={veinIconUrl(row.iconFile)} alt="" className="veinsMcVeinIcon" />
              ) : (
                <span className="veinsMcVeinIconPlaceholder" aria-hidden />
              )}
              <span className="veinsMcBoxplotName">{row.label}</span>
              {onChartClick != null && (
                <button
                  type="button"
                  className="veinsMcChartBtn"
                  onClick={() => onChartClick(row.floor)}
                >
                  Chart
                </button>
              )}
              <span className="veinsMcBoxplotStats mono">
                min {formatCompact(min, 2)} · Q1 {formatCompact(q1, 2)} · mean {formatCompact1Dec(meanVal)} · Q3 {formatCompact(q3, 2)} · max {formatCompact(max, 2)}
              </span>
            </div>
            <div className="veinsMcBoxplotMeanRow" role="presentation">
              <div className="veinsMcBoxplotMeanLabel" style={{ left: `${pctBoxCenter}%` }} title={`mean ${formatCompact1Dec(meanVal)}`}>
                <span className="veinsMcBoxplotMeanValue mono">{formatCompact1Dec(meanVal)}</span>
                <span className="veinsMcBoxplotMeanArrow" aria-hidden>▼</span>
              </div>
            </div>
            <div className="veinsMcBoxplotTrack">
              <div className="veinsMcBoxplotWhiskerLeft" style={{ left: `${pctMin}%`, width: `${pctQ1 - pctMin}%` }} />
              <div className="veinsMcBoxplotBox" style={{ left: `${pctQ1}%`, width: `${pctQ3 - pctQ1}%` }}>
                <div className="veinsMcBoxplotMedian" style={{ left: `${(pctQ3 - pctQ1 > 0 ? (pctMed - pctQ1) / (pctQ3 - pctQ1) : 0.5) * 100}%` }} />
              </div>
              <div className="veinsMcBoxplotWhiskerRight" style={{ left: `${pctQ3}%`, width: `${pctMax - pctQ3}%` }} />
            </div>
            <div className="veinsMcBoxplotAxis">
              <div className="veinsMcBoxplotAxisTicks">
                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
                  <span key={t} className="mono">
                    {formatCompact(loTot + t * spanTot)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const runMc8h = () => {
    const top3 = top3FloorsForVein.slice(0, 3);
    if (top3.length === 0) return;
    setMcState({ running: true, results: null });
    const HOURS = 8;
    const runs = 10000;
    setTimeout(() => {
      const byFloor: Array<{
        floor: number;
        totalSamples: number[];
        byTypeSamples: Array<{ vein: (typeof VEIN_TYPES)[number]; samples: number[] }>;
      }> = [];
      for (const { floor } of top3) {
        const { byType } = computeVeinsAtFloor(floor, state, typeMult, true);
        const totalSamples: number[] = [];
        const byTypeSamples = byType.map(({ vein }) => ({ vein, samples: [] as number[] }));
        for (let r = 0; r < runs; r++) {
          let total = 0;
          for (let i = 0; i < byType.length; i++) {
            const { vein, veinsPerHour } = byType[i];
            const meanHours = veinsPerHour * HOURS;
            const x = poisson(meanHours);
            const dispersion = 1 + 0.25 * (Math.random() * 2 - 1);
            const y = Math.max(0, Math.round(x * dispersion));
            total += y;
            byTypeSamples[i].samples.push(y);
          }
          totalSamples.push(total);
        }
        totalSamples.sort((a, b) => a - b);
        byFloor.push({ floor, totalSamples, byTypeSamples });
      }
      setMcState({
        running: false,
        results: { runs, byFloor },
      });
      setMcChartFloor(null);
    }, 0);
  };

  const runMcSit8h = () => {
    const floor = state.floor;
    if (floor < 1 || floor > 120 || FLOORS_BOMB_RECHARGE_DEBUFF.includes(floor)) return;
    setMcSitState({ running: true, results: null });
    const HOURS = 8;
    const runs = 10000;
    setTimeout(() => {
      const byFloor: Array<{
        floor: number;
        totalSamples: number[];
        byTypeSamples: Array<{ vein: (typeof VEIN_TYPES)[number]; samples: number[] }>;
      }> = [];
      const { byType } = computeVeinsAtFloor(floor, state, typeMult, false);
      const totalSamples: number[] = [];
      const byTypeSamples = byType.map(({ vein }) => ({ vein, samples: [] as number[] }));
      for (let r = 0; r < runs; r++) {
        let total = 0;
        for (let i = 0; i < byType.length; i++) {
          const { vein, veinsPerHour } = byType[i];
          const meanHours = veinsPerHour * HOURS;
            const x = poisson(meanHours);
            const dispersion = 1 + 0.25 * (Math.random() * 2 - 1);
            const y = Math.max(0, Math.round(x * dispersion));
            total += y;
            byTypeSamples[i].samples.push(y);
        }
        totalSamples.push(total);
      }
      totalSamples.sort((a, b) => a - b);
      byFloor.push({ floor, totalSamples, byTypeSamples });
      setMcSitState({
        running: false,
        results: { runs, byFloor },
      });
      setMcSitChartFloor(null);
    }, 0);
  };

  const setVeinResearch2x = (veinId: string, value: boolean) => {
    setState((prev) => ({ ...prev, veinResearch2x: { ...prev.veinResearch2x, [veinId]: value } }));
  };
  const setVeinCardTier = (veinId: string, tier: VeinCardTier) => {
    setState((prev) => ({ ...prev, veinCardTier: { ...prev.veinCardTier, [veinId]: tier } }));
  };

  return (
    <div className="veinsPage">
      <div className="archWarningBanner" role="status">
        <span className="archWarningIcon" aria-hidden>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </span>
        <div className="archWarningText">
          W4 is not implemented in this calculator.
        </div>
      </div>
      <div className="veinsLayout">
        <div className="veinsLeft">
          <div className="veinsGrid">
        <section className="veinsSection">
          <h2 className="veinsSectionTitle">Setup</h2>
          <IntStepper
            label="Floor"
            value={state.floor}
            onChange={(n) => update({ floor: n })}
            min={1}
            max={120}
            tooltip={{
              title: "Floor",
              lines: [
                "Floor you are farming (1–120). Determines which vein type can spawn (see wiki Veins table).",
              ],
            }}
          />
          <NumInput
            label="Ores per floor"
            value={state.oresPerFloor}
            onChange={(n) => update({ oresPerFloor: n })}
            min={0.1}
            decimals={1}
            tooltip={{
              title: "Ores per floor",
              lines: [
                "Number of ore nodes on the floor. Used in the spawn formula: P(vein) = (Vein Spawn Rate × (1+2× Research)) / (Rarity × Ores Per Floor).",
              ],
            }}
          />
          <div className="veinsRow">
            <div className="veinsLabelWrap">
              <span>Floor clears / min (auto)</span>
              <Tooltip
                content={{
                  title: "Floor clears / min",
                  lines: [
                    "Auto-calculated from Gem EV game speed.",
                    "Formula: 48 × Game Speed multiplier.",
                    "Change Game Speed in Gem EV to update this value.",
                  ],
                }}
                label="?"
              />
            </div>
            <div className="veinsInputWrap">
              <span className="veinsAutoValue mono" aria-label="Floor clears per minute (auto from Gem EV)">
                {autoFloorClearsPerMin.toFixed(2)}
              </span>
              <span className="veinsSuffix" title={`Gem EV game speed multiplier: ${gemEvGameSpeed.toFixed(2)}×`}>
                from Gem EV ({gemEvGameSpeed.toFixed(2)}×)
              </span>
            </div>
          </div>
          <div className="veinsRow">
            <div className="veinsLabelWrap">
              <span>Offline farming</span>
              <Tooltip
                content={{
                  title: "Offline farming",
                  lines: ["When enabled, applies −15% gain (0.85×) to vein gains."],
                }}
                label="?"
              />
            </div>
            <label className="veinsCheckWrap">
              <input
                type="checkbox"
                checked={state.afk}
                onChange={(e) => update({ afk: e.target.checked })}
              />
              <span className="veinsCheckLabel">{state.afk ? "Offline (−15%)" : ""}</span>
            </label>
          </div>
        </section>

        <section className="veinsSection">
          <h2 className="veinsSectionTitle">Vein Stats</h2>
          <NumInput
            label="Vein Spawn Rate"
            value={state.veinSpawnRateMult}
            onChange={(n) => update({ veinSpawnRateMult: n })}
            min={0}
            suffix="×"
            decimals={2}
            tooltip={{
              title: "Vein Spawn Rate",
              lines: [
                "From Stats (buffs like 3× Vein Spawn Rate, Veinseeker suit are already included there).",
                "Formula: P(vein) = (this × (1+2× Research)) / (Rarity × Ores Per Floor), capped at 1.",
              ],
            }}
          />
          <NumInput
            label="Vein Income Multi"
            value={state.veinIncomeMult}
            onChange={(n) => update({ veinIncomeMult: n })}
            min={0}
            suffix="×"
            decimals={2}
            tooltip={{
              title: "Vein Income Multi",
              lines: ["Increases the amount of veins obtained from each vein."],
            }}
          />
          <NumInput
            label="Golden Chance"
            value={state.goldenChancePct}
            onChange={(n) => update({ goldenChancePct: n })}
            min={0}
            max={100}
            suffix="%"
            decimals={2}
            tooltip={{
              title: "Golden Vein Chance",
              lines: ["Chance for a vein to spawn as a golden variant (base ×5)."],
            }}
          />
          <NumInput
            label="Golden Multi"
            value={state.goldenMult}
            onChange={(n) => update({ goldenMult: n })}
            min={0}
            suffix="×"
            decimals={2}
            tooltip={{
              title: "Golden Vein Multiplier",
              lines: ["Increases amount obtained from golden veins. Base ×5."],
            }}
          />
          <NumInput
            label="Rainbow Chance"
            value={state.rainbowChancePct}
            onChange={(n) => update({ rainbowChancePct: n })}
            min={0}
            max={100}
            suffix="%"
            decimals={2}
            tooltip={{
              title: "Rainbow Vein Chance",
              lines: ["Chance for a golden vein to spawn as rainbow variant (base ×20)."],
            }}
          />
          <NumInput
            label="Rainbow Multi"
            value={state.rainbowMult}
            onChange={(n) => update({ rainbowMult: n })}
            min={0}
            suffix="×"
            decimals={2}
            tooltip={{
              title: "Rainbow Vein Multiplier",
              lines: ["Increases amount from rainbow veins. Base ×20."],
            }}
          />
          <NumInput
            label="Gleaming Chance"
            value={state.gleamingChancePct}
            onChange={(n) => update({ gleamingChancePct: n })}
            min={0}
            max={100}
            suffix="%"
            decimals={2}
            tooltip={{
              title: "Gleaming Vein Chance",
              lines: [
                "Chance for a vein to spawn as gleaming variant (base ×5).",
                "Gleaming can occur independently of Golden and Rainbow; its effect stacks multiplicatively on top of the other variant.",
              ],
            }}
          />
          <NumInput
            label="Gleaming Multi"
            value={state.gleamingMult}
            onChange={(n) => update({ gleamingMult: n })}
            min={0}
            suffix="×"
            decimals={2}
            tooltip={{
              title: "Gleaming Vein Multiplier",
              lines: [
                "Increases amount from gleaming veins. Base ×5.",
                "Stacks multiplicatively on top of normal, golden, or rainbow vein gains.",
              ],
            }}
          />
        </section>

        <section className="veinsSection">
          <h2 className="veinsSectionTitle">Veinmorpher Bomb</h2>
          <NumInput
            label="Ore → vein chance"
            value={state.veinmorpherMorphChancePct}
            onChange={(n) => update({ veinmorpherMorphChancePct: n })}
            min={0}
            max={100}
            suffix="%"
            decimals={2}
            tooltip={{
              title: "Ore → vein chance",
              lines: [
                "Per floor: chance that all remaining ores (after normal vein spawn) morph into veins of the current floor type.",
                "Also applies to portal-derived ores in the Void branch (remaining portal ores can morph too).",
                "Independent of the vein → golden trigger.",
              ],
            }}
          />
          <NumInput
            label="Vein → golden chance"
            value={state.veinmorpherGoldenChancePct}
            onChange={(n) => update({ veinmorpherGoldenChancePct: n })}
            min={0}
            max={100}
            suffix="%"
            decimals={2}
            tooltip={{
              title: "Vein → golden chance",
              lines: [
                "Per floor: chance that all veins on the floor (normal spawn + any morphed) become golden.",
                "Also applies to portal-derived veins in the Void branch.",
                "When this triggers, those golden veins can still rainbow-crit via your Rainbow Chance.",
                "Independent of the ore → vein trigger.",
              ],
            }}
          />
        </section>

        <section className="veinsSection">
          <h2 className="veinsSectionTitle">Vein cards</h2>
          <NumInput
            label="Polychrome multiplier"
            value={state.polychromeMult}
            onChange={(n) => update({ polychromeMult: n })}
            min={0}
            suffix="×"
            decimals={2}
            tooltip={{
              title: "Polychrome multiplier",
              lines: [
                "Gain multiplier for all vein cards set to Polychrome (typical range 4×–11.59×). One value applies to every Polychrome vein card you have.",
              ],
            }}
          />
          <Collapsible id="veins-cards-table" title="Per-vein: Research 2× & Card (Standard / Gilded / Polychrome)" defaultExpanded={false}>
            <div className="veinsCardsTableWrap">
              <table className="veinsCardsTable">
                <thead>
                  <tr>
                    <th>Vein</th>
                    <th>Research 2×</th>
                    <th>Card</th>
                  </tr>
                </thead>
                <tbody>
                  {VEIN_TYPES.map((v) => (
                    <tr key={v.id}>
                      <td className="veinsCardName">{v.name}</td>
                      <td>
                        <label className="veinsCheckWrap veinsCheckSmall">
                          <input
                            type="checkbox"
                            checked={state.veinResearch2x[v.id] ?? false}
                            onChange={(e) => setVeinResearch2x(v.id, e.target.checked)}
                          />
                          <span aria-hidden>2×</span>
                        </label>
                      </td>
                      <td>
                        <VeinCardTierToggles
                          value={(state.veinCardTier[v.id] ?? 0) as VeinCardTier}
                          onChange={(tier) => setVeinCardTier(v.id, tier)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Collapsible>
        </section>

        <section className="veinsSection">
          <h2 className="veinsSectionTitle">Void / Portal (Drones)</h2>
          <div className="veinsRow">
            <div className="veinsLabelWrap">
              <span>Void Drone active</span>
              <Tooltip
                content={{
                  title: "Void Drone active",
                  lines: [
                    "When off, you only farm veins from the current floor (one vein type).",
                    "When on, void portals allow veins from lower floors to contribute.",
                  ],
                }}
                label="?"
              />
            </div>
            <label className="veinsCheckWrap">
              <input
                type="checkbox"
                checked={state.voidDroneOn}
                onChange={(e) => update({ voidDroneOn: e.target.checked })}
              />
              <span className="veinsCheckLabel">{state.voidDroneOn ? "ON" : "OFF"}</span>
            </label>
          </div>
          <NumInput
            label="Void Portal Chance"
            value={state.voidPortalChancePct}
            onChange={(n) => update({ voidPortalChancePct: n })}
            min={0}
            max={100}
            suffix="%"
            decimals={2}
            tooltip={{
              title: "Void Portal Chance",
              lines: [
                "Chance to activate Ore Portals (e.g. Void Suit: 10%).",
                "Portals allow veins from lower floors to contribute.",
              ],
            }}
          />
          <NumInput
            label="Void Portal Multi"
            value={state.voidPortalMult}
            onChange={(n) => update({ voidPortalMult: n })}
            min={0}
            suffix="×"
            decimals={2}
            tooltip={{
              title: "Void Portal Multi",
              lines: [
                "From Void Drone when fueled: +3× at grade 0, +1× per grade, max +23×.",
                "You can enter the value from Drone or override here.",
              ],
            }}
          />
          <NumInput
            label="Void Suit Multi"
            value={state.voidSuitMult}
            onChange={(n) => update({ voidSuitMult: n })}
            min={0}
            suffix="×"
            decimals={2}
            tooltip={{
              title: "Void Suit Multi",
              lines: [
                "General Portal Resource Multiplier (often 30× or higher).",
                "Multiplies portal gains together with Void Portal Multi.",
              ],
            }}
          />
          <NumInput
            label="Golden Portal Chance"
            value={state.goldenPortalChancePct}
            onChange={(n) => update({ goldenPortalChancePct: n })}
            min={0}
            max={100}
            suffix="%"
            decimals={2}
            tooltip={{
              title: "Golden Portal Chance",
              lines: ["Chance for a Void Portal to be Golden (higher multiplier)."],
            }}
          />
          <NumInput
            label="Golden Portal Multi"
            value={state.goldenPortalMult}
            onChange={(n) => update({ goldenPortalMult: n })}
            min={0}
            suffix="×"
            decimals={2}
            tooltip={{
              title: "Golden Portal Multi",
              lines: ["Multiplier applied when portal is Golden."],
            }}
          />
          <NumInput
            label="Rainbow Portal Chance"
            value={state.rainbowPortalChancePct}
            onChange={(n) => update({ rainbowPortalChancePct: n })}
            min={0}
            max={100}
            suffix="%"
            decimals={2}
            tooltip={{
              title: "Rainbow Portal Chance",
              lines: ["Chance for a Golden Portal to be Rainbow (must roll Golden first)."],
            }}
          />
          <NumInput
            label="Rainbow Portal Multi"
            value={state.rainbowPortalMult}
            onChange={(n) => update({ rainbowPortalMult: n })}
            min={0}
            suffix="×"
            decimals={2}
            tooltip={{
              title: "Rainbow Portal Multi",
              lines: ["Multiplier for Rainbow Void Portals (base ×5 vs Golden)."],
            }}
          />
        </section>
          </div>
        </div>

        <div className="veinsRight">
        <section className="veinsResultSection">
          <Collapsible
            id="veins-per-hour-from-setup"
            title={
              <span className="veinsNoSimTitle">
                <span className="veinsNoSimWarningIcon" aria-hidden>⚠</span>
                Veins per hour (No Simulation: Use MC simulation for more accuracy)
              </span>
            }
            defaultExpanded={false}
            className="veinsResultCard veinsResultCardFromSetup"
          >
            {currentVein ? (
              <>
                <div className="veinsResultHero">
                  <span className="veinsResultHeroValue mono" aria-label={`${veinsPerHour.toFixed(2)} veins per hour`}>
                    {formatCompact(veinsPerHour)}
                  </span>
                  <span className="veinsResultHeroUnit">veins/h</span>
                </div>
                <div className="veinsResultMeta">
                  <span className="veinsResultFloor">
                    Floor {state.floor} → {currentVein.name}
                  </span>
                  <span className="veinsResultPerFloor mono" title={veinsPerFloor.toFixed(2)}>
                    {formatCompact(veinsPerFloor)} per floor
                  </span>
                  {state.afk && <span className="veinsResultOfflineBadge">Offline −15%</span>}
                </div>
                <div className="veinsResultMeta veinsResultMetaSecondary">
                  <span className="veinsResultEffectiveRainbow" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    Effective Golden chance:{" "}
                    <Tooltip
                      content={{
                        title: "Effective Golden chance",
                        lines: [
                          "Fraction of veins (current floor type) that are golden.",
                          "Uses your golden% on normal spawn veins; the Veinmorpher golden trigger (independent roll) makes all veins on the floor golden when it triggers.",
                        ],
                      }}
                      label="?"
                    />
                    <span className="mono">{effectiveGoldenChancePct.toFixed(2)}%</span>
                  </span>
                  <span className="veinsResultEffectiveRainbow">
                    Effective Rainbow chance:{" "}
                    <span className="mono" title={`effective golden × rainbow: ${effectiveGoldenChancePct.toFixed(2)}% × ${state.rainbowChancePct}%`}>
                      {((effectiveGoldenChancePct * state.rainbowChancePct) / 100).toFixed(2)}%
                    </span>
                  </span>
                </div>
                <div className="veinsResultChart">
                  <div className="veinsResultChartBars">
                    {veinsPerHourByType.map(({ vein, veinsPerHour: vph }) => {
                      const isCurrent = currentVein?.id === vein.id;
                      const maxVph = veinsPerHourByType[0]?.veinsPerHour ?? 1;
                      const pct = maxVph > 0 ? (vph / maxVph) * 100 : 0;
                      return (
                        <div
                          key={vein.id}
                          className={`veinsChartRow ${isCurrent ? "veinsChartRowCurrent" : ""}`}
                          title={`${vein.name}: ${vph.toFixed(2)} veins/h (floors ${vein.floorMin}–${vein.floorMax})`}
                        >
                          <img
                            src={veinIconUrl(vein.iconFile)}
                            alt=""
                            className="veinsChartIcon"
                            width={28}
                            height={28}
                            loading="lazy"
                          />
                          <span className="veinsChartName">{vein.name}</span>
                          <div className="veinsChartBarWrap">
                            <div className="veinsChartBar" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="veinsChartValue mono" title={vph.toFixed(2)}>{formatCompact(vph)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <p className="veinsResultNoVein">No vein type for floor {state.floor}. Use floors 1–120.</p>
            )}
          </Collapsible>

          <Collapsible id="veins-mc-top3" title="MC simulation - Maximize a specific vein" defaultExpanded={false} className="veinsResultCard veinsResultCardMc veinsBestFloorsCard">
            <div className="veinsMcCollapsibleContent">
            <p className="veinsBestFloorsIntro">
              Choose a vein to pick the top 3 suggested floors; run the simulation to see total vein distributions on those floors (no goal vein). All inputs from the left are used.
            </p>
            <div className="veinsMcControlsRow">
              <div className="veinsMcControlGroup">
                <label id="veins-maximize-vein-label" className="veinsLabelWrap">Vein to maximize (picks top 3 floors)</label>
                <VeinSelect
                  value={state.maximizeVeinId}
                  onChange={(id) => update({ maximizeVeinId: id })}
                  veinTypes={VEIN_TYPES}
                  veinIconUrl={veinIconUrl}
                  ariaLabelledBy="veins-maximize-vein-label"
                />
              </div>
              <div className="veinsMcControlGroup veinsMcOfflineWrap">
                <div className="veinsLabelWrap">Offline</div>
                <label className="veinsCheckWrap">
                  <input
                    type="checkbox"
                    checked={state.afk}
                    onChange={(e) => update({ afk: e.target.checked })}
                  />
                  <span className="veinsCheckLabel">{state.afk ? "Yes (−15%)" : "No"}</span>
                </label>
              </div>
              <div className="veinsMcControlGroup" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  className="btn btnPrimary veinsMcBtn"
                  onClick={runMc8h}
                  disabled={mcState.running || top3FloorsForVein.length === 0}
                >
                  {mcState.running ? "Running…" : "Run MC simulation (8h)"}
                </button>
                <Tooltip
                  content={{
                    title: "MC simulation (8h)",
                    lines: [
                      "Runs 10,000 simulated 8h sessions at each of the top 3 suggested floors (Void ON). Shows total veins per floor only (no goal vein).",
                      "Vein to maximize: only used to pick which 3 floors to simulate. Top 1/2/3: best mean for that vein; within ±10% tie-break = higher total veins.",
                      "Offline: when enabled, applies −15% to gains (same as Setup).",
                      "Bomb recharge floors (67–68, 79–82) never suggested. −25% game speed floors (71–72, 89–92, 97–98) scaled to 0.75×.",
                    ],
                  }}
                  label="?"
                />
              </div>
            </div>

            {mcState.results && (() => {
                const res = mcState.results;
                const rows: Array<{ key: string; floor: number; rank: 1 | 2 | 3; label: string; samples: number[] }> = res.byFloor.map(({ floor, totalSamples }, idx) => {
                  const rank = (Math.min(idx + 1, 3) || 1) as 1 | 2 | 3;
                  return { key: `floor-${floor}-total`, floor, rank, label: `Total veins (Floor ${floor})`, samples: totalSamples };
                });
                const minTotal = rows.length > 0 ? Math.min(...rows.map((r) => r.samples[0] ?? 0)) : 0;
                const maxTotal = rows.length > 0 ? Math.max(...rows.map((r) => r.samples[r.samples.length - 1] ?? 0)) : 0;
                const spanTotal = maxTotal - minTotal || 1;
                const rowsPerHour = rows.map((r) => ({ ...r, samples: r.samples.map((s) => s / 8) }));
                const minTotalPh = minTotal / 8;
                const maxTotalPh = maxTotal / 8;
                const spanTotalPh = spanTotal / 8 || 1;

                return (
                  <div className="veinsMcResultsPanel">
                    <h3 className="veinsMcResultsTitle">
                      Results — {res.runs} runs × 8h per floor
                    </h3>
                    <Collapsible id="veins-mc-full8h" title="Results over full 8h" defaultExpanded={false}>
                      <div className="veinsMcCollapsibleContent">
                        {renderMcBoxplots(rows, minTotal, spanTotal, (floor) => setMcChartFloor((f) => (f === floor ? null : floor)))}
                      </div>
                    </Collapsible>
                    <Collapsible id="veins-mc-per-hour" title="Per-hour values (from 8h simulation)" defaultExpanded={false}>
                      <div className="veinsMcCollapsibleContent">
                        {renderMcBoxplots(rowsPerHour, minTotalPh, spanTotalPh, (floor) => setMcChartFloor((f) => (f === floor ? null : floor)))}
                      </div>
                    </Collapsible>
                  </div>
                );
              })()}
            </div>
          </Collapsible>

          <Collapsible id="veins-mc-sit" title="MC simulation — Sit on floor (8h)" defaultExpanded={false} className="veinsResultCard veinsResultCardMc veinsBestFloorsCard">
            <div className="veinsMcCollapsibleContent">
            <p className="veinsBestFloorsIntro">
              You are sitting on one floor. Use the Floor input from the left; run the simulation to see the total vein distribution for that floor only (no goal vein).
            </p>
            <div className="veinsMcControlsRow">
              <div className="veinsMcControlGroup">
                <div className="veinsLabelWrap">Sit on floor</div>
                <span className="mono veinsMcSitFloor">Floor {state.floor}</span>
              </div>
              <div className="veinsMcControlGroup veinsMcOfflineWrap">
                <div className="veinsLabelWrap">Offline</div>
                <label className="veinsCheckWrap">
                  <input
                    type="checkbox"
                    checked={state.afk}
                    onChange={(e) => update({ afk: e.target.checked })}
                  />
                  <span className="veinsCheckLabel">{state.afk ? "Yes (−15%)" : "No"}</span>
                </label>
              </div>
              <div className="veinsMcControlGroup" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  className="btn btnPrimary veinsMcBtn"
                  onClick={runMcSit8h}
                  disabled={mcSitState.running || state.floor < 1 || state.floor > 120 || FLOORS_BOMB_RECHARGE_DEBUFF.includes(state.floor)}
                >
                  {mcSitState.running ? "Running…" : "Run MC simulation (8h)"}
                </button>
                <Tooltip
                  content={{
                    title: "MC simulation — Sit on floor (8h)",
                    lines: [
                      "Runs 10,000 simulated 8h sessions on the current floor only. Uses your Void Drone setting from Setup (not forced ON).",
                      "One box plot per vein type. Use the Floor input in the left panel to choose which floor.",
                      "Offline: when enabled, applies −15% to gains (same as Setup).",
                    ],
                  }}
                  label="?"
                />
              </div>
            </div>

            {mcSitState.results && (() => {
                const res = mcSitState.results;
                const floorData = res.byFloor[0];
                if (!floorData?.byTypeSamples?.length) return null;
                const floor = floorData.floor;
                const withMean = floorData.byTypeSamples.map(({ vein, samples }) => {
                  const meanVal = samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
                  return { vein, samples, meanVal };
                });
                withMean.sort((a, b) => a.vein.floorMin - b.vein.floorMin);
                const rows: Array<{ key: string; floor: number; rank: 1 | 2 | 3; label: string; samples: number[]; iconFile: string }> = withMean.map(({ vein, samples }, idx) => ({
                  key: `sit-${vein.id}`,
                  floor,
                  rank: ((idx % 3) + 1) as 1 | 2 | 3,
                  label: `${vein.name} (Floor ${floor})`,
                  samples,
                  iconFile: vein.iconFile,
                }));
                const sortedMins = rows.map((r) => (r.samples.length > 0 ? Math.min(...r.samples) : 0));
                const sortedMaxs = rows.map((r) => (r.samples.length > 0 ? Math.max(...r.samples) : 0));
                const minTotal = rows.length > 0 ? Math.min(...sortedMins) : 0;
                const maxTotal = rows.length > 0 ? Math.max(...sortedMaxs) : 0;
                const spanTotal = maxTotal - minTotal || 1;
                const rowsPerHour = rows.map((r) => ({ ...r, samples: r.samples.map((s) => s / 8) }));
                const minTotalPh = minTotal / 8;
                const maxTotalPh = maxTotal / 8;
                const spanTotalPh = spanTotal / 8 || 1;

                return (
                  <div className="veinsMcResultsPanel">
                    <h3 className="veinsMcResultsTitle">
                      Results — {res.runs} runs × 8h · Floor {floor}
                    </h3>
                    <Collapsible id="veins-mc-sit-full8h" title="Results over full 8h" defaultExpanded={false}>
                      <div className="veinsMcCollapsibleContent">
                        {renderMcBoxplots(rows, minTotal, spanTotal)}
                      </div>
                    </Collapsible>
                    <Collapsible id="veins-mc-sit-per-hour" title="Per-hour values (from 8h simulation)" defaultExpanded={false}>
                      <div className="veinsMcCollapsibleContent">
                        {renderMcBoxplots(rowsPerHour, minTotalPh, spanTotalPh)}
                      </div>
                    </Collapsible>
                  </div>
                );
              })()}
            </div>
          </Collapsible>
        </section>
        </div>
      </div>

      {mcChartFloor != null && mcState.results &&
        createPortal(
          <div
            className="modalOverlay"
            onMouseDown={() => setMcChartFloor(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="veins-per-vein-modal-title"
          >
            <div className="modalWindow" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHeader">
                <div>
                  <div id="veins-per-vein-modal-title" className="mono" style={{ fontWeight: 900 }}>
                    Per-vein — Floor {mcChartFloor} (mean over {mcState.results.runs} runs)
                  </div>
                  <div className="small">Mean veins per hour from MC simulation.</div>
                </div>
                <button className="btn btnSecondary" type="button" onClick={() => setMcChartFloor(null)}>
                  Close
                </button>
              </div>
              <div className="modalBody">
                {(() => {
                  const floorData = mcState.results.byFloor.find((f) => f.floor === mcChartFloor);
                  if (!floorData?.byTypeSamples?.length) return null;
                  const HOURS = 8;
                  const runs = mcState.results.runs;
                  const withMean = floorData.byTypeSamples.map(({ vein, samples }) => {
                    const sum = samples.reduce((a, b) => a + b, 0);
                    const mean8h = sum / runs;
                    const meanPerHour = mean8h / HOURS;
                    const variance = runs > 0 ? samples.reduce((acc, x) => acc + (x - mean8h) ** 2, 0) / runs : 0;
                    const sd8h = Math.sqrt(variance);
                    const sdPerHour = sd8h / HOURS;
                    return { vein, meanPerHour, sdPerHour };
                  });
                  withMean.sort((a, b) => b.meanPerHour - a.meanPerHour);
                  const maxVph = withMean[0]?.meanPerHour ?? 1;
                  return (
                    <div className="veinsResultChartBars veinsMcPerVeinChartBars">
                      {withMean.map(({ vein, meanPerHour, sdPerHour }) => {
                        const pct = maxVph > 0 ? (meanPerHour / maxVph) * 100 : 0;
                        return (
                          <div
                            key={vein.id}
                            className="veinsChartRow"
                            title={`${vein.name}: ${meanPerHour.toFixed(2)} ± ${sdPerHour.toFixed(2)} veins/h (mean ± SD from MC)`}
                          >
                            <img src={veinIconUrl(vein.iconFile)} alt="" className="veinsChartIcon" width={28} height={28} loading="lazy" />
                            <span className="veinsChartName">{vein.name}</span>
                            <div className="veinsChartBarWrap">
                              <div className="veinsChartBar" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="veinsChartValue mono" title={`${meanPerHour.toFixed(2)} ± ${sdPerHour.toFixed(2)}`}>
                              {formatCompact(meanPerHour)} ± {formatCompact(sdPerHour)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>,
          document.body
        )}

      {mcSitChartFloor != null && mcSitState.results &&
        createPortal(
          <div
            className="modalOverlay"
            onMouseDown={() => setMcSitChartFloor(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="veins-sit-per-vein-modal-title"
          >
            <div className="modalWindow" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHeader">
                <div>
                  <div id="veins-sit-per-vein-modal-title" className="mono" style={{ fontWeight: 900 }}>
                    Sit on floor — Per-vein Floor {mcSitChartFloor} (mean over {mcSitState.results.runs} runs)
                  </div>
                  <div className="small">Mean veins per hour from MC simulation.</div>
                </div>
                <button className="btn btnSecondary" type="button" onClick={() => setMcSitChartFloor(null)}>
                  Close
                </button>
              </div>
              <div className="modalBody">
                {(() => {
                  const floorData = mcSitState.results.byFloor.find((f) => f.floor === mcSitChartFloor);
                  if (!floorData?.byTypeSamples?.length) return null;
                  const HOURS = 8;
                  const runs = mcSitState.results.runs;
                  const withMean = floorData.byTypeSamples.map(({ vein, samples }) => {
                    const sum = samples.reduce((a, b) => a + b, 0);
                    const mean8h = sum / runs;
                    const meanPerHour = mean8h / HOURS;
                    const variance = runs > 0 ? samples.reduce((acc, x) => acc + (x - mean8h) ** 2, 0) / runs : 0;
                    const sd8h = Math.sqrt(variance);
                    const sdPerHour = sd8h / HOURS;
                    return { vein, meanPerHour, sdPerHour };
                  });
                  withMean.sort((a, b) => b.meanPerHour - a.meanPerHour);
                  const maxVph = withMean[0]?.meanPerHour ?? 1;
                  return (
                    <div className="veinsResultChartBars veinsMcPerVeinChartBars">
                      {withMean.map(({ vein, meanPerHour, sdPerHour }) => {
                        const pct = maxVph > 0 ? (meanPerHour / maxVph) * 100 : 0;
                        return (
                          <div
                            key={vein.id}
                            className="veinsChartRow"
                            title={`${vein.name}: ${meanPerHour.toFixed(2)} ± ${sdPerHour.toFixed(2)} veins/h (mean ± SD from MC)`}
                          >
                            <img src={veinIconUrl(vein.iconFile)} alt="" className="veinsChartIcon" width={28} height={28} loading="lazy" />
                            <span className="veinsChartName">{vein.name}</span>
                            <div className="veinsChartBarWrap">
                              <div className="veinsChartBar" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="veinsChartValue mono" title={`${meanPerHour.toFixed(2)} ± ${sdPerHour.toFixed(2)}`}>
                              {formatCompact(meanPerHour)} ± {formatCompact(sdPerHour)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
