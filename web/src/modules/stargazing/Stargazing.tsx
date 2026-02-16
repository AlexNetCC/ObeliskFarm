import { useEffect, useMemo, useState } from "react";
import "./stargazing.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
import { assetUrl } from "../../lib/assets";
import { loadJson, saveJson } from "../../lib/storage";
import { StargazingCalculator, type PlayerStats } from "../../lib/stargazing/calculator";

/** Horizontal bar chart for one of Stars or Super Stars: label, bar (width = % of total), value. */
function StatsContribChart(props: {
  title: string;
  total: number;
  rows: { label: string; value: number; color: string }[];
  fmt: (x: number) => string;
}) {
  const { title, total, rows, fmt } = props;
  const maxVal = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="sgStatsContribBlock">
      <div className="sgStatsContribTitle">{title}</div>
      <div className="sgStatsContribBars" role="img" aria-label={`${title} contributions bar chart`}>
        {rows.map(({ label, value, color }) => {
          const pct = total > 0 ? (value / total) * 100 : 0;
          const widthPct = maxVal > 0 ? (value / maxVal) * 100 : 0;
          return (
            <div key={label} className="sgStatsContribRow">
              <span className="sgStatsContribLabel">{label}</span>
              <div className="sgStatsContribBarTrack">
                <div
                  className="sgStatsContribBarFill"
                  style={{ width: `${widthPct}%`, backgroundColor: color }}
                />
              </div>
              <span className="mono sgStatsContribValue" title={`${fmt(value)}/h (${pct.toFixed(1)}%)`}>
                {fmt(value)}
                <span className="sgStatsContribPct"> ({pct.toFixed(1)}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type UiStats = {
  floor_clears_per_minute: number;
  star_spawn_rate_mult: number;
  auto_catch_chance: number; // %
  double_star_chance: number; // %
  triple_star_chance: number; // %
  super_star_spawn_rate_mult: number;
  triple_super_star_chance: number; // %
  super_star_10x_chance: number; // %
  star_supernova_chance: number; // %
  star_supernova_mult: number;
  star_supergiant_chance: number; // %
  star_supergiant_mult: number;
  star_radiant_chance: number; // %
  star_radiant_mult: number;
  super_star_supernova_chance: number; // %
  super_star_supernova_mult: number;
  super_star_supergiant_chance: number; // %
  super_star_supergiant_mult: number;
  super_star_radiant_chance: number; // %
  super_star_radiant_mult: number;
  all_star_mult: number;
  novagiant_combo_mult: number;
};

/** 2× Star Spawn Rate buff icon (Elixir/Lootbug/Founder). */
const ICON_2X_STAR_SPAWN = "https://static.wikitide.net/shminerwiki/5/5b/2x_Spawn_Rate_Buff.png";

/** Star card ids that have sprites in sprites/stargazing (from main Python/assets). */
const STAR_CARD_IDS = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio",
  "sagittarius", "capricorn", "aquarius", "pisces",
  "ophiuchus", "cetus", "draco", "eridanus", "hercules", "orion", "phoenix",
] as const;

/** Card tier: 0 = none, 1 = standard, 2 = gilded, 3 = polychrome, 4 = infernal */
export type StarCardTier = 0 | 1 | 2 | 3 | 4;

type StarCardsState = {
  happy_bot_rank: number; // 0 = none, 1–10
  polychrome_bundle: boolean; // Polychrome Potency Bundle 1.15x
  infernal_bonus: number; // Infernal bonus multiplier (e.g. 8.92 for 8.92x)
  /** Per-card tier (which card variant you have). */
  card_tier: Record<string, StarCardTier>;
  /** Which star's results to show (card id or null = base). */
  /** Which star's results to show (card id; default Aries). */
  selected_card_for_results: string;
};

type SavedStateV1 = {
  stats: Partial<UiStats>;
  ctrl_f_stars_enabled: boolean;
  spoon_strat?: boolean;
  catch_manually?: boolean;
  star_cards?: Partial<StarCardsState>;
};

const STORAGE_KEY = "obeliskfarm:web:stargazing_save.json:v1";
const STARGAZING_EXTERNAL_KEY = "obeliskfarm:web:stargazing_external.json";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replaceAll(",", ".").replaceAll(" ", "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function endsWithDecimalSeparator(raw: string): boolean {
  const t = raw.trim();
  return t.endsWith(".") || t.endsWith(",");
}

function fmt4(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(4);
}

function fmt0(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toString();
}

function fmt1(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

/** Tier toggles: Card / Gilded / Poly / Infernal. No "None" – nothing checked = no tier. */
function StarCardTierToggles(props: {
  value: StarCardTier;
  onChange: (tier: StarCardTier) => void;
}) {
  const { value, onChange } = props;
  const cur = value;
  const mk = (tier: 1 | 2 | 3 | 4, label: string) => (
    <button
      type="button"
      className={`btn btnSecondary sgCardTierBtn ${cur === tier ? "cardBtnActive" : ""}`}
      onClick={() => onChange(cur === tier ? 0 : tier)}
    >
      {label} {cur === tier ? "✓" : ""}
    </button>
  );
  return (
    <div className="sgCardTierRow">
      {mk(1, "Card")}
      {mk(2, "Gilded")}
      {mk(3, "Poly")}
      {mk(4, "Infernal")}
    </div>
  );
}

function Sprite(props: { paths: string[]; alt: string; className?: string; label?: string }) {
  const { paths, alt, className, label } = props;
  const [idx, setIdx] = useState(0);
  const path = paths[idx] ?? null;
  if (!path) return <span className="iconPlaceholder" title={`Missing sprite: ${label ?? alt}`}>?</span>;
  return (
    <img
      className={className ?? "icon"}
      src={assetUrl(path)}
      alt={alt}
      title={alt}
      onError={() => setIdx((s) => (s + 1 < paths.length ? s + 1 : s))}
    />
  );
}

function Stepper(props: {
  label: React.ReactNode;
  spritePaths?: string[];
  spriteAlt?: string;
  spriteLabel?: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  inputMode?: "decimal" | "numeric";
  decimals?: number;
}) {
  const {
    label,
    spritePaths,
    spriteAlt,
    spriteLabel,
    value,
    onChange,
    step = 1,
    min = -Infinity,
    max = Infinity,
    inputMode = "decimal",
    decimals = 2,
  } = props;
  const [raw, setRaw] = useState<string>(Number.isFinite(value) ? String(value) : "");

  // Keep input in sync when value changes via external state updates.
  useEffect(() => {
    setRaw(Number.isFinite(value) ? String(value) : "");
  }, [value]);

  function commitFromRaw(nextRaw: string) {
    const trimmed = nextRaw.trim();
    // If user clears the input, treat it as 0 (consistent & predictable).
    if (!trimmed) {
      const v0 = clamp(0, min, max);
      onChange(v0);
      setRaw(String(v0));
      return;
    }
    const parsed = parseNumber(nextRaw);
    if (parsed === null) {
      // Revert to last valid value.
      setRaw(Number.isFinite(value) ? String(value) : "");
      return;
    }
    const v = clamp(parsed, min, max);
    onChange(v);
    setRaw(String(v));
  }

  return (
    <div className="sgRow">
      <div className="sgLabelLeft">
        {spritePaths?.length ? (
          <Sprite paths={spritePaths} alt={spriteAlt ?? String(label)} className="iconSmall" label={spriteLabel ?? spriteAlt ?? ""} />
        ) : null}
        <span className="sgLabelName">{label}</span>
      </div>
      <div className="sgInputWrap">
        <input
          className="input"
          inputMode={inputMode}
          value={raw}
          onChange={(e) => {
            const nextRaw = e.target.value;
            setRaw(nextRaw);
            // Let the user type "1." / "0," without immediately collapsing it to "1".
            if (endsWithDecimalSeparator(nextRaw)) return;
            const parsed = parseNumber(nextRaw);
            if (parsed === null) return;
            onChange(clamp(parsed, min, max));
          }}
          onBlur={() => commitFromRaw(raw)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
        />
      </div>
    </div>
  );
}

function defaultUiStats(): UiStats {
  return {
    floor_clears_per_minute: 48, // 48/min fixed default; ~1.25 bombs/min
    star_spawn_rate_mult: 1.0,
    auto_catch_chance: 0.0,
    double_star_chance: 0.0,
    triple_star_chance: 0.0,
    super_star_spawn_rate_mult: 1.0,
    triple_super_star_chance: 0.0,
    super_star_10x_chance: 0.0,
    star_supernova_chance: 0.0,
    star_supernova_mult: 10.0,
    star_supergiant_chance: 0.0,
    star_supergiant_mult: 3.0,
    star_radiant_chance: 0.0,
    star_radiant_mult: 10.0,
    super_star_supernova_chance: 0.0,
    super_star_supernova_mult: 10.0,
    super_star_supergiant_chance: 0.0,
    super_star_supergiant_mult: 3.0,
    super_star_radiant_chance: 0.0,
    super_star_radiant_mult: 10.0,
    all_star_mult: 1.0,
    novagiant_combo_mult: 1.0,
  };
}

export function Stargazing() {
  const defaultStarCards = (): StarCardsState => ({
    happy_bot_rank: 0,
    polychrome_bundle: false,
    infernal_bonus: 1,
    card_tier: {},
    selected_card_for_results: "aries",
  });

  /** Card multiplier for star gain. Same tier structure for all cards (Aries values; others may differ in-game). */
  function getCardMultiplier(cardId: string, tier: StarCardTier): number {
    if (tier === 0) return 1;
    const { happy_bot_rank, polychrome_bundle, infernal_bonus } = starCards;
    switch (tier) {
      case 1:
        return 1.5; // Card: e.g. Aries Star Gain 1.50×
      case 2:
        return 2; // Gilded: 2×
      case 3: {
        // Polychrome: 4×–6.62×; Happy Bot +2% per rank; bundle ×1.15
        const base = 4;
        const happyMult = 1 + 0.02 * happy_bot_rank; // +2% per rank
        const bundleMult = polychrome_bundle ? 1.15 : 1;
        return base * happyMult * bundleMult;
      }
      case 4: {
        // Infernal: TotalMultiplier = 1 + (PolyBonus − 1) × InfernalBonus.
        const polyBonus = getCardMultiplier(cardId, 3);
        return 1 + (polyBonus - 1) * infernal_bonus;
      }
      default:
        return 1;
    }
  }

  const initial = useMemo(() => {
    const base = defaultUiStats();
    const saved = loadJson<SavedStateV1>(STORAGE_KEY);
    const merged: UiStats = { ...base, ...(saved?.stats ?? {}) };
    const ctrl_f_stars_enabled = saved?.ctrl_f_stars_enabled ?? false;
    const spoon_strat = saved?.spoon_strat ?? false;
    const catch_manually = saved?.catch_manually ?? false;
    const star_cards: StarCardsState = {
      ...defaultStarCards(),
      ...(saved?.star_cards ?? {}),
      selected_card_for_results: saved?.star_cards?.selected_card_for_results ?? "aries",
    };
    return { stats: merged, ctrl_f_stars_enabled, spoon_strat, catch_manually, star_cards };
  }, []);

  const [ui, setUi] = useState<UiStats>(initial.stats);
  const [ctrlF, setCtrlF] = useState<boolean>(initial.ctrl_f_stars_enabled);
  const [spoonStrat, setSpoonStrat] = useState<boolean>(initial.spoon_strat);
  const [catchManually, setCatchManually] = useState<boolean>(initial.catch_manually ?? false);
  const [starCards, setStarCards] = useState<StarCardsState>(initial.star_cards);
  const [resetArmed, setResetArmed] = useState(false);

  function confirmDanger(message: string): boolean {
    try {
      return window.confirm(message);
    } catch {
      return false;
    }
  }

  // autosave (matches other web modules; close to desktop intent)
  useEffect(() => {
    const t = window.setTimeout(() => {
      const payload: SavedStateV1 = { stats: ui, ctrl_f_stars_enabled: ctrlF, spoon_strat: spoonStrat, catch_manually: catchManually, star_cards: starCards };
      saveJson(STORAGE_KEY, payload);
    }, 250);
    return () => window.clearTimeout(t);
  }, [ui, ctrlF, spoonStrat, catchManually, starCards]);

  useEffect(() => {
    if (!resetArmed) return;
    const t = window.setTimeout(() => setResetArmed(false), 4500);
    return () => window.clearTimeout(t);
  }, [resetArmed]);

  /** Force re-render and invalidate memos after Starburst toggle so results update. */
  const [starburstToggleRefresh, setStarburstToggleRefresh] = useState(0);

  /** 2× Star Spawn Rate: Elixir (Drone) + Lootbug (incl. Golden) + Founder Supply Drop. Same buff; durations add (e.g. 3+5+2 = 10 min/h → 1/6 uptime). 3× Super Star from Drone Elixir only. Starburst Drone not included: enter its effects manually in Your stats to avoid double-counting. */
  const droneBuffs = useMemo(() => {
    const sg = loadJson<{
      elixir2xStarMinPerHour?: number;
      drone3xSuperUptimeFraction?: number;
      founderSupplyDrop2xStarMinPerHour?: number;
      founderSupplyDropAutoCatch100MinPerHour?: number;
      starburstDroneOn?: boolean;
      starburstTripleStarChancePct?: number;
      starburstStarSpawnRateUptimeFraction?: number;
      starburstStarSpawnRatePct?: number;
      starburstAutoCatch100MinPerHour?: number;
    }>(STARGAZING_EXTERNAL_KEY);
    const gemev = loadJson<{ lootbug2xStarMinPerHour?: number }>(GEMEV_EXTERNAL_KEY);
    const elixirMin = typeof sg?.elixir2xStarMinPerHour === "number" ? Math.max(0, sg.elixir2xStarMinPerHour) : 0;
    const lootbugMin = typeof gemev?.lootbug2xStarMinPerHour === "number" ? Math.max(0, gemev.lootbug2xStarMinPerHour) : 0;
    const founder2xMin = typeof sg?.founderSupplyDrop2xStarMinPerHour === "number" ? Math.max(0, sg.founderSupplyDrop2xStarMinPerHour) : 0;
    const total2xStarMinPerHour = elixirMin + lootbugMin + founder2xMin;
    const total2xUptimeFraction = Math.min(1, total2xStarMinPerHour / 60);
    const founderAutoCatchMin = typeof sg?.founderSupplyDropAutoCatch100MinPerHour === "number" ? Math.max(0, sg.founderSupplyDropAutoCatch100MinPerHour) : 0;
    return {
      total2xStarMinPerHour,
      total2xUptimeFraction,
      drone3xSuperUptimeFraction: typeof sg?.drone3xSuperUptimeFraction === "number" ? Math.min(1, Math.max(0, sg.drone3xSuperUptimeFraction)) : 0,
      founderSupplyDropAutoCatch100MinPerHour: Math.min(60, founderAutoCatchMin),
      founderOnlyAutoCatch100MinPerHour: founderAutoCatchMin,
      starburstTripleStarChancePct: 0,
      starburstStarSpawnRateUptimeFraction: 0,
      starburstStarSpawnRatePct: 0,
      starburstAutoCatch100MinPerHour: 0,
    };
  }, [starburstToggleRefresh]);

  /** For Offline Gains: no external buffs (game is closed; Lootbug, Founder, Elixir, Starburst do not apply). */
  const droneBuffsOffline = useMemo(() => ({
    total2xStarMinPerHour: 0,
    total2xUptimeFraction: 0,
    drone3xSuperUptimeFraction: 0,
    founderSupplyDropAutoCatch100MinPerHour: 0,
    founderOnlyAutoCatch100MinPerHour: 0,
    starburstTripleStarChancePct: 0,
    starburstStarSpawnRateUptimeFraction: 0,
    starburstStarSpawnRatePct: 0,
    starburstAutoCatch100MinPerHour: 0,
  }), []);

  /** For Online AFK: only Elixir (no Lootbug, no Founder, no Starburst). */
  const droneBuffsOnlineAfk = useMemo(() => {
    const sg = loadJson<{
      elixir2xStarMinPerHour?: number;
      drone3xSuperUptimeFraction?: number;
    }>(STARGAZING_EXTERNAL_KEY);
    const elixirMin = typeof sg?.elixir2xStarMinPerHour === "number" ? Math.max(0, sg.elixir2xStarMinPerHour) : 0;
    const total2xUptimeFraction = Math.min(1, elixirMin / 60);
    return {
      total2xStarMinPerHour: elixirMin,
      total2xUptimeFraction,
      drone3xSuperUptimeFraction: typeof sg?.drone3xSuperUptimeFraction === "number" ? Math.min(1, Math.max(0, sg.drone3xSuperUptimeFraction)) : 0,
      founderSupplyDropAutoCatch100MinPerHour: 0,
      founderOnlyAutoCatch100MinPerHour: 0,
      starburstTripleStarChancePct: 0,
      starburstStarSpawnRateUptimeFraction: 0,
      starburstStarSpawnRatePct: 0,
      starburstAutoCatch100MinPerHour: 0,
    };
  }, [starburstToggleRefresh]);

  const hasStarburst = droneBuffs.starburstTripleStarChancePct > 0 || droneBuffs.starburstStarSpawnRateUptimeFraction > 0 || droneBuffs.starburstAutoCatch100MinPerHour > 0;

  const stats = useMemo<PlayerStats>(() => {
    const effectiveFloorsPerMin = clamp(ui.floor_clears_per_minute, 0, 1_000_000) * (spoonStrat ? 1.2 : 1);
    const floor_clears_per_hour = effectiveFloorsPerMin * 60.0;
    const baseStarMult = clamp(ui.star_spawn_rate_mult, 0, 1_000_000);
    const baseSuperMult = clamp(ui.super_star_spawn_rate_mult, 0, 1_000_000);
    const starburstStarMult = 1 + droneBuffs.starburstStarSpawnRateUptimeFraction * (droneBuffs.starburstStarSpawnRatePct / 100);
    const star_spawn_rate_mult = baseStarMult * (1 + droneBuffs.total2xUptimeFraction) * starburstStarMult;
    const super_star_spawn_rate_mult = baseSuperMult * (1 + 2 * droneBuffs.drone3xSuperUptimeFraction);
    const autoCatchBase = clamp(ui.auto_catch_chance, 0, 100) / 100;
    const founderAutoCatchMin = Math.min(60, droneBuffs.founderSupplyDropAutoCatch100MinPerHour);
    const auto_catch_chance = (autoCatchBase * Math.max(0, 60 - founderAutoCatchMin) + founderAutoCatchMin) / 60;
    const tripleStarBasePct = clamp(ui.triple_star_chance, 0, 100);
    const triple_star_chance = Math.min(1, (tripleStarBasePct + droneBuffs.starburstTripleStarChancePct) / 100);
    return {
      floor_clears_per_hour,
      star_spawn_rate_mult,
      auto_catch_chance,
      double_star_chance: clamp(ui.double_star_chance, 0, 100) / 100,
      triple_star_chance,
      super_star_spawn_rate_mult,
      triple_super_star_chance: clamp(ui.triple_super_star_chance, 0, 100) / 100,
      super_star_10x_chance: clamp(ui.super_star_10x_chance, 0, 100) / 100,
      star_supernova_chance: clamp(ui.star_supernova_chance, 0, 100) / 100,
      star_supernova_mult: clamp(ui.star_supernova_mult, 0, 1_000_000),
      star_supergiant_chance: clamp(ui.star_supergiant_chance, 0, 100) / 100,
      star_supergiant_mult: clamp(ui.star_supergiant_mult, 0, 1_000_000),
      star_radiant_chance: clamp(ui.star_radiant_chance, 0, 100) / 100,
      star_radiant_mult: clamp(ui.star_radiant_mult, 0, 1_000_000),
      super_star_supernova_chance: clamp(ui.super_star_supernova_chance, 0, 100) / 100,
      super_star_supernova_mult: clamp(ui.super_star_supernova_mult, 0, 1_000_000),
      super_star_supergiant_chance: clamp(ui.super_star_supergiant_chance, 0, 100) / 100,
      super_star_supergiant_mult: clamp(ui.super_star_supergiant_mult, 0, 1_000_000),
      super_star_radiant_chance: clamp(ui.super_star_radiant_chance, 0, 100) / 100,
      super_star_radiant_mult: clamp(ui.super_star_radiant_mult, 0, 1_000_000),
      all_star_mult: clamp(ui.all_star_mult, 0, 1_000_000),
      novagiant_combo_mult: clamp(ui.novagiant_combo_mult, 0, 1_000_000),
      ctrl_f_stars_enabled: ctrlF,
    };
  }, [ui, ctrlF, spoonStrat, droneBuffs.total2xUptimeFraction, droneBuffs.drone3xSuperUptimeFraction, droneBuffs.founderSupplyDropAutoCatch100MinPerHour, droneBuffs.starburstTripleStarChancePct, droneBuffs.starburstStarSpawnRateUptimeFraction, droneBuffs.starburstStarSpawnRatePct, starburstToggleRefresh]);

  /** Stats for Online AFK: same as online (spoon applies) but only Elixir + Starburst (no Lootbug, no Founder). */
  const statsOnlineAfk = useMemo<PlayerStats>(() => {
    const effectiveFloorsPerMin = clamp(ui.floor_clears_per_minute, 0, 1_000_000) * (spoonStrat ? 1.2 : 1);
    const floor_clears_per_hour = effectiveFloorsPerMin * 60.0;
    const baseStarMult = clamp(ui.star_spawn_rate_mult, 0, 1_000_000);
    const baseSuperMult = clamp(ui.super_star_spawn_rate_mult, 0, 1_000_000);
    const starburstStarMult = 1 + droneBuffsOnlineAfk.starburstStarSpawnRateUptimeFraction * (droneBuffsOnlineAfk.starburstStarSpawnRatePct / 100);
    const star_spawn_rate_mult = baseStarMult * (1 + droneBuffsOnlineAfk.total2xUptimeFraction) * starburstStarMult;
    const super_star_spawn_rate_mult = baseSuperMult * (1 + 2 * droneBuffsOnlineAfk.drone3xSuperUptimeFraction);
    const autoCatchBase = clamp(ui.auto_catch_chance, 0, 100) / 100;
    const founderAutoCatchMin = Math.min(60, droneBuffsOnlineAfk.founderSupplyDropAutoCatch100MinPerHour);
    const auto_catch_chance = (autoCatchBase * Math.max(0, 60 - founderAutoCatchMin) + founderAutoCatchMin) / 60;
    const triple_star_chance = Math.min(1, (clamp(ui.triple_star_chance, 0, 100) + droneBuffsOnlineAfk.starburstTripleStarChancePct) / 100);
    return {
      floor_clears_per_hour,
      star_spawn_rate_mult,
      auto_catch_chance,
      double_star_chance: clamp(ui.double_star_chance, 0, 100) / 100,
      triple_star_chance,
      super_star_spawn_rate_mult,
      triple_super_star_chance: clamp(ui.triple_super_star_chance, 0, 100) / 100,
      super_star_10x_chance: clamp(ui.super_star_10x_chance, 0, 100) / 100,
      star_supernova_chance: clamp(ui.star_supernova_chance, 0, 100) / 100,
      star_supernova_mult: clamp(ui.star_supernova_mult, 0, 1_000_000),
      star_supergiant_chance: clamp(ui.star_supergiant_chance, 0, 100) / 100,
      star_supergiant_mult: clamp(ui.star_supergiant_mult, 0, 1_000_000),
      star_radiant_chance: clamp(ui.star_radiant_chance, 0, 100) / 100,
      star_radiant_mult: clamp(ui.star_radiant_mult, 0, 1_000_000),
      super_star_supernova_chance: clamp(ui.super_star_supernova_chance, 0, 100) / 100,
      super_star_supernova_mult: clamp(ui.super_star_supernova_mult, 0, 1_000_000),
      super_star_supergiant_chance: clamp(ui.super_star_supergiant_chance, 0, 100) / 100,
      super_star_supergiant_mult: clamp(ui.super_star_supergiant_mult, 0, 1_000_000),
      super_star_radiant_chance: clamp(ui.super_star_radiant_chance, 0, 100) / 100,
      super_star_radiant_mult: clamp(ui.super_star_radiant_mult, 0, 1_000_000),
      all_star_mult: clamp(ui.all_star_mult, 0, 1_000_000),
      novagiant_combo_mult: clamp(ui.novagiant_combo_mult, 0, 1_000_000),
      ctrl_f_stars_enabled: ctrlF,
    };
  }, [ui, ctrlF, spoonStrat, droneBuffsOnlineAfk.total2xUptimeFraction, droneBuffsOnlineAfk.drone3xSuperUptimeFraction, droneBuffsOnlineAfk.founderSupplyDropAutoCatch100MinPerHour, droneBuffsOnlineAfk.starburstTripleStarChancePct, droneBuffsOnlineAfk.starburstStarSpawnRateUptimeFraction, droneBuffsOnlineAfk.starburstStarSpawnRatePct, starburstToggleRefresh]);

  /** Stats for Offline Gains: no spoon strat, no external buffs (Lootbug, Founder, Elixir, Starburst off). */
  const statsOffline = useMemo<PlayerStats>(() => {
    const floor_clears_per_hour = clamp(ui.floor_clears_per_minute, 0, 1_000_000) * 60.0;
    const baseStarMult = clamp(ui.star_spawn_rate_mult, 0, 1_000_000);
    const baseSuperMult = clamp(ui.super_star_spawn_rate_mult, 0, 1_000_000);
    const starburstStarMult = 1 + droneBuffsOffline.starburstStarSpawnRateUptimeFraction * (droneBuffsOffline.starburstStarSpawnRatePct / 100);
    const star_spawn_rate_mult = baseStarMult * (1 + droneBuffsOffline.total2xUptimeFraction) * starburstStarMult;
    const super_star_spawn_rate_mult = baseSuperMult * (1 + 2 * droneBuffsOffline.drone3xSuperUptimeFraction);
    const autoCatchBase = clamp(ui.auto_catch_chance, 0, 100) / 100;
    const founderAutoCatchMin = Math.min(60, droneBuffsOffline.founderSupplyDropAutoCatch100MinPerHour);
    const auto_catch_chance = (autoCatchBase * Math.max(0, 60 - founderAutoCatchMin) + founderAutoCatchMin) / 60;
    const triple_star_chance = Math.min(1, (clamp(ui.triple_star_chance, 0, 100) + droneBuffsOffline.starburstTripleStarChancePct) / 100);
    return {
      floor_clears_per_hour,
      star_spawn_rate_mult,
      auto_catch_chance,
      double_star_chance: clamp(ui.double_star_chance, 0, 100) / 100,
      triple_star_chance,
      super_star_spawn_rate_mult,
      triple_super_star_chance: clamp(ui.triple_super_star_chance, 0, 100) / 100,
      super_star_10x_chance: clamp(ui.super_star_10x_chance, 0, 100) / 100,
      star_supernova_chance: clamp(ui.star_supernova_chance, 0, 100) / 100,
      star_supernova_mult: clamp(ui.star_supernova_mult, 0, 1_000_000),
      star_supergiant_chance: clamp(ui.star_supergiant_chance, 0, 100) / 100,
      star_supergiant_mult: clamp(ui.star_supergiant_mult, 0, 1_000_000),
      star_radiant_chance: clamp(ui.star_radiant_chance, 0, 100) / 100,
      star_radiant_mult: clamp(ui.star_radiant_mult, 0, 1_000_000),
      super_star_supernova_chance: clamp(ui.super_star_supernova_chance, 0, 100) / 100,
      super_star_supernova_mult: clamp(ui.super_star_supernova_mult, 0, 1_000_000),
      super_star_supergiant_chance: clamp(ui.super_star_supergiant_chance, 0, 100) / 100,
      super_star_supergiant_mult: clamp(ui.super_star_supergiant_mult, 0, 1_000_000),
      super_star_radiant_chance: clamp(ui.super_star_radiant_chance, 0, 100) / 100,
      super_star_radiant_mult: clamp(ui.super_star_radiant_mult, 0, 1_000_000),
      all_star_mult: clamp(ui.all_star_mult, 0, 1_000_000),
      novagiant_combo_mult: clamp(ui.novagiant_combo_mult, 0, 1_000_000),
      ctrl_f_stars_enabled: ctrlF,
    };
  }, [ui, ctrlF, droneBuffsOffline.total2xUptimeFraction, droneBuffsOffline.drone3xSuperUptimeFraction, droneBuffsOffline.founderSupplyDropAutoCatch100MinPerHour, droneBuffsOffline.starburstTripleStarChancePct, droneBuffsOffline.starburstStarSpawnRateUptimeFraction, droneBuffsOffline.starburstStarSpawnRatePct, ui.floor_clears_per_minute]);

  /** Stats with Starburst contributions zeroed (for Drone module to show +% gain). */
  const statsWithoutStarburst = useMemo<PlayerStats>(() => {
    const effectiveFloorsPerMin = clamp(ui.floor_clears_per_minute, 0, 1_000_000) * (spoonStrat ? 1.2 : 1);
    const floor_clears_per_hour = effectiveFloorsPerMin * 60.0;
    const baseStarMult = clamp(ui.star_spawn_rate_mult, 0, 1_000_000);
    const baseSuperMult = clamp(ui.super_star_spawn_rate_mult, 0, 1_000_000);
    const star_spawn_rate_mult = baseStarMult * (1 + droneBuffs.total2xUptimeFraction);
    const super_star_spawn_rate_mult = baseSuperMult * (1 + 2 * droneBuffs.drone3xSuperUptimeFraction);
    const autoCatchBase = clamp(ui.auto_catch_chance, 0, 100) / 100;
    const founderOnlyMin = Math.min(60, droneBuffs.founderOnlyAutoCatch100MinPerHour);
    const auto_catch_chance = (autoCatchBase * Math.max(0, 60 - founderOnlyMin) + founderOnlyMin) / 60;
    const triple_star_chance = clamp(ui.triple_star_chance, 0, 100) / 100;
    return {
      floor_clears_per_hour,
      star_spawn_rate_mult,
      auto_catch_chance,
      double_star_chance: clamp(ui.double_star_chance, 0, 100) / 100,
      triple_star_chance,
      super_star_spawn_rate_mult,
      triple_super_star_chance: clamp(ui.triple_super_star_chance, 0, 100) / 100,
      super_star_10x_chance: clamp(ui.super_star_10x_chance, 0, 100) / 100,
      star_supernova_chance: clamp(ui.star_supernova_chance, 0, 100) / 100,
      star_supernova_mult: clamp(ui.star_supernova_mult, 0, 1_000_000),
      star_supergiant_chance: clamp(ui.star_supergiant_chance, 0, 100) / 100,
      star_supergiant_mult: clamp(ui.star_supergiant_mult, 0, 1_000_000),
      star_radiant_chance: clamp(ui.star_radiant_chance, 0, 100) / 100,
      star_radiant_mult: clamp(ui.star_radiant_mult, 0, 1_000_000),
      super_star_supernova_chance: clamp(ui.super_star_supernova_chance, 0, 100) / 100,
      super_star_supernova_mult: clamp(ui.super_star_supernova_mult, 0, 1_000_000),
      super_star_supergiant_chance: clamp(ui.super_star_supergiant_chance, 0, 100) / 100,
      super_star_supergiant_mult: clamp(ui.super_star_supergiant_mult, 0, 1_000_000),
      super_star_radiant_chance: clamp(ui.super_star_radiant_chance, 0, 100) / 100,
      super_star_radiant_mult: clamp(ui.super_star_radiant_mult, 0, 1_000_000),
      all_star_mult: clamp(ui.all_star_mult, 0, 1_000_000),
      novagiant_combo_mult: clamp(ui.novagiant_combo_mult, 0, 1_000_000),
      ctrl_f_stars_enabled: ctrlF,
    };
  }, [ui, ctrlF, spoonStrat, droneBuffs.total2xUptimeFraction, droneBuffs.drone3xSuperUptimeFraction, droneBuffs.founderOnlyAutoCatch100MinPerHour, starburstToggleRefresh]);

  const summary = useMemo(() => {
    const calc = new StargazingCalculator(stats);
    return calc.get_summary();
  }, [stats]);

  const summaryOffline = useMemo(() => {
    const calc = new StargazingCalculator(statsOffline);
    return calc.get_summary();
  }, [statsOffline]);

  const summaryOnlineAfk = useMemo(() => {
    const calc = new StargazingCalculator(statsOnlineAfk);
    return calc.get_summary();
  }, [statsOnlineAfk]);

  const summaryWithoutStarburst = useMemo(() => {
    const calc = new StargazingCalculator(statsWithoutStarburst);
    return calc.get_summary();
  }, [statsWithoutStarburst]);

  /** Write total 2× Star min/h so Drone can compute Bomb Bear star gains impact. */
  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(STARGAZING_EXTERNAL_KEY) ?? {};
    ext.total2xStarMinPerHour = droneBuffs.total2xStarMinPerHour;
    saveJson(STARGAZING_EXTERNAL_KEY, ext);
  }, [droneBuffs.total2xStarMinPerHour]);

  /** Write stars/h and super stars/h (Offline Gains, no spoon) with and without Starburst to external so Drone can show +% gain. */
  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(STARGAZING_EXTERNAL_KEY) ?? {};
    ext.stargazingStarsPerHourOnline = summary.stars_per_hour_online;
    ext.stargazingStarsPerHourOffline = summaryOffline.stars_per_hour_offline_gains;
    ext.stargazingSuperStarsPerHourOffline = summaryOffline.super_stars_per_hour_offline_gains;
    if (hasStarburst) {
      ext.stargazingStarsPerHourOnlineWithoutStarburst = summaryWithoutStarburst.stars_per_hour_online;
      ext.stargazingStarsPerHourOfflineWithoutStarburst = summaryOffline.stars_per_hour_offline_gains;
      ext.stargazingSuperStarsPerHourOfflineWithoutStarburst = summaryOffline.super_stars_per_hour_offline_gains;
    } else {
      ext.stargazingStarsPerHourOnlineWithoutStarburst = summary.stars_per_hour_online;
      ext.stargazingStarsPerHourOfflineWithoutStarburst = summaryOffline.stars_per_hour_offline_gains;
      ext.stargazingSuperStarsPerHourOfflineWithoutStarburst = summaryOffline.super_stars_per_hour_offline_gains;
    }
    saveJson(STARGAZING_EXTERNAL_KEY, ext);
  }, [hasStarburst, summary.stars_per_hour_online, summaryOffline.stars_per_hour_offline_gains, summaryOffline.super_stars_per_hour_offline_gains, summaryWithoutStarburst.stars_per_hour_online]);

  const spawnTree = useMemo(() => new StargazingCalculator(stats).get_spawn_tree(), [stats]);

  const starContributions = useMemo(() => new StargazingCalculator(stats).get_star_contributions_per_hour(), [stats]);
  const superStarContributions = useMemo(() => new StargazingCalculator(stats).get_super_star_contributions_per_hour(), [stats]);

  const [statsChartOpen, setStatsChartOpen] = useState(false);

  /** Multiplier for selected card tier (Stars only; SS not affected). */
  const resultsCardMult = useMemo(() => {
    const sel = starCards.selected_card_for_results;
    const tier = (starCards.card_tier[sel] ?? 0) as StarCardTier;
    return getCardMultiplier(sel, tier);
  }, [starCards.selected_card_for_results, starCards.card_tier, starCards.happy_bot_rank, starCards.polychrome_bundle, starCards.infernal_bonus]);

  const onlineInfo = useMemo(
    () => ({
      title: "Online",
      lines: [
        "Manual catch: full rate (inherent ×5, you switch stages). CTRL+F has no effect.",
        "Auto-catch: toggle \"Do you catch manually?\" off — then CTRL+F applies (0.2 vs 1.0).",
        "All buffs (Lootbug, Founder Supply Drop, Elixir Drone) are collected. Starburst: enter manually in Your stats.",
      ],
    }),
    [],
  );

  const onlineAfkInfo = useMemo(
    () => ({
      title: "Online AFK",
      lines: [
        "— Game open, phone aside. All stars caught by auto-catch. Offline factor 0.85 does not apply.",
        "— Lootbug and Founder buffs do not apply (only Elixir Drone).",
      ],
    }),
    [],
  );

  const offlineGainsInfo = useMemo(
    () => ({
      title: "Offline Gains",
      lines: [
        "— When the game gives offline gains: auto-catch × 0.85. The game applies this factor when you are offline.",
        "— Spoon strat is not applied (you cannot spoon when the device is off).",
        "— No external buffs (Lootbug, Founder, Elixir Drone, Starburst do not apply when the game is closed).",
      ],
    }),
    [],
  );

  const ctrlFInfo = useMemo(
    () => ({
      title: "CTRL+F Stars Skill",
      sections: [
        { heading: "Effect", lines: ["Affects Online AFK and Offline gains only. Online (manual catch) always has full ×5; you switch stages manually."] },
        {
          heading: "Mechanics",
          lines: [
            "Each star type spawns on 5 different floors.",
            "Online (manual): inherent ×5 — you switch stages, so CTRL+F has no effect.",
            "Online AFK / Offline: without CTRL+F catch on 1 floor (0.2); with CTRL+F follow through all 5 (1.0).",
          ],
        },
      ],
    }),
    [],
  );

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="title">
            <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
              <Sprite
                paths={["sprites/stargazing/stargazing.png", "sprites/stargazing/stargazing.svg"]}
                alt="Stargazing"
                className="sgHeaderIcon"
                label="sprites/stargazing/stargazing.*"
              />
              <span>Stargazing Calculator</span>
            </span>
          </h1>
        </div>
        <div className="badge">Stars • Super Stars • CTRL+F</div>
      </div>

      <div className="sgLayoutGrid">
        <div className="panel panelResults">
            <div className="panelHeader">
              <h2 className="panelTitle">Results</h2>
              <p className="panelHint">Updates instantly.</p>
            </div>

            <div className="sgResultsCardSelect" style={{ marginBottom: 10 }}>
              <span className="small mono" style={{ opacity: 0.9 }}>View results for:</span>
              <div className="sgResultsStarButtons">
                {STAR_CARD_IDS.map((id) => {
                  const name = id.charAt(0).toUpperCase() + id.slice(1);
                  const spritePath = `sprites/stargazing/${name}.png`;
                  const isSelected = starCards.selected_card_for_results === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`sgResultsStarBtn ${isSelected ? "sgResultsStarBtnActive" : ""}`}
                      onClick={() => setStarCards((s) => ({ ...s, selected_card_for_results: id }))}
                      title={name}
                    >
                      <Sprite paths={[spritePath]} alt={name} className="iconSmall" label={spritePath} />
                    </button>
                  );
                })}
              </div>
              <span className="small" style={{ opacity: 0.85 }}>
                {starCards.selected_card_for_results.charAt(0).toUpperCase() + starCards.selected_card_for_results.slice(1)} ×{resultsCardMult.toFixed(2)}
              </span>
            </div>

            <div className="kv" style={{ background: "rgba(255,255,255,0.92)" }}>
              <label className="sgCheckRow" style={{ gridColumn: "1 / -1", marginBottom: 2 }}>
                <input
                  type="checkbox"
                  checked={catchManually}
                  onChange={(e) => setCatchManually(e.target.checked)}
                />
                <span>Do you catch manually? (like 100% auto-catch rate, online only)</span>
              </label>
              <label className="sgCheckRow" style={{ gridColumn: "1 / -1", marginBottom: 2 }}>
                <input
                  type="checkbox"
                  checked={spoonStrat}
                  onChange={(e) => setSpoonStrat(e.target.checked)}
                />
                <span>Spoon Strat / Holding finger (+20% floor clears, online only)</span>
              </label>
              <kbd>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  ⭐ Stars/hour (Online)
                  <Tooltip content={onlineInfo} label="?" />
                </span>
              </kbd>
              <div className="mono sgResultValueBlue">{fmt1(summary.stars_per_hour_online * resultsCardMult)}</div>
              <kbd>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  ⭐ Stars/hour (Online AFK)
                  <Tooltip content={onlineAfkInfo} label="?" />
                </span>
              </kbd>
              <div className="mono sgResultValueBlue">{fmt1(summaryOnlineAfk.stars_per_hour_online_afk * resultsCardMult)}</div>
              <kbd>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  ⭐ Stars/hour (Offline Gains)
                  <Tooltip content={offlineGainsInfo} label="?" />
                </span>
              </kbd>
              <div className="mono sgResultValueBlue">{fmt1(summaryOffline.stars_per_hour_offline_gains * resultsCardMult)}</div>
              <kbd>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Sprite paths={["sprites/stargazing/super_star.png"]} alt="Super Star" className="iconSmall" label="sprites/stargazing/super_star.png" />
                  <span>SS/hour (Online)</span>
                  <Tooltip content={onlineInfo} label="?" />
                </span>
              </kbd>
              <div className="mono sgResultValueOrange">{fmt1(summary.super_stars_per_hour_online)}</div>
              <kbd>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Sprite paths={["sprites/stargazing/super_star.png"]} alt="Super Star" className="iconSmall" label="sprites/stargazing/super_star.png" />
                  <span>SS/hour (Online AFK)</span>
                  <Tooltip content={onlineAfkInfo} label="?" />
                </span>
              </kbd>
              <div className="mono sgResultValueOrange">{fmt1(summaryOnlineAfk.super_stars_per_hour_online_afk)}</div>
              <kbd>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Sprite paths={["sprites/stargazing/super_star.png"]} alt="Super Star" className="iconSmall" label="sprites/stargazing/super_star.png" />
                  <span>SS/hour (Offline Gains)</span>
                  <Tooltip content={offlineGainsInfo} label="?" />
                </span>
              </kbd>
              <div className="mono sgResultValueOrange">{fmt1(summaryOffline.super_stars_per_hour_offline_gains)}</div>
            </div>

            {droneBuffs.total2xStarMinPerHour > 0 && (
              <div className="sg2xUptimeRow">
                <span className="sg2xUptimeLabel">
                  <img src={ICON_2X_STAR_SPAWN} alt="" width={18} height={18} className="sg2xUptimeIcon" aria-hidden />
                  2× Star buff uptime
                  <Tooltip
                    content={{
                      title: "2× Star Spawn Rate buff uptime",
                      sections: [
                        {
                          heading: "Combined min/h",
                          lines: [
                            "Buff uptime per hour from Elixir (Drone), Lootbug (free + gem; Golden Lootbug), and Founder Supply Drop. Same buff; durations add (e.g. 3 + 5 + 2 = 10 min/h → 1/6 uptime). That uptime multiplies star gain.",
                          ],
                        },
                      ],
                    }}
                    label="?"
                  />
                </span>
                <span className="mono sg2xUptimeValue">{droneBuffs.total2xStarMinPerHour.toFixed(1)} min/h</span>
              </div>
            )}

            <div className="sgStatsChartRow">
              <button
                type="button"
                className="btn sgStatsChartBtn"
                onClick={() => setStatsChartOpen(true)}
                title="Stats Contributions"
                aria-label="Open Stats Contributions chart"
              >
                Stats Contributions
                <span className="sgStatsChartIconWrap" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="14" width="4" height="6" rx="1" />
                    <rect x="10" y="10" width="4" height="10" rx="1" />
                    <rect x="17" y="6" width="4" height="14" rx="1" />
                  </svg>
                </span>
              </button>
              <Tooltip
                content={{
                  title: "Stats Contributions",
                  lines: [
                    "Opens a chart showing how much each stat contributes to Stars and Super Stars gains (Double Star, Triple Star, Supernova, Supergiant, Radiant; for SS: 10× Chance instead of Double Star).",
                  ],
                }}
                label="?"
              />
            </div>

            <Collapsible id="stargazing-spawn-events" title="Floor clear / Spawn events" defaultExpanded={false} className="sgSpawnCollapse" headerRight={<span className="small mono" style={{ opacity: 0.9 }}>{fmt0(summary.star_spawn_rate_per_hour)} /h star · {fmt0(summary.super_star_spawn_rate_per_hour)} /h SS</span>}>
              <div className="small" style={{ marginBottom: 6 }}>
                Spawn events/hour: <span className="mono">{fmt0(summary.star_spawn_rate_per_hour)}</span> · Super-star events/hour:{" "}
                <span className="mono">{fmt0(summary.super_star_spawn_rate_per_hour)}</span>
              </div>
              <div className="sgSpawnTree small">
                <div className="sgSpawnTreeRoot">
                  Floor clear <span style={{ fontWeight: 400, opacity: 0.8, fontSize: 11 }}>(base 2% spawn per clear × spawn rate mult)</span>
                </div>
                {spawnTree.no_star_pct > 0.001 && (
                  <div className="sgSpawnTreeBranch">
                    No star at all (<span className="mono">{spawnTree.no_star_pct.toFixed(1)}%</span>)
                  </div>
                )}
                {spawnTree.star_spawn_pct > 0.001 && (
                  <div className="sgSpawnTreeBranch">
                    <div className="sgSpawnTreeLabel">Star spawn (<span className="mono">{spawnTree.star_spawn_pct.toFixed(1)}%</span>) — regular and SS roll independently, both can occur</div>
                    <div className="sgSpawnTreeIndent">
                      <div className="sgSpawnTreeHint">(% of spawn events)</div>
                      <div className="sgSpawnTreeLabel">Regular stars (always when spawn)</div>
                      {spawnTree.regular
                        .filter(({ pct }) => pct > 0.001)
                        .map(({ stars, pct }) => (
                          <div key={stars} className="sgSpawnTreeLeaf">
                            {stars} star{stars > 1 ? "s" : ""} (<span className="mono">{pct.toFixed(1)}%</span>)
                          </div>
                        ))}
                      {spawnTree.super_star_pct > 0.001 && (
                        <>
                          <div className="sgSpawnTreeLabel" style={{ marginTop: 4 }}>Super Star</div>
                          {spawnTree.super_star_outcomes
                            .filter(({ pct }) => (spawnTree.super_star_pct * pct) / 100 > 0.001)
                            .map(({ count, pct }) => {
                              const absolutePct = (spawnTree.super_star_pct * pct) / 100;
                              return (
                                <div key={count} className="sgSpawnTreeLeaf">
                                  {count} SS (<span className="mono">{absolutePct.toFixed(2)}%</span>)
                                </div>
                              );
                            })}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Collapsible>
          </div>

        <Collapsible id="stargazing-star-cards" title="Star Cards" defaultExpanded={false}>
            <div className="sgSection" style={{ marginTop: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {STAR_CARD_IDS.map((id) => {
                  const name = id.charAt(0).toUpperCase() + id.slice(1);
                  const spritePath = `sprites/stargazing/${name}.png`;
                  const tier = (starCards.card_tier[id] ?? 0) as StarCardTier;
                  return (
                    <div
                      key={id}
                      style={{
                        border: "1px solid rgba(15,23,42,0.10)",
                        borderRadius: 10,
                        padding: 10,
                        background: "var(--tier2)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Sprite paths={[spritePath]} alt={name} className="iconSmall" label={spritePath} />
                        <span className="mono">{name}</span>
                      </div>
                      <StarCardTierToggles
                        value={tier}
                        onChange={(t) => setStarCards((s) => ({ ...s, card_tier: { ...s.card_tier, [id]: t } }))}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="sgRows" style={{ marginTop: 12 }}>
                <Stepper
                  label="Happy Bot Pet Quest rank (0 = none)"
                  value={starCards.happy_bot_rank}
                  onChange={(v) => setStarCards((s) => ({ ...s, happy_bot_rank: clamp(v, 0, 10) }))}
                  step={1}
                  min={0}
                  max={10}
                  decimals={0}
                  inputMode="numeric"
                />
                <div className="sgRow" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="sgLabel" style={{ marginBottom: 0, flex: 1 }}>
                    <span className="sgLabelName">Polychrome Potency Bundle! (×1.15)</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={starCards.polychrome_bundle}
                      onChange={(e) => setStarCards((s) => ({ ...s, polychrome_bundle: e.target.checked }))}
                    />
                    Polychrome Potency Bundle active
                  </label>
                </div>
                <Stepper
                  label="Infernal Bonus (×)"
                  value={starCards.infernal_bonus}
                  onChange={(v) => setStarCards((s) => ({ ...s, infernal_bonus: v }))}
                  step={0.01}
                  min={0}
                  max={1_000}
                  decimals={2}
                />
              </div>
              <div className="small" style={{ marginTop: 10, opacity: 0.85 }}>
                Happy Bot: Rank Up at Level 225+. Ranks 1–10 XP: 150, 225, 335, 505, 760, 1,140, 1,710, 2,560, 3,845, 5,765.
              </div>
            </div>
          </Collapsible>

        <Collapsible id="stargazing-your-stats" title="Your stats (from game)" defaultExpanded={false} className="sgLeftPanel" headerRight={<span className="small" style={{ opacity: 0.85 }}>Percent inputs are %.</span>}>
          <div className="sgGrid">
            {/* CTRL+F should be at the very top (matches desktop emphasis). */}
            <div className="sgSection" style={{ background: "rgba(227,242,253,0.55)" }}>
              <div className="sgSectionHeader">
                <div className="sgSectionTitle">
                  <Sprite paths={["sprites/stargazing/Ctrl+F_Stars.png"]} alt="CTRL+F Stars" className="iconSmall" label="sprites/stargazing/Ctrl+F_Stars.png" />
                  <span className="mono">CTRL+F Stars</span>
                  <Tooltip content={ctrlFInfo} />
                </div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={ctrlF} onChange={(e) => setCtrlF(e.target.checked)} />
                Enabled (offline gains ×5)
              </label>
            </div>

            <div className="sgSection tierHeader2">
              <div className="sgSectionHeader">
                <div className="sgSectionTitle">
                  <span className="mono">Basic Stats</span>
                </div>
              </div>
              <div className="sgRows">
                <div>
                  <Stepper
                    label={
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        Floor Clears / min
                        <Tooltip content={{ title: "Floor Clears", lines: ["48/min default. ~1.25 bombs per min at this rate."] }} label="?" />
                      </span>
                    }
                    value={ui.floor_clears_per_minute}
                    onChange={(v) => setUi((s) => ({ ...s, floor_clears_per_minute: v }))}
                    step={0.1}
                    min={0}
                    max={10_000}
                    decimals={2}
                  />
                </div>
                <Stepper
                  label={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      Star Spawn Rate Multiplier (x)
                      <Tooltip content={{ title: "Star Spawn Rate", lines: ["Enter value without the 2× Star Spawn Rate buff. Buffs from Drone, Lootbug, Founder are applied automatically."] }} label="?" />
                    </span>
                  }
                  spritePaths={["sprites/stargazing/Star_Spawn_Rate_Multiplier.png"]}
                  spriteAlt="Star Spawn Rate Multiplier"
                  spriteLabel="sprites/stargazing/Star_Spawn_Rate_Multiplier.png"
                  value={ui.star_spawn_rate_mult}
                  onChange={(v) => setUi((s) => ({ ...s, star_spawn_rate_mult: v }))}
                  step={0.05}
                  min={0}
                  max={10_000}
                  decimals={2}
                />
                <Stepper
                  label="Auto-Catch Chance (%)"
                  spritePaths={["sprites/stargazing/Auto-Catch_Chance.png"]}
                  spriteAlt="Auto-Catch Chance"
                  spriteLabel="sprites/stargazing/Auto-Catch_Chance.png"
                  value={ui.auto_catch_chance}
                  onChange={(v) => setUi((s) => ({ ...s, auto_catch_chance: v }))}
                  step={0.5}
                  min={0}
                  max={100}
                  decimals={2}
                />
              </div>
            </div>

            <div className="sgSection tierHeader3">
              <div className="sgSectionHeader">
                <div className="sgSectionTitle">
                  <span className="mono">⭐ Star Multipliers</span>
                </div>
              </div>
              <div className="sgRows">
                <Stepper
                  label="Double Star Chance (%)"
                  spritePaths={["sprites/stargazing/Star_Double_Spawn_Chance.png"]}
                  spriteAlt="Double Star Chance"
                  spriteLabel="sprites/stargazing/Star_Double_Spawn_Chance.png"
                  value={ui.double_star_chance}
                  onChange={(v) => setUi((s) => ({ ...s, double_star_chance: v }))}
                  step={0.5}
                  min={0}
                  max={100}
                  decimals={2}
                />
                <Stepper
                  label="Triple Star Chance (%)"
                  value={ui.triple_star_chance}
                  onChange={(v) => setUi((s) => ({ ...s, triple_star_chance: v }))}
                  step={0.5}
                  min={0}
                  max={100}
                  decimals={2}
                />

                <div className="row2">
                  <Stepper
                    label="Star Supernova Chance (%)"
                    spritePaths={["sprites/stargazing/Star_Supernova_Chance.png"]}
                    spriteAlt="Star Supernova Chance"
                    spriteLabel="sprites/stargazing/Star_Supernova_Chance.png"
                    value={ui.star_supernova_chance}
                    onChange={(v) => setUi((s) => ({ ...s, star_supernova_chance: v }))}
                    step={0.5}
                    min={0}
                    max={100}
                    decimals={2}
                  />
                  <Stepper
                    label="Supernova Multiplier (x)"
                    value={ui.star_supernova_mult}
                    onChange={(v) => setUi((s) => ({ ...s, star_supernova_mult: v }))}
                    step={0.5}
                    min={0}
                    max={10_000}
                    decimals={2}
                  />
                </div>

                <div className="row2">
                  <Stepper
                    label="Star Supergiant Chance (%)"
                    spritePaths={["sprites/stargazing/Star_Supergiant_Chance.png"]}
                    spriteAlt="Star Supergiant Chance"
                    spriteLabel="sprites/stargazing/Star_Supergiant_Chance.png"
                    value={ui.star_supergiant_chance}
                    onChange={(v) => setUi((s) => ({ ...s, star_supergiant_chance: v }))}
                    step={0.5}
                    min={0}
                    max={100}
                    decimals={2}
                  />
                  <Stepper
                    label="Supergiant Multiplier (x)"
                    value={ui.star_supergiant_mult}
                    onChange={(v) => setUi((s) => ({ ...s, star_supergiant_mult: v }))}
                    step={0.5}
                    min={0}
                    max={10_000}
                    decimals={2}
                  />
                </div>

                <div className="row2">
                  <Stepper
                    label="Star Radiant Chance (%)"
                    value={ui.star_radiant_chance}
                    onChange={(v) => setUi((s) => ({ ...s, star_radiant_chance: v }))}
                    step={0.5}
                    min={0}
                    max={100}
                    decimals={2}
                  />
                  <Stepper
                    label="Radiant Multiplier (x)"
                    value={ui.star_radiant_mult}
                    onChange={(v) => setUi((s) => ({ ...s, star_radiant_mult: v }))}
                    step={0.5}
                    min={0}
                    max={10_000}
                    decimals={2}
                  />
                </div>
              </div>
            </div>

            <div className="sgSection tierHeader1">
              <div className="sgSectionHeader">
                <div className="sgSectionTitle">
                  <Sprite paths={["sprites/stargazing/super_star.png"]} alt="Super Star" className="iconSmall" label="sprites/stargazing/super_star.png" />
                  <span className="mono">SS Stats</span>
                </div>
              </div>
              <div className="sgRows">
                <Stepper
                  label="SS Spawn Rate Multiplier (x)"
                  spritePaths={["sprites/stargazing/Super_Star_Spawn_Rate_Multiplier.png"]}
                  spriteAlt="Super Star Spawn Rate Multiplier"
                  spriteLabel="sprites/stargazing/Super_Star_Spawn_Rate_Multiplier.png"
                  value={ui.super_star_spawn_rate_mult}
                  onChange={(v) => setUi((s) => ({ ...s, super_star_spawn_rate_mult: v }))}
                  step={0.05}
                  min={0}
                  max={10_000}
                  decimals={2}
                />
                <Stepper
                  label="Triple SS Chance (%)"
                  value={ui.triple_super_star_chance}
                  onChange={(v) => setUi((s) => ({ ...s, triple_super_star_chance: v }))}
                  step={0.5}
                  min={0}
                  max={100}
                  decimals={2}
                />
                <Stepper
                  label="SS 10× Chance (%)"
                  spritePaths={["sprites/stargazing/Super_Star_10x_Spawn_Chance.png"]}
                  spriteAlt="Super Star 10x Spawn Chance"
                  spriteLabel="sprites/stargazing/Super_Star_10x_Spawn_Chance.png"
                  value={ui.super_star_10x_chance}
                  onChange={(v) => setUi((s) => ({ ...s, super_star_10x_chance: v }))}
                  step={0.5}
                  min={0}
                  max={100}
                  decimals={2}
                />

                <div className="row2">
                  <Stepper
                    label="SS Supernova Chance (%)"
                    spritePaths={["sprites/stargazing/Star_Supernova_Chance.png"]}
                    spriteAlt="Super Star Supernova Chance"
                    spriteLabel="sprites/stargazing/Star_Supernova_Chance.png"
                    value={ui.super_star_supernova_chance}
                    onChange={(v) => setUi((s) => ({ ...s, super_star_supernova_chance: v }))}
                    step={0.5}
                    min={0}
                    max={100}
                    decimals={2}
                  />
                  <Stepper
                    label="SS Nova Multiplier (x)"
                    value={ui.super_star_supernova_mult}
                    onChange={(v) => setUi((s) => ({ ...s, super_star_supernova_mult: v }))}
                    step={0.5}
                    min={0}
                    max={10_000}
                    decimals={2}
                  />
                </div>

                <div className="row2">
                  <Stepper
                    label="SS Supergiant Chance (%)"
                    spritePaths={["sprites/stargazing/Super_Star_Supergiant_Chance.png"]}
                    spriteAlt="Super Star Supergiant Chance"
                    spriteLabel="sprites/stargazing/Super_Star_Supergiant_Chance.png"
                    value={ui.super_star_supergiant_chance}
                    onChange={(v) => setUi((s) => ({ ...s, super_star_supergiant_chance: v }))}
                    step={0.5}
                    min={0}
                    max={100}
                    decimals={2}
                  />
                  <Stepper
                    label="SS Giant Multiplier (x)"
                    value={ui.super_star_supergiant_mult}
                    onChange={(v) => setUi((s) => ({ ...s, super_star_supergiant_mult: v }))}
                    step={0.5}
                    min={0}
                    max={10_000}
                    decimals={2}
                  />
                </div>

                <div className="row2">
                  <Stepper
                    label="SS Radiant Chance (%)"
                    spritePaths={["sprites/stargazing/Super_Star_Radiant_Chance.png"]}
                    spriteAlt="Super Star Radiant Chance"
                    spriteLabel="sprites/stargazing/Super_Star_Radiant_Chance.png"
                    value={ui.super_star_radiant_chance}
                    onChange={(v) => setUi((s) => ({ ...s, super_star_radiant_chance: v }))}
                    step={0.5}
                    min={0}
                    max={100}
                    decimals={2}
                  />
                  <Stepper
                    label="SS Radiant Multiplier (x)"
                    value={ui.super_star_radiant_mult}
                    onChange={(v) => setUi((s) => ({ ...s, super_star_radiant_mult: v }))}
                    step={0.5}
                    min={0}
                    max={10_000}
                    decimals={2}
                  />
                </div>
              </div>
            </div>

            <div className="sgSection tierHeader4">
              <div className="sgSectionHeader">
                <div className="sgSectionTitle">
                  <span className="mono">Global Multipliers</span>
                </div>
              </div>
              <div className="sgRows">
                <Stepper
                  label="All Star Multiplier (x)"
                  spritePaths={["sprites/stargazing/All_Star_Multiplier.png"]}
                  spriteAlt="All Star Multiplier"
                  spriteLabel="sprites/stargazing/All_Star_Multiplier.png"
                  value={ui.all_star_mult}
                  onChange={(v) => setUi((s) => ({ ...s, all_star_mult: v }))}
                  step={0.05}
                  min={0}
                  max={10_000}
                  decimals={2}
                />
                <Stepper
                  label="Novagiant Combo Multiplier (x)"
                  value={ui.novagiant_combo_mult}
                  onChange={(v) => setUi((s) => ({ ...s, novagiant_combo_mult: v }))}
                  step={0.05}
                  min={0}
                  max={10_000}
                  decimals={2}
                />
              </div>
            </div>

            <div className="btnRow">
              <button
                className={resetArmed ? "btn btnDanger" : "btn btnSecondary"}
                type="button"
                onClick={() => {
                  if (!resetArmed) {
                    setResetArmed(true);
                    return;
                  }
                  setResetArmed(false);
                  if (!confirmDanger("Reset all inputs to defaults?")) return;
                  setUi(defaultUiStats());
                  setSpoonStrat(false);
                  setStarCards(defaultStarCards());
                }}
                title={resetArmed ? "Click again to confirm (then confirm dialog)." : "Click once to arm, click again to confirm."}
              >
                {resetArmed ? "Confirm reset" : "Reset to defaults"}
              </button>
              <Tooltip content={{ title: "Reset", lines: ["Restores the default values for all inputs."] }} />
            </div>
          </div>
        </Collapsible>
      </div>

      {statsChartOpen ? (
        <div className="modalOverlay" onMouseDown={() => setStatsChartOpen(false)}>
          <div className="modalWindow sgStatsChartModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="mono" style={{ fontWeight: 900 }}>Stats Contributions</div>
                <div className="small">Share of Stars and Super Stars gains per stat (online rates).</div>
              </div>
              <button className="btn btnSecondary" type="button" onClick={() => setStatsChartOpen(false)}>
                Close
              </button>
            </div>
            <div className="modalBody">
              <StatsContribChart
                title="Stars"
                total={summary.stars_per_hour_online}
                rows={[
                  { label: "Double Star", value: starContributions.doubleStar, color: "#fff59d" },
                  { label: "Triple Star", value: starContributions.tripleStar, color: "#ffeb3b" },
                  { label: "Supernova", value: starContributions.supernova, color: "#ffc107" },
                  { label: "Supergiant", value: starContributions.supergiant, color: "#ffa726" },
                  { label: "Radiant", value: starContributions.radiant, color: "#f57f17" },
                ]}
                fmt={fmt1}
              />
              <StatsContribChart
                title="Super Stars"
                total={summary.super_stars_per_hour_online}
                rows={[
                  { label: "Triple Star", value: superStarContributions.tripleStar, color: "#42a5f5" },
                  { label: "10× Chance", value: superStarContributions.tenXChance, color: "#90caf9" },
                  { label: "Supernova", value: superStarContributions.supernova, color: "#2196f3" },
                  { label: "Supergiant", value: superStarContributions.supergiant, color: "#1e88e5" },
                  { label: "Radiant", value: superStarContributions.radiant, color: "#1565c0" },
                ]}
                fmt={fmt1}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

