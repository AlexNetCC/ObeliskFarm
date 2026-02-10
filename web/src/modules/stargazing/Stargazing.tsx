import { useEffect, useMemo, useState } from "react";
import "./stargazing.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
import { assetUrl } from "../../lib/assets";
import { loadJson, saveJson } from "../../lib/storage";
import { StargazingCalculator, type PlayerStats } from "../../lib/stargazing/calculator";

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

/** Star card ids that have sprites in sprites/stargazing (from main Python/assets). */
const STAR_CARD_IDS = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio",
  "sagittarius", "capricorn", "aquarius", "pisces",
  "cetus", "draco", "eridanus", "hercules", "ophiuchus", "orion", "phoenix",
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
      <div className="sgLabel">
        <div className="sgLabelLeft">
          {spritePaths?.length ? (
            <Sprite paths={spritePaths} alt={spriteAlt ?? String(label)} className="iconSmall" label={spriteLabel ?? spriteAlt ?? ""} />
          ) : null}
          <span className="sgLabelName">{label}</span>
        </div>
        <span className="mono">{Number.isFinite(value) ? value.toFixed(decimals) : "—"}</span>
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
  // Desktop defaults (`StargazingWindow.reset_to_defaults()`):
  return {
    floor_clears_per_minute: 2.0, // 120/hour = 2/min
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
    const star_cards: StarCardsState = {
      ...defaultStarCards(),
      ...(saved?.star_cards ?? {}),
      selected_card_for_results: saved?.star_cards?.selected_card_for_results ?? "aries",
    };
    return { stats: merged, ctrl_f_stars_enabled, star_cards };
  }, []);

  const [ui, setUi] = useState<UiStats>(initial.stats);
  const [ctrlF, setCtrlF] = useState<boolean>(initial.ctrl_f_stars_enabled);
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
      const payload: SavedStateV1 = { stats: ui, ctrl_f_stars_enabled: ctrlF, star_cards: starCards };
      saveJson(STORAGE_KEY, payload);
    }, 250);
    return () => window.clearTimeout(t);
  }, [ui, ctrlF, starCards]);

  useEffect(() => {
    if (!resetArmed) return;
    const t = window.setTimeout(() => setResetArmed(false), 4500);
    return () => window.clearTimeout(t);
  }, [resetArmed]);

  /** Force re-render and invalidate memos after Starburst toggle so results update. */
  const [starburstToggleRefresh, setStarburstToggleRefresh] = useState(0);

  /** 2× Star Spawn Rate: Elixir (Drone) + Lootbug (incl. Golden) + Founder Supply Drop. Same buff; durations add (e.g. 3+5+2 = 10 min/h → 1/6 uptime). 3× Super Star from Drone Elixir only. Starburst Drone: Triple Star (suit), Star Spawn Rate + Auto-catch (when fueled). */
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
    const starburstOn = typeof sg?.starburstDroneOn === "boolean" ? sg.starburstDroneOn : false;
    const starburstAutoCatchMin = starburstOn && typeof sg?.starburstAutoCatch100MinPerHour === "number" ? Math.max(0, sg.starburstAutoCatch100MinPerHour) : 0;
    const totalAutoCatch100MinPerHour = Math.min(60, founderAutoCatchMin + starburstAutoCatchMin);
    return {
      total2xStarMinPerHour,
      total2xUptimeFraction,
      drone3xSuperUptimeFraction: typeof sg?.drone3xSuperUptimeFraction === "number" ? Math.min(1, Math.max(0, sg.drone3xSuperUptimeFraction)) : 0,
      founderSupplyDropAutoCatch100MinPerHour: totalAutoCatch100MinPerHour,
      founderOnlyAutoCatch100MinPerHour: founderAutoCatchMin,
      starburstTripleStarChancePct: starburstOn && typeof sg?.starburstTripleStarChancePct === "number" ? Math.max(0, sg.starburstTripleStarChancePct) : 0,
      starburstStarSpawnRateUptimeFraction: starburstOn && typeof sg?.starburstStarSpawnRateUptimeFraction === "number" ? Math.min(1, Math.max(0, sg.starburstStarSpawnRateUptimeFraction)) : 0,
      starburstStarSpawnRatePct: starburstOn && typeof sg?.starburstStarSpawnRatePct === "number" ? Math.max(0, sg.starburstStarSpawnRatePct) : 0,
      starburstAutoCatch100MinPerHour: starburstAutoCatchMin,
    };
  }, [starburstToggleRefresh]);

  const hasStarburst = droneBuffs.starburstTripleStarChancePct > 0 || droneBuffs.starburstStarSpawnRateUptimeFraction > 0 || droneBuffs.starburstAutoCatch100MinPerHour > 0;

  const starburstDroneOnFromExt = useMemo(() => {
    const sg = loadJson<{ starburstDroneOn?: boolean }>(STARGAZING_EXTERNAL_KEY);
    return typeof sg?.starburstDroneOn === "boolean" ? sg.starburstDroneOn : false;
  }, [starburstToggleRefresh]);

  const stats = useMemo<PlayerStats>(() => {
    const floor_clears_per_hour = clamp(ui.floor_clears_per_minute, 0, 1_000_000) * 60.0;
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
  }, [ui, ctrlF, droneBuffs.total2xUptimeFraction, droneBuffs.drone3xSuperUptimeFraction, droneBuffs.founderSupplyDropAutoCatch100MinPerHour, droneBuffs.starburstTripleStarChancePct, droneBuffs.starburstStarSpawnRateUptimeFraction, droneBuffs.starburstStarSpawnRatePct, starburstToggleRefresh]);

  /** Stats with Starburst contributions zeroed (for Drone module to show +% gain). */
  const statsWithoutStarburst = useMemo<PlayerStats>(() => {
    const floor_clears_per_hour = clamp(ui.floor_clears_per_minute, 0, 1_000_000) * 60.0;
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
  }, [ui, ctrlF, droneBuffs.total2xUptimeFraction, droneBuffs.drone3xSuperUptimeFraction, droneBuffs.founderOnlyAutoCatch100MinPerHour, starburstToggleRefresh]);

  const summary = useMemo(() => {
    const calc = new StargazingCalculator(stats);
    return calc.get_summary();
  }, [stats]);

  const summaryWithoutStarburst = useMemo(() => {
    const calc = new StargazingCalculator(statsWithoutStarburst);
    return calc.get_summary();
  }, [statsWithoutStarburst]);

  /** Write stars/h and super stars/h with and without Starburst to external so Drone can show +% gain. */
  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(STARGAZING_EXTERNAL_KEY) ?? {};
    ext.stargazingStarsPerHourOnline = summary.stars_per_hour_online;
    ext.stargazingStarsPerHourOffline = summary.stars_per_hour_offline;
    ext.stargazingSuperStarsPerHourOffline = summary.super_stars_per_hour_offline;
    if (hasStarburst) {
      ext.stargazingStarsPerHourOnlineWithoutStarburst = summaryWithoutStarburst.stars_per_hour_online;
      ext.stargazingStarsPerHourOfflineWithoutStarburst = summaryWithoutStarburst.stars_per_hour_offline;
      ext.stargazingSuperStarsPerHourOfflineWithoutStarburst = summaryWithoutStarburst.super_stars_per_hour_offline;
    } else {
      ext.stargazingStarsPerHourOnlineWithoutStarburst = summary.stars_per_hour_online;
      ext.stargazingStarsPerHourOfflineWithoutStarburst = summary.stars_per_hour_offline;
      ext.stargazingSuperStarsPerHourOfflineWithoutStarburst = summary.super_stars_per_hour_offline;
    }
    saveJson(STARGAZING_EXTERNAL_KEY, ext);
  }, [hasStarburst, summary.stars_per_hour_online, summary.stars_per_hour_offline, summary.super_stars_per_hour_offline, summaryWithoutStarburst.stars_per_hour_online, summaryWithoutStarburst.stars_per_hour_offline, summaryWithoutStarburst.super_stars_per_hour_offline]);

  const spawnTree = useMemo(() => new StargazingCalculator(stats).get_spawn_tree(), [stats]);

  /** Multiplier for selected card tier (Stars only; SS not affected). */
  const resultsCardMult = useMemo(() => {
    const sel = starCards.selected_card_for_results;
    const tier = (starCards.card_tier[sel] ?? 0) as StarCardTier;
    return getCardMultiplier(sel, tier);
  }, [starCards.selected_card_for_results, starCards.card_tier, starCards.happy_bot_rank, starCards.polychrome_bundle, starCards.infernal_bonus]);

  const onlineInfo = useMemo(
    () => ({
      title: "Online Mode",
      sections: [
        { heading: "Meaning", lines: ["Online means you manually catch all stars and follow them through all floors."] },
        { heading: "Auto-catch", lines: ["This corresponds to 100% catch rate (auto-catch is not applied)."] },
      ],
    }),
    [],
  );

  const ctrlFInfo = useMemo(
    () => ({
      title: "CTRL+F Stars Skill",
      sections: [
        { heading: "Effect", lines: ["Multiplies offline gains by 5x for both Stars and Super Stars."] },
        {
          heading: "Mechanics",
          lines: [
            "Each star type spawns on 5 different floors.",
            "Without CTRL+F: you catch the star on 1 floor → offline = auto_catch × online × 0.2",
            "With CTRL+F: you follow the star through all 5 floors → offline = auto_catch × online × 1.0",
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
        <div className="sgSection" style={{ marginBottom: 8, padding: "8px 10px", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(15,23,42,0.12)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label className="toggle" style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: 0, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={starburstDroneOnFromExt}
              onChange={() => {
                const ext = loadJson<Record<string, unknown>>(STARGAZING_EXTERNAL_KEY) ?? {};
                ext.starburstDroneOn = !(ext.starburstDroneOn as boolean);
                saveJson(STARGAZING_EXTERNAL_KEY, ext);
                setStarburstToggleRefresh((r) => r + 1);
              }}
            />
            <span>Starburst Drone: {starburstDroneOnFromExt ? "ON" : "OFF"}</span>
          </label>
          <Tooltip
            content={{
              title: "Starburst Drone",
              lines: [
                "Same setting as in the Drone module. Toggle here so you do not have to switch to Drone.",
                "When OFF, Starburst contributions (Triple Star Chance, Star Spawn Rate, Auto-catch, fuel cost) are excluded from calculations.",
                "If numbers do not change when you turn ON: open the Drone module once so it can write your Starburst suit/grade/fuel values to the shared data.",
              ],
            }}
            label="?"
          />
        </div>
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
              <kbd>
                ⭐ Stars/hour (Online)
                <Tooltip content={onlineInfo} />
              </kbd>
              <div className="mono sgResultValueBlue">{fmt1(summary.stars_per_hour_online * resultsCardMult)}</div>
              <kbd>⭐ Stars/hour (Offline)</kbd>
              <div className="mono sgResultValueBlue">{fmt1(summary.stars_per_hour_offline * resultsCardMult)}</div>
              <kbd>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Sprite paths={["sprites/stargazing/super_star.png"]} alt="Super Star" className="iconSmall" label="sprites/stargazing/super_star.png" />
                  <span>Super Stars/hour (Online)</span>
                </span>
                <Tooltip content={onlineInfo} />
              </kbd>
              <div className="mono sgResultValueOrange">{fmt1(summary.super_stars_per_hour_online)}</div>
              <kbd>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Sprite paths={["sprites/stargazing/super_star.png"]} alt="Super Star" className="iconSmall" label="sprites/stargazing/super_star.png" />
                  <span>Super Stars/hour (Offline)</span>
                </span>
              </kbd>
              <div className="mono sgResultValueOrange">{fmt1(summary.super_stars_per_hour_offline)}</div>
            </div>

            <div className="small" style={{ marginTop: 10 }}>
              Spawn events/hour: <span className="mono">{fmt4(summary.star_spawn_rate_per_hour)}</span> • Super-star events/hour:{" "}
              <span className="mono">{fmt4(summary.super_star_spawn_rate_per_hour)}</span>
            </div>
            <div className="sgSpawnTree small" style={{ marginTop: 8 }}>
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
            {(droneBuffs.total2xStarMinPerHour > 0 || droneBuffs.drone3xSuperUptimeFraction > 0 || droneBuffs.founderSupplyDropAutoCatch100MinPerHour > 0 || droneBuffs.starburstTripleStarChancePct > 0 || droneBuffs.starburstStarSpawnRateUptimeFraction > 0) && (
              <div className="small" style={{ marginTop: 6, opacity: 0.9 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  Includes 2× Star (Elixir + Lootbug incl. Golden + Founder Supply; minutes add)
                  {droneBuffs.drone3xSuperUptimeFraction > 0 && ", 3× Super Star (Elixir)"}
                  {droneBuffs.founderSupplyDropAutoCatch100MinPerHour > 0 && ", 100% Auto-catch (Founder Supply + Starburst when fueled)"}
                  {(droneBuffs.starburstTripleStarChancePct > 0 || droneBuffs.starburstStarSpawnRateUptimeFraction > 0) && ", Starburst Drone (Triple Star suit, Star Spawn when fueled)"}
                  <Tooltip
                    content={{
                      title: "External buffs",
                      sections: [
                        {
                          heading: "2× Star Spawn Rate",
                          lines: [
                            "Same buff from three sources: Drone Elixir, Lootbug (free + gem; gem or Golden Lootbug), Founder Supply Drop. They do not multiply; their durations add (e.g. 3 + 5 + 2 = 10 min/h → 1/6 uptime). That uptime acts as a multiplier for star gain.",
                          ],
                        },
                        {
                          heading: "3× Super Star",
                          lines: [
                            "From Drone Elixir only. When active together with 2× Star they multiply in-game; we use average uptime.",
                          ],
                        },
                        {
                          heading: "100% Auto-catch",
                          lines: [
                            "Founder Supply Drop gives 8 min (÷ game speed) of 100% Star Auto-catch per drop. Starburst Drone when fueled adds up to 60 min/h. Blended with your base auto-catch over the hour.",
                          ],
                        },
                        {
                          heading: "Starburst Drone",
                          lines: [
                            "From Drone module. Suit: Triple Star Chance (6% base + 1% per level) added to your stat. When fueled: +Star Spawn Rate (15% at grade 0, +1% per grade) and 100% Auto-catch for the full hour.",
                          ],
                        },
                      ],
                    }}
                  />
                </span>
              </div>
            )}
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
                    Value Pack active
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
                <Stepper
                  label="Floor Clears / min"
                  value={ui.floor_clears_per_minute}
                  onChange={(v) => setUi((s) => ({ ...s, floor_clears_per_minute: v }))}
                  step={0.1}
                  min={0}
                  max={10_000}
                  decimals={2}
                />
                <Stepper
                  label="Star Spawn Rate Multiplier (x)"
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
    </div>
  );
}

