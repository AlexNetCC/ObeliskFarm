import { useEffect, useMemo, useRef, useState } from "react";
import "./gemev.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
import { assetUrl } from "../../lib/assets";
import { loadJson, saveJson } from "../../lib/storage";
import {
  calculateChargeMagnetGemsPerHour,
  calculateEvBreakdown,
  calculateFreebieChestsPerHour,
  calculateFreebiesPerHour,
  calculateGemBombGemsPerHour,
  calculateGiftEvBreakdown,
  calculateGiftEvPerGift,
  calculateStonksChestsPerHour,
  calculateTotalEvPerHour,
  defaultGameParameters,
  getEffectiveFreebieTimerMinutes,
  getGameSpeedMultiplier,
  type GameParameters,
} from "../../lib/gemev/freebieEv";
import { ContribBarChart, ContribLegend } from "./ContribBarChart";

type SavedStateV1 = {
  params: Partial<GameParameters>;
  stonks_enabled: boolean;
  skill_shards_enabled: boolean;
};

const STORAGE_KEY = "obeliskfarm:web:gemev_save.json:v1";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";
const CHAOS_TOTEM_ICON = "https://static.wikitide.net/shminerwiki/a/a6/Chaos_Totem.png";
const WORKSHOP_BUTTON_ICON = "https://static.wikitide.net/shminerwiki/6/6f/Workshop_Button.png";
/** Set true to show Founder Bomb section and chart bar again. */
const FOUNDER_BOMB_VISIBLE = false;

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function parseNumber(raw: string): number {
  const cleaned = raw.trim().replaceAll(",", ".").replaceAll(" ", "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function fmt1(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function fmtPct(n: number, total: number): string {
  if (!Number.isFinite(n) || !Number.isFinite(total) || total <= 0) return "0.0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function Sprite(props: { path: string | null; alt: string; className?: string; label?: string }) {
  const { path, alt, className, label } = props;
  const [ok, setOk] = useState(true);
  if (!path || !ok) return <span className="iconPlaceholder" title={`Missing sprite: ${label ?? alt}`}>?</span>;
  return <img className={className ?? "icon"} src={assetUrl(path)} alt={alt} onError={() => setOk(false)} title={alt} />;
}

function Stepper(props: {
  label: React.ReactNode;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  inputMode?: "decimal" | "numeric";
  decimals?: number;
  disabled?: boolean;
  /** When false, no −/+ buttons, only the number input. */
  showButtons?: boolean;
}) {
  const { label, value, onChange, step = 1, min = -Infinity, max = Infinity, inputMode = "decimal", decimals = 2, disabled = false, showButtons = true } = props;
  const isEditingRef = useRef(false);
  const formatDisplay = (v: number) => (Number.isFinite(v) ? v.toFixed(decimals) : "");
  const [raw, setRaw] = useState<string>(() => formatDisplay(value));

  useEffect(() => {
    // Keep input in sync with external value, but don't fight the user's typing.
    if (isEditingRef.current) return;
    setRaw(formatDisplay(value));
  }, [value, decimals]);

  function commit() {
    const n = parseNumber(raw);
    const next = clamp(n, min, max);
    const rounded = Number.isFinite(next) ? Number(next.toFixed(decimals)) : next;
    onChange(rounded);
    isEditingRef.current = false;
    setRaw(formatDisplay(rounded));
  }

  return (
    <div className="gemEvRow">
      <div className="label">
        <span>{label}</span>
        <span className="mono">{Number.isFinite(value) ? value.toFixed(decimals) : "—"}</span>
      </div>
      <div className={`gemEvStepper ${!showButtons ? "gemEvStepperNoButtons" : ""}`}>
        {showButtons && (
          <button className="btn btnSecondary gemEvStepBtn" type="button" disabled={disabled} onClick={() => onChange(clamp(value - step, min, max))}>
            −
          </button>
        )}
        <input
          className="input gemEvInput"
          inputMode={inputMode}
          value={raw}
          disabled={disabled}
          onFocus={() => {
            isEditingRef.current = true;
          }}
          onChange={(e) => {
            isEditingRef.current = true;
            setRaw(e.target.value);
          }}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        {showButtons && (
          <button className="btn gemEvStepBtn" type="button" disabled={disabled} onClick={() => onChange(clamp(value + step, min, max))}>
            +
          </button>
        )}
      </div>
    </div>
  );
}

function CardToggles(props: { value: number; onChange: (lvl: number) => void; disabled?: boolean }) {
  const { value, onChange, disabled = false } = props;
  const cur = clampInt(value, 0, 3);
  const mk = (lvl: 1 | 2 | 3, label: string) => (
    <button
      type="button"
      className={`btn btnSecondary gemEvCardBtn ${cur === lvl ? "cardBtnActive" : ""}`}
      disabled={disabled}
      onClick={() => onChange(cur === lvl ? 0 : lvl)}
    >
      {label} {cur === lvl ? "✓" : ""}
    </button>
  );
  return (
    <div className="gemEvCardRow">
      <span className="small">Recharge:</span>
      {mk(1, "Card")}
      {mk(2, "Gild")}
      {mk(3, "Poly")}
    </div>
  );
}

export function GemEv() {
  const initial = useMemo(() => {
    const base = defaultGameParameters();
    const saved = loadJson<SavedStateV1>(STORAGE_KEY);
    const merged: GameParameters = { ...base, ...(saved?.params ?? {}) };
    const stonks_enabled = saved?.stonks_enabled ?? true;
    const skill_shards_enabled = saved?.skill_shards_enabled ?? true;
    return { params: merged, stonks_enabled, skill_shards_enabled };
  }, []);

  const [params, setParams] = useState<GameParameters>(initial.params);
  const [stonksEnabled, setStonksEnabled] = useState<boolean>(initial.stonks_enabled);
  const [skillShardsEnabled, setSkillShardsEnabled] = useState<boolean>(initial.skill_shards_enabled);
  const [chartOpen, setChartOpen] = useState(false);
  const [showJackpotRefresh, setShowJackpotRefresh] = useState(true);
  const [lootbugNetGemsPerHour, setLootbugNetGemsPerHour] = useState(0);
  useEffect(() => {
    const ext = loadJson<{ lootbugNetGemsPerHour?: number }>(GEMEV_EXTERNAL_KEY);
    setLootbugNetGemsPerHour(typeof ext?.lootbugNetGemsPerHour === "number" ? ext.lootbugNetGemsPerHour : 0);
  }, []);
  // autosave
  useEffect(() => {
    const t = window.setTimeout(() => {
      const payload: SavedStateV1 = { params, stonks_enabled: stonksEnabled, skill_shards_enabled: skillShardsEnabled };
      saveJson(STORAGE_KEY, payload);
    }, 250);
    return () => window.clearTimeout(t);
  }, [params, stonksEnabled, skillShardsEnabled]);

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") setChartOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const external = (() => {
    const ext = loadJson<{
      lootbugBomb10xMinPerHour?: number;
      droneBomb10xMinPerHour?: number;
      lootbugNetGemsPerHour?: number;
      droneFuelGemsPerHour?: number;
      chaosTotemUptimePct?: number;
      chargeMagnetImpact?: number;
      lootbugItemChestsPerHour?: number;
      itemsPerChest?: number;
    }>(GEMEV_EXTERNAL_KEY);
    const lootbug10x = typeof ext?.lootbugBomb10xMinPerHour === "number" ? ext.lootbugBomb10xMinPerHour : 0;
    const drone10x = typeof ext?.droneBomb10xMinPerHour === "number" ? ext.droneBomb10xMinPerHour : 0;
    const lootbugNetGemsPerHour = typeof ext?.lootbugNetGemsPerHour === "number" ? ext.lootbugNetGemsPerHour : 0;
    const droneFuelGemsPerHour = typeof ext?.droneFuelGemsPerHour === "number" ? ext.droneFuelGemsPerHour : 0;
    const chaosTotemUptimePct = typeof ext?.chaosTotemUptimePct === "number" ? ext.chaosTotemUptimePct : 0;
    const chargeMagnetImpact = typeof ext?.chargeMagnetImpact === "number" ? ext.chargeMagnetImpact : 0;
    const lootbugItemChestsPerHour = typeof ext?.lootbugItemChestsPerHour === "number" ? ext.lootbugItemChestsPerHour : 0;
    const itemsPerChest = typeof ext?.itemsPerChest === "number" ? ext.itemsPerChest : 1;
    return { lootbug10x, drone10x, total10x: lootbug10x + drone10x, lootbugNetGemsPerHour, droneFuelGemsPerHour, chaosTotemUptimePct, chargeMagnetImpact, lootbugItemChestsPerHour, itemsPerChest };
  })();
  const external10x = { lootbug: external.lootbug10x, drone: external.drone10x, total: external.total10x };

  // Apply desktop semantics: stonks is a checkbox and uses fixed chance/bonus when enabled.
  // Also keep "fixed" desktop constants (they exist in params but are not editable in the UI).
  const effectiveParams = useMemo<GameParameters>(() => {
    const p: GameParameters = { ...params };

    // Stonks semantics (toggle sets base chance; multipliers from params)
    p.stonks_chance = stonksEnabled ? 0.01 : 0.0;
    p.stonks_bonus_gems = 200.0;
    p.stonks_multiplier = clamp(p.stonks_multiplier ?? 1.0, 0, 999);
    p.super_stonks_chance = clamp(p.super_stonks_chance ?? 0, 0, 1);
    p.super_stonks_bonus_gems = clamp(p.super_stonks_bonus_gems ?? 0, 0, 99999);
    p.super_stonks_multiplier = clamp(p.super_stonks_multiplier ?? 1.0, 0, 999);
    p.ultra_stonks_chance = clamp(p.ultra_stonks_chance ?? 0, 0, 1);
    p.ultra_stonks_bonus_gems = clamp(p.ultra_stonks_bonus_gems ?? 0, 0, 99999);
    p.ultra_stonks_multiplier = clamp(p.ultra_stonks_multiplier ?? 1.0, 0, 999);
    p.stonks_all_multiplier = clamp(p.stonks_all_multiplier ?? 1.0, 0, 999);

    // Skill shards: include in EV only when toggle on
    if (!skillShardsEnabled) p.skill_shard_chance = 0;

    // Fixed desktop constants
    p.founder_gems_base = 10.0;
    p.founder_gems_chance = 0.01;
    p.founder_speed_multiplier = 2.0;
    p.founder_speed_duration_minutes = 5.0;
    p.battery_bomb_charges_per_charge = 2.0;
    p.battery_bomb_cap_increase_chance = 0.001;
    p.founder_bomb_charges_per_drop = 2.0;
    // Founder bomb speed: fixed 10% chance, 2× for 10 seconds (not editable)
    p.founder_bomb_speed_chance = 0.10;
    p.founder_bomb_speed_multiplier = 2.0;
    p.founder_bomb_speed_duration_seconds = 10.0;
    // Jackpot: rolls always 5 (not editable)
    p.jackpot_rolls = 5;

    // Total bomb types: derived from checkboxes (10 + founder + veinmorph + megabomb, max 13)
    const includeFounder = p.include_founder_bomb_in_total ?? p.founder_enabled;
    const hasVeinmorph = "has_veinmorph_bomb" in p ? p.has_veinmorph_bomb : true;
    const hasMegabomb = "has_megabomb" in p ? p.has_megabomb : false;
    p.total_bomb_types = 10 + (includeFounder ? 1 : 0) + (hasVeinmorph ? 1 : 0) + (hasMegabomb ? 1 : 0);

    // Clamp common percent inputs
    p.freebie_claim_percentage = clamp(p.freebie_claim_percentage, 0, 100);
    p.skill_shard_chance = clamp(p.skill_shard_chance, 0, 1);
    p.jackpot_chance = clamp(p.jackpot_chance, 0, 1);
    p.instant_refresh_chance = clamp(p.instant_refresh_chance, 0, 1);
    p.free_bomb_chance = clamp(p.free_bomb_chance, 0, 0.99);
    p.gem_bomb_gem_chance = clamp(p.gem_bomb_gem_chance, 0, 1);
    p.cherry_bomb_triple_charge_chance = clamp(p.cherry_bomb_triple_charge_chance, 0, 1);
    p.d20_bomb_refill_chance = clamp(p.d20_bomb_refill_chance, 0, 1);

    // Clamp "levels"
    p.vip_lounge_level = clampInt(p.vip_lounge_level, 1, 12);
    p.d20_bomb_charges_distributed = clampInt(p.d20_bomb_charges_distributed, 0, 9999);
    p.obelisk_level = clampInt(p.obelisk_level, 0, 999);
    p.founder_enabled = Boolean(p.founder_enabled);

    // Recharge card levels
    p.gem_bomb_recharge_card_level = clampInt(p.gem_bomb_recharge_card_level, 0, 3);
    p.cherry_bomb_recharge_card_level = clampInt(p.cherry_bomb_recharge_card_level, 0, 3);
    p.battery_bomb_recharge_card_level = clampInt(p.battery_bomb_recharge_card_level, 0, 3);
    p.d20_bomb_recharge_card_level = clampInt(p.d20_bomb_recharge_card_level, 0, 3);
    p.founder_bomb_recharge_card_level = clampInt(p.founder_bomb_recharge_card_level, 0, 3);

    // Game speed multiplier (1 = use VIP T10–T12; >1 = override, e.g. 2.1 = 2.1×). Migrate old game_speed_pct.
    let mult = "game_speed_multiplier" in p ? p.game_speed_multiplier : 1.0;
    const gameSpeedPct = (p as { game_speed_pct?: number }).game_speed_pct;
    if (mult === 1.0 && typeof gameSpeedPct === "number" && gameSpeedPct > 0)
      mult = 1.0 + clampInt(gameSpeedPct, 0, 12) / 100.0;
    p.game_speed_multiplier = clamp(Number(mult), 1.0, 10.0);

    p.bomb_recharge_10x_min_per_hour = external10x.total;
    p.chaos_totem_uptime = Math.max(0, Math.min(1, (external.chaosTotemUptimePct ?? 0) / 100));

    // Ensure positive time values
    p.freebie_timer_minutes = clamp(p.freebie_timer_minutes, 0.1, 10_000);
    p.gem_bomb_recharge_seconds = clamp(p.gem_bomb_recharge_seconds, 0.1, 10_000);
    p.cherry_bomb_recharge_seconds = clamp(p.cherry_bomb_recharge_seconds, 0.1, 10_000);
    p.battery_bomb_recharge_seconds = clamp(p.battery_bomb_recharge_seconds, 0.1, 10_000);
    p.d20_bomb_recharge_seconds = clamp(p.d20_bomb_recharge_seconds, 0.1, 10_000);
    p.founder_bomb_interval_seconds = clamp(p.founder_bomb_interval_seconds, 0.1, 10_000);
    p.founder_bomb_speed_multiplier = clamp(p.founder_bomb_speed_multiplier, 0.1, 100);
    p.founder_bomb_speed_duration_seconds = clamp(p.founder_bomb_speed_duration_seconds, 0, 10_000);

    return p;
  }, [params, stonksEnabled, skillShardsEnabled, external10x.total, external.chaosTotemUptimePct]);

  const ev = useMemo(() => calculateTotalEvPerHour(effectiveParams), [effectiveParams]);
  const freebiesPerHour = useMemo(() => calculateFreebiesPerHour(effectiveParams), [effectiveParams]);
  const freebieChestsPerHour = useMemo(() => calculateFreebieChestsPerHour(effectiveParams), [effectiveParams]);
  const breakdown = useMemo(() => calculateEvBreakdown(effectiveParams), [effectiveParams]);
  const giftEv = useMemo(() => calculateGiftEvPerGift(effectiveParams), [effectiveParams]);
  const giftBreakdown = useMemo(() => calculateGiftEvBreakdown(effectiveParams), [effectiveParams]);

  const gemBomb10xImpact = useMemo(() => {
    const without10x = calculateGemBombGemsPerHour({ ...effectiveParams, bomb_recharge_10x_min_per_hour: 0 });
    return Math.max(0, ev.gem_bomb_gems - without10x);
  }, [effectiveParams, ev.gem_bomb_gems]);

  const chaosTotemImpact = useMemo(() => {
    const withoutChaos = calculateGemBombGemsPerHour({ ...effectiveParams, chaos_totem_uptime: 0 });
    return Math.max(0, ev.gem_bomb_gems - withoutChaos);
  }, [effectiveParams, ev.gem_bomb_gems]);

  /** When stonks is enabled: expected chests/h from stonks procs (base + super + ultra, all multis). */
  const stonksChestsPerHour = useMemo(() => {
    if (!stonksEnabled) return 0;
    return calculateStonksChestsPerHour(effectiveParams);
  }, [stonksEnabled, effectiveParams]);

  /** Charge Magnet impact: from Items (external) when set, else computed here so the overview chart shows it without opening Items. */
  const chargeMagnetImpactResolved = useMemo(() => {
    const ext = loadJson<{ chargeMagnetImpact?: number; lootbugItemChestsPerHour?: number; itemsPerChest?: number }>(GEMEV_EXTERNAL_KEY);
    if (typeof ext?.chargeMagnetImpact === "number") return ext.chargeMagnetImpact;
    const chestsPerHour = freebieChestsPerHour + stonksChestsPerHour + (ext?.lootbugItemChestsPerHour ?? 0);
    const itemsPerChest = typeof ext?.itemsPerChest === "number" ? ext.itemsPerChest : 1;
    const chargeMagnetsPerHour = chestsPerHour * itemsPerChest * 0.026;
    const valuePerMagnet = calculateChargeMagnetGemsPerHour(effectiveParams, 20);
    return chargeMagnetsPerHour * valuePerMagnet;
  }, [effectiveParams, freebieChestsPerHour, stonksChestsPerHour]);

  useEffect(() => {
    const ext = loadJson<{
      lootbugBomb10xMinPerHour?: number;
      droneBomb10xMinPerHour?: number;
      lootbugNetGemsPerHour?: number;
      gemBomb10xImpact?: number;
      total10xMinPerHour?: number;
      freebiesPerHour?: number;
      freebieChestsPerHour?: number;
      chaosTotemImpact?: number;
      stonksChestsPerHour?: number;
    }>(GEMEV_EXTERNAL_KEY) ?? {};
    ext.gemBomb10xImpact = gemBomb10xImpact;
    ext.total10xMinPerHour = (ext.lootbugBomb10xMinPerHour ?? 0) + (ext.droneBomb10xMinPerHour ?? 0);
    ext.freebiesPerHour = freebiesPerHour;
    ext.freebieChestsPerHour = freebieChestsPerHour;
    ext.chaosTotemImpact = chaosTotemImpact;
    ext.stonksChestsPerHour = stonksChestsPerHour;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [gemBomb10xImpact, freebiesPerHour, freebieChestsPerHour, chaosTotemImpact, stonksChestsPerHour]);

  const totalWithLootbugAndDroneFuel = ev.total + external.lootbugNetGemsPerHour - external.droneFuelGemsPerHour + chargeMagnetImpactResolved;

  const marginal = useMemo(() => {
    const p2: GameParameters = { ...effectiveParams, freebie_gems_base: effectiveParams.freebie_gems_base + 1.0 };
    const ev2 = calculateTotalEvPerHour(p2);
    return ev2.total - ev.total;
  }, [effectiveParams, ev.total]);

  const giftTooltip = useMemo(() => {
    const total = giftBreakdown.total || 0;
    const entries: Array<{ label: string; key: keyof typeof giftBreakdown }> = [
      { label: "Gems (20-40)", key: "gems_20_40" },
      { label: "Gems (30-65)", key: "gems_30_65" },
      { label: "Skill Shards", key: "skill_shards" },
      { label: "Blue Cow", key: "blue_cow" },
      { label: "2× Speed Boost", key: "speed_boost" },
      { label: "Rare Roll Gems", key: "rare_gems" },
      { label: "Recursive Gifts", key: "recursive_gifts" },
    ];
    return {
      title: "Gift-EV (per 1 opened gift)",
      sections: [
        {
          heading: "Breakdown (value + share)",
          lines: entries.map(({ label, key }) => {
            const v = Number(giftBreakdown[key] ?? 0);
            return `• ${label}: ${fmt1(v)} Gems (${fmtPct(v, total)})`;
          }),
        },
        {
          heading: "Total",
          lines: [`• ${fmt1(total)} Gems per Gift`],
        },
      ],
    };
  }, [giftBreakdown]);

  const freebieInfo = useMemo(
    () => ({
      title: "FREEBIE Parameters",
      sections: [
        { heading: "Base", lines: ["Freebie Gems (Base), Freebie Timer, Claim % (per day)."] },
        {
          heading: "Special drops",
          lines: [
            "Skill Shards: chance only (value is fixed).",
            "Stonks: collapsible section. Stonks (1% chance, 200 Gems base) + multiplier. Super Stonks only when Stonks hit; Ultra only when Super hit. Each tier has its own multiplier; Stonks all multiplier applies to the sum.",
          ],
        },
        { heading: "Multipliers", lines: ["Jackpot: chance for additional rolls.", "Refresh: chance for instant refresh (geometric series)."] },
      ],
    }),
    [],
  );

  const founderInfo = useMemo(
    () => ({
      title: "Founder / VIP",
      sections: [
        {
          heading: "VIP Lounge (Tiers 1–12)",
          lines: [
            "Interval: 60 − 2×(Level−1) min. Double: 12% at T2, +6% per tier. Triple: 16% at T7, +8% per tier.",
            "T10: Game Speed +10%, +1% per tier. Multiplicative with bomb recharge times and freebie cooldown (not supply drop).",
            "T11: Golden Supply Drop 10%, +2% per tier. 5× normal drops; rare rewards (Obelisk bonus, Gifts, etc.) unchanged.",
            "T12: Gem Bomb Gem Chance +0.5%.",
          ],
        },
        { heading: "Rewards (assumptions)", lines: ["Founder Gems: fixed 10 Gems/drop", "Founder Speed: 2× for 5 minutes (time saved → more freebies)", "1/1234 chance: 10 gifts per supply drop"] },
        { heading: "Obelisk", lines: ["Obelisk Level affects bonus gems and Gift-EV multipliers."] },
      ],
    }),
    [],
  );

  const bombsInfo = useMemo(
    () => ({
      title: "BOMB MECHANICS",
      sections: [
        {
          heading: "Free Bomb Chance",
          lines: ["Chance that a bomb click consumes 0 charges.", "Applies to the entire dump (all charges at once).", "Affects all bomb types."],
        },
        {
          heading: "Bomb cycle",
          lines: [
            "Early: Cherry → Battery → D20 → Gem. Cherry triple-charge bonus counts as extra battery detonations (more refills to all).",
            "Late: Cherry → Gem → Battery → D20. Cherry triple-charge bonus counts as extra gem bomb detonations (direct gem EV).",
            "Battery and D20 recursively refill all types regardless of cycle.",
          ],
        },
        {
          heading: "Total bomb types",
          lines: [
            "Count Founder Bomb, Veinmorph, and Megabomb. Base 10 + checked = total (max 13).",
            "More bomb types = refill is more widely distributed (Battery and D20 spread charges across more targets).",
          ],
        },
        {
          heading: "Refill",
          lines: [
            "Battery bomb: refills all bomb types (Gem, Cherry, Battery, D20, and others) including itself (self-refill).",
            "D20 bomb: refills all bomb types including itself (self-refill).",
            "Charges are distributed evenly across all types (divided by total bomb types − 1 in the formula).",
          ],
        },
      ],
    }),
    [],
  );

  return (
    <div className="container">
      <div className="gemEvGrid">
        <div className="header">
          <div>
            <h1 className="title">Gem EV Calculator</h1>
            <p className="subtitle">Matches the desktop Gem EV layout: colored sections + contribution bar chart + Gift-EV.</p>
          </div>
          <div className="badge">Freebies • Founder • Bombs</div>
        </div>

        <div className="panel panelResults">
            <div className="panelHeader">
              <h2 className="panelTitle">Results</h2>
              <p className="panelHint">Updates instantly.</p>
            </div>

            <div className="kv" style={{ background: "rgba(227,242,253,0.65)" }}>
              <kbd>TOTAL</kbd>
              <div className="mono" style={{ fontWeight: 900 }}>
                {fmt1(totalWithLootbugAndDroneFuel)} Gem-Equivalent/h
              </div>
              <kbd>Gift-EV</kbd>
              <div className="mono" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 900 }}>{fmt1(giftEv)} Gems per Gift</span>
                <Tooltip content={giftTooltip} />
              </div>
            </div>

            <div className="small" style={{ marginTop: 10 }}>
              Founder supply split: Speed <span className="mono">{fmt1(ev.founder_speed_boost)}</span> • Gems{" "}
              <span className="mono">{fmt1(ev.founder_gems)}</span>
            </div>
            {!params.founder_enabled ? <div className="small" style={{ marginTop: 6 }}>FOUNDER is disabled: all founder-related contributions are set to 0.</div> : null}

            <div className="btnRow" style={{ marginTop: 12, alignItems: "center" }}>
              <button className="btn" type="button" onClick={() => setChartOpen(true)}>
                Overview chart
              </button>
              <Tooltip
                content={{
                  title: "Overview chart",
                  lines: ["Opens the stacked contributions bar chart (Base / Jackpot / Refresh). Bars left to right for readability on mobile."],
                }}
                label="?"
              />
            </div>
          </div>

        <Collapsible
            id="gemev-freebie"
            title="FREEBIE"
            defaultExpanded={false}
            className="gemEvSection tierHeader1"
            headerRight={
              <>
                <Sprite path="sprites/common/gem.png" alt="Freebie" className="iconSmall" />
                <Tooltip content={freebieInfo} />
              </>
            }
          >
            <div className="gemEvSectionBody">
              <Stepper
                label={
                  <>
                    Freebie Gems (Base)
                    <span className="gemEvMarginal">+1 EV: {fmt1(marginal)} Gems/h</span>
                  </>
                }
                value={params.freebie_gems_base}
                onChange={(v) => setParams((s) => ({ ...s, freebie_gems_base: v }))}
                step={1}
                min={0}
                max={9999}
                decimals={1}
              />
              <div className="gemEvInlineHead">
                <span className="mono">Freebie timer</span>
              </div>
              <div className="gemEvGameSpeedWrap">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: "1", minWidth: "260px" }}>
                    <Stepper
                      label={
                        <>
                          Game Speed
                          <span className="mono" style={{ marginLeft: 4 }}>×</span>
                        </>
                      }
                      value={getGameSpeedMultiplier(effectiveParams)}
                      onChange={(v) => setParams((s) => ({ ...s, game_speed_multiplier: clamp(v, 1, 10) }))}
                      step={0.01}
                      min={1}
                      max={10}
                      decimals={2}
                      showButtons={false}
                    />
                  </div>
                  <Tooltip
                    content={{
                      title: "Game Speed",
                      sections: [
                        {
                          heading: "Stats value",
                          lines: [
                            "Game speed as × (e.g. 2× = half freebie timer). Same value as in the Stats screen (Stats button).",
                            "Decimals allowed (e.g. 2.1×). Multiplicative with freebie cooldown and all bomb recharge times (not supply drop).",
                            "1× = use VIP T10–T12; set >1 to override.",
                          ],
                        },
                      ],
                    }}
                    label="?"
                  />
                </div>
              </div>
              <Stepper
                label="Freebie Timer (min) base"
                value={params.freebie_timer_minutes}
                onChange={(v) => setParams((s) => ({ ...s, freebie_timer_minutes: v }))}
                step={0.5}
                min={0.1}
                max={9999}
                decimals={1}
              />
              <div className="gemEvRow gemEvEffectiveTimerGlow">
                <span className="mono small">→ Effective freebie timer</span>
                <span className="mono small">{getEffectiveFreebieTimerMinutes(effectiveParams).toFixed(1)} min</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1", minWidth: 0 }}>
                  <Stepper
                    label="Freebie Claim (% per Day)"
                    value={params.freebie_claim_percentage}
                    onChange={(v) => setParams((s) => ({ ...s, freebie_claim_percentage: v }))}
                    step={1}
                    min={0}
                    max={100}
                    decimals={1}
                    showButtons={false}
                  />
                </div>
                <Tooltip
                  content={{
                    title: "Freebie Claim %",
                    lines: [
                      "Affects only the Freebie Gems (base) bar. Other bars use full freebie rate.",
                      "Example: enter 66 if you do not claim freebies at night (premise: 8 h sleep → 16 h claim per day ≈ 66%).",
                    ],
                  }}
                  label="?"
                />
              </div>

              <div className="gemEvDivider" />

              <Collapsible
                id="gemev-skill-shards"
                title="Skill Shards (Freebie)"
                defaultExpanded={false}
                headerRight={
                  <>
                    <Sprite path="sprites/common/skill_shard.png" alt="Skill shards" className="iconSmall" />
                    <Tooltip
                      content={{
                        title: "Why include Skill Shards in EV",
                        sections: [
                          {
                            heading: "Value",
                            lines: [
                              "1 skill point = 125 Gems → 1 skill shard = 12.5 Gems (fixed).",
                              "Only the chance is editable.",
                            ],
                          },
                        ],
                      }}
                      label="?"
                    />
                  </>
                }
              >
                <div className="gemEvSectionBody" style={{ paddingTop: 4 }}>
                  <label className="toggle" style={{ marginBottom: 8 }}>
                    <input type="checkbox" checked={skillShardsEnabled} onChange={(e) => setSkillShardsEnabled(e.target.checked)} />
                    Include in EV
                  </label>
                  <Stepper
                    label="Skill Shard Chance (%)"
                    value={params.skill_shard_chance * 100}
                    onChange={(v) => setParams((s) => ({ ...s, skill_shard_chance: v / 100 }))}
                    step={1}
                    min={0}
                    max={100}
                    decimals={1}
                    disabled={!skillShardsEnabled}
                  />
                </div>
              </Collapsible>

              <div className="gemEvDivider" />

              <Collapsible
                id="gemev-stonks"
                title="Stonks (Freebie)"
                defaultExpanded={false}
                headerRight={
                  <>
                    <Sprite path="sprites/common/stonks_tree.png" alt="Stonks" className="iconSmall" />
                    <Tooltip
                      content={{
                        title: "Source of values",
                        lines: ["Take the chance, bonus, and multiplier values from the Chest Stats area (Stats button)."],
                      }}
                      label="?"
                    />
                  </>
                }
              >
                <div className="gemEvSectionBody" style={{ paddingTop: 4 }}>
                  {/* Tier 1: Stonks (lightest green) */}
                  <div className="gemEvStonksTier gemEvStonksTier1">
                    <div className="gemEvInlineHead">
                      <span className="mono">Stonks</span>
                    </div>
                    <label className="toggle" style={{ marginTop: 4 }}>
                      <input type="checkbox" checked={stonksEnabled} onChange={(e) => setStonksEnabled(e.target.checked)} />
                      Stonks enabled (1% chance, 200 Gems base)
                    </label>
                    <Stepper
                      label="Stonks multiplier (×)"
                      value={params.stonks_multiplier ?? 1}
                      onChange={(v) => setParams((s) => ({ ...s, stonks_multiplier: v }))}
                      step={0.1}
                      min={0}
                      max={999}
                      decimals={1}
                      disabled={!stonksEnabled}
                    />
                  </div>

                  {/* Tier 2: Super Stonks (medium green) */}
                  <div className="gemEvStonksTier gemEvStonksTier2">
                    <div className="gemEvInlineHead">
                      <span className="mono">Super Stonks</span>
                      <Tooltip
                        content={{
                          title: "Super Stonks",
                          lines: ["Only rolls when Stonks triggered on the same claim (first roll)."],
                        }}
                        label="?"
                      />
                    </div>
                    <Stepper
                      label="Super Stonks chance (%)"
                      value={(params.super_stonks_chance ?? 0) * 100}
                      onChange={(v) => setParams((s) => ({ ...s, super_stonks_chance: v / 100 }))}
                      step={0.5}
                      min={0}
                      max={100}
                      decimals={1}
                    />
                    <Stepper
                      label="Super Stonks bonus (Gems)"
                      value={params.super_stonks_bonus_gems ?? 0}
                      onChange={(v) => setParams((s) => ({ ...s, super_stonks_bonus_gems: v }))}
                      step={10}
                      min={0}
                      max={99999}
                      decimals={0}
                    />
                    <Stepper
                      label="Super Stonks multiplier (×)"
                      value={params.super_stonks_multiplier ?? 1}
                      onChange={(v) => setParams((s) => ({ ...s, super_stonks_multiplier: v }))}
                      step={0.1}
                      min={0}
                      max={999}
                      decimals={1}
                    />
                  </div>

                  {/* Tier 3: Ultra Stonks (darkest green) */}
                  <div className="gemEvStonksTier gemEvStonksTier3">
                    <div className="gemEvInlineHead">
                      <span className="mono">Ultra Stonks</span>
                      <Tooltip
                        content={{
                          title: "Ultra Stonks",
                          lines: ["Only rolls when Super Stonks triggered on the same claim."],
                        }}
                        label="?"
                      />
                    </div>
                    <Stepper
                      label="Ultra Stonks chance (%)"
                      value={(params.ultra_stonks_chance ?? 0) * 100}
                      onChange={(v) => setParams((s) => ({ ...s, ultra_stonks_chance: v / 100 }))}
                      step={0.5}
                      min={0}
                      max={100}
                      decimals={1}
                    />
                    <Stepper
                      label="Ultra Stonks bonus (Gems)"
                      value={params.ultra_stonks_bonus_gems ?? 0}
                      onChange={(v) => setParams((s) => ({ ...s, ultra_stonks_bonus_gems: v }))}
                      step={10}
                      min={0}
                      max={99999}
                      decimals={0}
                    />
                    <Stepper
                      label="Ultra Stonks multiplier (×)"
                      value={params.ultra_stonks_multiplier ?? 1}
                      onChange={(v) => setParams((s) => ({ ...s, ultra_stonks_multiplier: v }))}
                      step={0.1}
                      min={0}
                      max={999}
                      decimals={1}
                    />
                  </div>

                  {/* Stonks all multiplier */}
                  <div className="gemEvInlineHead" style={{ marginTop: 4 }}>
                    <span className="mono">Stonks all multiplier</span>
                    <Tooltip
                      content={{
                        title: "Stonks all multiplier",
                        lines: ["Applied to the sum of Stonks + Super Stonks + Ultra Stonks EV."],
                      }}
                      label="?"
                    />
                  </div>
                  <Stepper
                    label="Stonks all multiplier (×)"
                    value={params.stonks_all_multiplier ?? 1}
                    onChange={(v) => setParams((s) => ({ ...s, stonks_all_multiplier: v }))}
                    step={0.1}
                    min={0}
                    max={999}
                    decimals={1}
                  />
                </div>
              </Collapsible>

              <div className="gemEvDivider" />

              <div className="gemEvInlineHead">
                <span className="mono">Jackpot (Freebie)</span>
              </div>
              <Stepper
                label="Jackpot Chance (%)"
                value={params.jackpot_chance * 100}
                onChange={(v) => setParams((s) => ({ ...s, jackpot_chance: v / 100 }))}
                step={1}
                min={0}
                max={100}
                decimals={1}
              />

              <div className="gemEvDivider" />

              <div className="gemEvInlineHead">
                <span className="mono">Refresh (Freebie)</span>
              </div>
              <Stepper
                label="Instant Refresh Chance (%)"
                value={params.instant_refresh_chance * 100}
                onChange={(v) => setParams((s) => ({ ...s, instant_refresh_chance: v / 100 }))}
                step={1}
                min={0}
                max={99}
                decimals={1}
              />
            </div>
          </Collapsible>

          <Collapsible
            id="gemev-founder"
            title="Founder / VIP"
            defaultExpanded={false}
            className="gemEvSection tierHeader2"
            headerRight={
              <>
                <Sprite path="sprites/event/founderbomb.png" alt="Founder" className="iconSmall" />
                <Tooltip content={founderInfo} />
                <label className="toggle" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(params.founder_enabled)}
                    onChange={(e) => setParams((s) => ({ ...s, founder_enabled: e.target.checked }))}
                  />
                  FOUNDER enabled
                </label>
              </>
            }
          >
            <div className="gemEvSectionBody">
              <Stepper
                label="VIP Lounge Level (1–12)"
                value={params.vip_lounge_level}
                onChange={(v) => setParams((s) => ({ ...s, vip_lounge_level: clampInt(v, 1, 12) }))}
                step={1}
                min={1}
                max={12}
                inputMode="numeric"
                decimals={0}
                disabled={!params.founder_enabled}
              />
              <Stepper
                label="Obelisk Level"
                value={params.obelisk_level}
                onChange={(v) => setParams((s) => ({ ...s, obelisk_level: clampInt(v, 0, 999) }))}
                step={1}
                min={0}
                max={999}
                inputMode="numeric"
                decimals={0}
                disabled={!params.founder_enabled}
              />
            </div>
          </Collapsible>

          <Collapsible
            id="gemev-bombs"
            title="BOMBS"
            defaultExpanded={false}
            className="gemEvSection tierHeader3"
            headerRight={<Tooltip content={bombsInfo} />}
          >
            <div className="gemEvSectionBody">
              {(external10x.lootbug > 0 || external10x.drone > 0) ? (
                <div className="gemEvRow gemEvBomb10xGlow">
                  <span className="mono small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <img
                      src="https://static.wikitide.net/shminerwiki/b/ba/Bomb_Recharge_Speed_10x_Buff.png"
                      alt="10× Bomb Recharge"
                      className="iconSmall"
                      style={{ width: 24, height: 24, objectFit: "contain" }}
                    />
                    10× Bomb Recharge (Lootbug + Drone)
                    <Tooltip
                      content={{
                        title: "10× Bomb Recharge min/h",
                        sections: [
                          {
                            heading: "Source",
                            lines: [
                              "Sum of Lootbug and Elixir Drone 10× Bomb Recharge min/h. Opens Lootbug/Drone to update.",
                              "Effective bomb recharge in calculations is divided by (1 + 9×uptime); 60 min/h ⇒ ÷10.",
                            ],
                          },
                        ],
                      }}
                      label="?"
                    />
                  </span>
                  <span className="mono small">{external10x.total.toFixed(1)} min/h</span>
                </div>
              ) : null}
              <Stepper
                label="Free Bomb Chance (%)"
                value={params.free_bomb_chance * 100}
                onChange={(v) => setParams((s) => ({ ...s, free_bomb_chance: v / 100 }))}
                step={1}
                min={0}
                max={99}
                decimals={1}
              />

              <div className="gemEvDivider" />

              {FOUNDER_BOMB_VISIBLE ? (
                <>
                  <div className="gemEvSubSection">
                    <div className="gemEvSubHeader">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="mono" style={{ fontWeight: 900 }}>
                          Founder Bomb
                        </span>
                        <Sprite path="sprites/event/founderbomb.png" alt="Founder Bomb" className="iconSmall" />
                      </div>
                      <CardToggles
                        value={params.founder_bomb_recharge_card_level}
                        disabled={!params.founder_enabled}
                        onChange={(lvl) => setParams((s) => ({ ...s, founder_bomb_recharge_card_level: lvl }))}
                      />
                    </div>

                    <Stepper
                      label="Founder Bomb Interval (Seconds)"
                      value={params.founder_bomb_interval_seconds}
                      onChange={(v) => setParams((s) => ({ ...s, founder_bomb_interval_seconds: v }))}
                      step={0.01}
                      min={0.1}
                      max={9999}
                      decimals={2}
                      disabled={!params.founder_enabled}
                    />
                    <p className="small" style={{ margin: "4px 0 0" }}>
                      10% chance for 10 s of 2× speed (fixed).
                    </p>
                  </div>
                  <div className="gemEvDivider" />
                </>
              ) : null}

              <div className="gemEvInlineHead">
                <span className="mono">Bomb cycle</span>
              </div>
              <div className="gemEvRow" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <label className="toggle" style={{ margin: 0 }}>
                  <input
                    type="radio"
                    name="bomb_cycle"
                    checked={(params.bomb_cycle ?? "early") === "early"}
                    onChange={() => setParams((s) => ({ ...s, bomb_cycle: "early" }))}
                  />
                  Early: Cherry → Battery → D20 → Gem
                </label>
                <label className="toggle" style={{ margin: 0 }}>
                  <input
                    type="radio"
                    name="bomb_cycle"
                    checked={(params.bomb_cycle ?? "early") === "late"}
                    onChange={() => setParams((s) => ({ ...s, bomb_cycle: "late" }))}
                  />
                  Late: Cherry → Gem → Battery → D20
                </label>
              </div>

              <div className="gemEvDivider" />

              <div className="gemEvInlineHead">
                <span className="mono">Count as bomb types</span>
              </div>
              <div className="gemEvRow" style={{ flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <label className="toggle" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={params.include_founder_bomb_in_total ?? true}
                    onChange={(e) => setParams((s) => ({ ...s, include_founder_bomb_in_total: e.target.checked }))}
                  />
                  <Sprite path="sprites/event/founderbomb.png" alt="Founder Bomb" className="iconSmall" />
                  Founder Bomb
                </label>
                <label className="toggle" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={params.has_veinmorph_bomb ?? true}
                    onChange={(e) => setParams((s) => ({ ...s, has_veinmorph_bomb: e.target.checked }))}
                  />
                  <Sprite path="sprites/event/veinmorph.png" alt="Veinmorph" className="iconSmall" label="sprites/event/veinmorph.png" />
                  Veinmorph
                </label>
                <label className="toggle" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={params.has_megabomb ?? false}
                    onChange={(e) => setParams((s) => ({ ...s, has_megabomb: e.target.checked }))}
                  />
                  <Sprite path="sprites/event/megabomb.png" alt="Megabomb" className="iconSmall" label="sprites/event/megabomb.png" />
                  Megabomb
                </label>
                <span className="mono small" style={{ opacity: 0.9 }}>
                  Total: {effectiveParams.total_bomb_types}
                </span>
              </div>

              <div className="gemEvDivider" />

              <div className="gemEvBombBlock">
                <div className="gemEvBombHeader">
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="mono" style={{ fontWeight: 900 }}>
                      Gem Bomb
                    </span>
                    <Sprite path="sprites/event/gembomb.png" alt="Gem Bomb" className="iconSmall" />
                    <Tooltip content={{ title: "Gem Bomb", lines: ["As shown in bomb's ingame tooltip."] }} />
                  </div>
                  <CardToggles value={params.gem_bomb_recharge_card_level} onChange={(lvl) => setParams((s) => ({ ...s, gem_bomb_recharge_card_level: lvl }))} />
                </div>
                <Stepper
                  label={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      Recharge (seconds, without Chaos Totem{" "}
                      <img src={CHAOS_TOTEM_ICON} alt="Chaos Totem" className="iconSmall" aria-hidden />
                      )
                    </span>
                  }
                  value={params.gem_bomb_recharge_seconds}
                  onChange={(v) => setParams((s) => ({ ...s, gem_bomb_recharge_seconds: v }))}
                  step={0.01}
                  min={0.1}
                  max={9999}
                  decimals={2}
                />
                <Stepper
                  label="Gem Chance per Charge (%)"
                  value={params.gem_bomb_gem_chance * 100}
                  onChange={(v) => setParams((s) => ({ ...s, gem_bomb_gem_chance: v / 100 }))}
                  step={0.5}
                  min={0}
                  max={100}
                  decimals={1}
                />
              </div>

              <div className="gemEvDivider" />

              <div className="gemEvBombBlock">
                <div className="gemEvBombHeader">
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="mono" style={{ fontWeight: 900 }}>
                      Cherry Bomb
                    </span>
                    <Sprite path="sprites/event/cherrybomb.png" alt="Cherry Bomb" className="iconSmall" />
                    <Tooltip content={{ title: "Cherry Bomb", lines: ["As shown in bomb's ingame tooltip."] }} />
                  </div>
                  <CardToggles value={params.cherry_bomb_recharge_card_level} onChange={(lvl) => setParams((s) => ({ ...s, cherry_bomb_recharge_card_level: lvl }))} />
                </div>
                <Stepper
                  label={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      Recharge (seconds, without Chaos Totem{" "}
                      <img src={CHAOS_TOTEM_ICON} alt="Chaos Totem" className="iconSmall" aria-hidden />
                      )
                    </span>
                  }
                  value={params.cherry_bomb_recharge_seconds}
                  onChange={(v) => setParams((s) => ({ ...s, cherry_bomb_recharge_seconds: v }))}
                  step={0.01}
                  min={0.1}
                  max={9999}
                  decimals={2}
                />
                <Stepper
                  label={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      3× Charges Chance (%)
                      <Tooltip
                        content={{
                          title: "3× charges chance",
                          sections: [
                            {
                              heading: "Where to find it",
                              lines: [
                                <span key="workshop" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                  <img src={WORKSHOP_BUTTON_ICON} alt="Workshop" style={{ width: 18, height: 18, objectFit: "contain" }} />
                                  Look up your value in the Workshop (Bombs section).
                                </span>,
                              ],
                            },
                          ],
                        }}
                      />
                    </span>
                  }
                  value={params.cherry_bomb_triple_charge_chance * 100}
                  onChange={(v) => setParams((s) => ({ ...s, cherry_bomb_triple_charge_chance: v / 100 }))}
                  step={1}
                  min={0}
                  max={100}
                  decimals={1}
                />
              </div>

              <div className="gemEvDivider" />

              <div className="gemEvBombBlock">
                <div className="gemEvBombHeader">
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="mono" style={{ fontWeight: 900 }}>
                      Battery Bomb
                    </span>
                    <Sprite path="sprites/common/battery_bomb.png" alt="Battery Bomb" className="iconSmall" label="sprites/common/battery_bomb.png" />
                    <Tooltip content={{ title: "Battery Bomb", lines: ["As shown in bomb's ingame tooltip."] }} />
                  </div>
                  <CardToggles value={params.battery_bomb_recharge_card_level} onChange={(lvl) => setParams((s) => ({ ...s, battery_bomb_recharge_card_level: lvl }))} />
                </div>
                <Stepper
                  label={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      Recharge (seconds, without Chaos Totem{" "}
                      <img src={CHAOS_TOTEM_ICON} alt="Chaos Totem" className="iconSmall" aria-hidden />
                      )
                    </span>
                  }
                  value={params.battery_bomb_recharge_seconds}
                  onChange={(v) => setParams((s) => ({ ...s, battery_bomb_recharge_seconds: v }))}
                  step={0.01}
                  min={0.1}
                  max={9999}
                  decimals={2}
                />
              </div>

              <div className="gemEvDivider" />

              <div className="gemEvBombBlock">
                <div className="gemEvBombHeader">
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="mono" style={{ fontWeight: 900 }}>
                      D20 Bomb
                    </span>
                    <Sprite path="sprites/common/d20_bomb.png" alt="D20 Bomb" className="iconSmall" label="sprites/common/d20_bomb.png" />
                    <Tooltip content={{ title: "D20 Bomb", lines: ["As shown in bomb's ingame tooltip."] }} />
                  </div>
                  <CardToggles value={params.d20_bomb_recharge_card_level} onChange={(lvl) => setParams((s) => ({ ...s, d20_bomb_recharge_card_level: lvl }))} />
                </div>
                <Stepper
                  label={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      Recharge (seconds, without Chaos Totem{" "}
                      <img src={CHAOS_TOTEM_ICON} alt="Chaos Totem" className="iconSmall" aria-hidden />
                      )
                    </span>
                  }
                  value={params.d20_bomb_recharge_seconds}
                  onChange={(v) => setParams((s) => ({ ...s, d20_bomb_recharge_seconds: v }))}
                  step={0.01}
                  min={0.1}
                  max={9999}
                  decimals={2}
                />
                <Stepper
                  label="Charges Distributed"
                  value={params.d20_bomb_charges_distributed}
                  onChange={(v) => setParams((s) => ({ ...s, d20_bomb_charges_distributed: clampInt(v, 0, 9999) }))}
                  step={1}
                  min={0}
                  max={9999}
                  inputMode="numeric"
                  decimals={0}
                />
                <Stepper
                  label="Refill Chance (%)"
                  value={params.d20_bomb_refill_chance * 100}
                  onChange={(v) => setParams((s) => ({ ...s, d20_bomb_refill_chance: v / 100 }))}
                  step={0.5}
                  min={0}
                  max={100}
                  decimals={1}
                />
              </div>
            </div>
          </Collapsible>

        {chartOpen ? (
          <div className="modalOverlay" onMouseDown={() => setChartOpen(false)}>
            <div className="modalWindow" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHeader">
                <div>
                  <div className="mono" style={{ fontWeight: 900 }}>
                    Overview chart
                  </div>
                  <div className="small">Stacked: Base / Jackpot / Refresh (Base) / Refresh (Jackpot)</div>
                </div>
                <button className="btn btnSecondary" type="button" onClick={() => setChartOpen(false)}>
                  Close
                </button>
              </div>
              <div className="modalBody">
                <div className="gemEvChartBlock">
                  <div className="gemEvChartLegendTop" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 16px", marginBottom: 8 }}>
                    {showJackpotRefresh ? <ContribLegend /> : null}
                    <label className="gemEvChartToggle" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 700, color: "rgba(15,23,42,0.85)" }}>
                      <input
                        type="checkbox"
                        checked={showJackpotRefresh}
                        onChange={(e) => setShowJackpotRefresh(e.target.checked)}
                        aria-label="Show Jackpot/Refresh contribution"
                      />
                      <span>Show Jackpot/Refresh contribution</span>
                    </label>
                  </div>
                  <ContribBarChart
                    ev={ev}
                    breakdown={breakdown}
                    lootbugNetGemsPerHour={external.lootbugNetGemsPerHour}
                    droneFuelGemsPerHour={external.droneFuelGemsPerHour > 0 ? -external.droneFuelGemsPerHour : undefined}
                    gemBomb10xImpact={gemBomb10xImpact}
                    chaosTotemImpact={chaosTotemImpact}
                    chargeMagnetImpact={chargeMagnetImpactResolved}
                    showJackpotRefresh={showJackpotRefresh}
                    skillShardsEnabled={skillShardsEnabled}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

