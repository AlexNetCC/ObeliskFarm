import { useEffect, useMemo, useRef, useState } from "react";
import "../gemev/gemev.css";
import "./bombs.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
import { assetUrl } from "../../lib/assets";
import { loadJson, saveJson } from "../../lib/storage";
import { calculateGemBombGemsPerHour, defaultGameParameters, getGameSpeedBonus, getGemBombGemChanceT12Bonus, type GameParameters } from "../../lib/gemev/freebieEv";

const STORAGE_KEY = "obeliskfarm:web:bombs_save.json:v1";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";
const CHAOS_TOTEM_ICON = "https://static.wikitide.net/shminerwiki/a/a6/Chaos_Totem.png";
const WORKSHOP_BUTTON_ICON = "https://static.wikitide.net/shminerwiki/6/6f/Workshop_Button.png";
const FOUNDER_BOMB_VISIBLE = false;
const AUTO_BOMBER_INTERVAL_GAME_SEC = 1.25;

function rechargeChargeMultiplier(cardLevel: number): number {
  const lvl = Math.max(0, Math.min(3, Math.trunc(cardLevel)));
  if (lvl === 1) return 1.5;
  if (lvl === 2) return 2.0;
  if (lvl === 3) return 3.0;
  return 1.0;
}

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
  showButtons?: boolean;
}) {
  const { label, value, onChange, step = 1, min = -Infinity, max = Infinity, inputMode = "decimal", decimals = 2, disabled = false, showButtons = true } = props;
  const isEditingRef = useRef(false);
  const formatDisplay = (v: number) => (Number.isFinite(v) ? v.toFixed(decimals) : "");
  const [raw, setRaw] = useState<string>(() => formatDisplay(value));

  useEffect(() => {
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
          onFocus={() => { isEditingRef.current = true; }}
          onChange={(e) => { isEditingRef.current = true; setRaw(e.target.value); }}
          onBlur={() => commit()}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        />
        {showButtons && (
          <button className="btn gemEvStepBtn" type="button" disabled={disabled} onClick={() => onChange(clamp(value + step, min, max))}>+</button>
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

function normalizeBombParams(p: GameParameters, external10xTotal: number): GameParameters {
  const params = { ...p };
  params.battery_bomb_charges_per_charge = 2.0;
  params.battery_bomb_cap_increase_chance = 0.001;
  params.founder_bomb_charges_per_drop = 2.0;
  params.founder_bomb_speed_chance = 0.10;
  params.founder_bomb_speed_multiplier = 2.0;
  params.founder_bomb_speed_duration_seconds = 10.0;

  const includeFounder = params.include_founder_bomb_in_total ?? params.founder_enabled;
  const hasVeinmorph = "has_veinmorph_bomb" in params ? params.has_veinmorph_bomb : true;
  const hasMegabomb = "has_megabomb" in params ? params.has_megabomb : false;
  params.total_bomb_types = 10 + (includeFounder ? 1 : 0) + (hasVeinmorph ? 1 : 0) + (hasMegabomb ? 1 : 0);

  params.free_bomb_chance = clamp(params.free_bomb_chance, 0, 0.99);
  params.gem_bomb_gem_chance = clamp(params.gem_bomb_gem_chance, 0, 1);
  params.cherry_bomb_triple_charge_chance = clamp(params.cherry_bomb_triple_charge_chance, 0, 1);
  params.d20_bomb_refill_chance = clamp(params.d20_bomb_refill_chance, 0, 1);
  params.d20_bomb_charges_distributed = clampInt(params.d20_bomb_charges_distributed, 0, 9999);

  params.gem_bomb_recharge_card_level = clampInt(params.gem_bomb_recharge_card_level, 0, 3);
  params.cherry_bomb_recharge_card_level = clampInt(params.cherry_bomb_recharge_card_level, 0, 3);
  params.battery_bomb_recharge_card_level = clampInt(params.battery_bomb_recharge_card_level, 0, 3);
  params.d20_bomb_recharge_card_level = clampInt(params.d20_bomb_recharge_card_level, 0, 3);
  params.founder_bomb_recharge_card_level = clampInt(params.founder_bomb_recharge_card_level, 0, 3);

  params.gem_bomb_recharge_seconds = clamp(params.gem_bomb_recharge_seconds, 0.1, 10_000);
  params.cherry_bomb_recharge_seconds = clamp(params.cherry_bomb_recharge_seconds, 0.1, 10_000);
  params.battery_bomb_recharge_seconds = clamp(params.battery_bomb_recharge_seconds, 0.1, 10_000);
  params.d20_bomb_recharge_seconds = clamp(params.d20_bomb_recharge_seconds, 0.1, 10_000);
  params.founder_bomb_interval_seconds = clamp(params.founder_bomb_interval_seconds, 0.1, 10_000);
  params.founder_bomb_speed_multiplier = clamp(params.founder_bomb_speed_multiplier, 0.1, 100);
  params.founder_bomb_speed_duration_seconds = clamp(params.founder_bomb_speed_duration_seconds, 0, 10_000);

  params.bomb_recharge_10x_min_per_hour = external10xTotal;
  return params;
}

const bombsInfo = {
  title: "Bombs",
  sections: [
    { heading: "Free Bomb Chance", lines: ["Chance that a bomb click consumes 0 charges.", "Applies to the entire dump (all charges at once).", "Affects all bomb types."] as string[] },
    { heading: "Bomb cycle", lines: ["Early: Cherry → Battery → D20 → Gem.", "Late: Cherry → Gem → Battery → D20. Cherry triple-charge bonus counts as extra gem bomb detonations (direct gem EV)."] as string[] },
    { heading: "Total bomb types", lines: ["Count Founder Bomb, Veinmorph, and Megabomb. Base 10 + checked = total (max 13).", "More bomb types = refill is more widely distributed (Battery and D20 spread charges across more targets)."] as string[] },
    { heading: "Refill", lines: ["Battery bomb: refills all bomb types (Gem, Cherry, Battery, D20, and others) including itself (self-refill).", "D20 bomb: refills all bomb types including itself (self-refill).", "Charges are distributed evenly across all types (divided by total bomb types − 1 in the formula)."] as string[] },
  ],
};

export function Bombs() {
  const initial = useMemo(() => {
    const base = defaultGameParameters();
    const saved = loadJson<{ params?: Partial<GameParameters>; chaosTotem100Uptime?: boolean }>(STORAGE_KEY);
    return { ...base, ...(saved?.params ?? {}) } as GameParameters;
  }, []);

  const [params, setParams] = useState<GameParameters>(initial);
  const [chaosTotem100Uptime, setChaosTotem100Uptime] = useState(() => {
    const saved = loadJson<{ chaosTotem100Uptime?: boolean }>(STORAGE_KEY);
    return saved?.chaosTotem100Uptime ?? false;
  });
  const [autoBomberOfflineGains, setAutoBomberOfflineGains] = useState(false);

  const externalFromGemEv = useMemo(() => {
    const ext = loadJson<{
      lootbugBomb10xMinPerHour?: number;
      droneBomb10xMinPerHour?: number;
      game_speed_multiplier?: number;
      chaosTotemUptimePct?: number;
    }>(GEMEV_EXTERNAL_KEY);
    const lootbug = typeof ext?.lootbugBomb10xMinPerHour === "number" ? ext.lootbugBomb10xMinPerHour : 0;
    const drone = typeof ext?.droneBomb10xMinPerHour === "number" ? ext.droneBomb10xMinPerHour : 0;
    const gameSpeed = typeof ext?.game_speed_multiplier === "number" && ext.game_speed_multiplier >= 1 && ext.game_speed_multiplier <= 10
      ? ext.game_speed_multiplier
      : undefined;
    const chaosTotemUptimePct = typeof ext?.chaosTotemUptimePct === "number" ? ext.chaosTotemUptimePct : undefined;
    return { lootbug, drone, total: lootbug + drone, game_speed_multiplier: gameSpeed, chaosTotemUptimePct };
  }, []); // re-read when module is shown (component remounts when switching back from Gem EV / Items / Lootbug / Drone)

  useEffect(() => {
    const t = window.setTimeout(() => saveJson(STORAGE_KEY, { params, chaosTotem100Uptime }), 250);
    return () => window.clearTimeout(t);
  }, [params, chaosTotem100Uptime]);

  const effectiveParams = useMemo(() => {
    const p = normalizeBombParams(params, externalFromGemEv.total);
    if (typeof externalFromGemEv.game_speed_multiplier === "number") {
      p.game_speed_multiplier = externalFromGemEv.game_speed_multiplier;
    }
    // When 100%: recharge fields are in-game values (already /2 by Chaos Totem), so do not apply Chaos again (= 0).
    // When off: recharge fields are base; no Chaos applied here (Items may set uptime for Gem EV).
    p.chaos_totem_uptime = 0;
    return p;
  }, [params, externalFromGemEv.total, externalFromGemEv.game_speed_multiplier, chaosTotem100Uptime]);

  const gemBombGemsPerHour = useMemo(() => calculateGemBombGemsPerHour(effectiveParams), [effectiveParams]);
  const gemBomb10xImpact = useMemo(() => {
    const without10x = calculateGemBombGemsPerHour({ ...effectiveParams, bomb_recharge_10x_min_per_hour: 0 });
    return Math.max(0, gemBombGemsPerHour - without10x);
  }, [effectiveParams, gemBombGemsPerHour]);
  /** When 100%: recharge params are in-game (already /2), so impact = current − gem EV with doubled recharge (simulating no Chaos). Otherwise 0 (Items supplies impact from uptime). */
  const chaosTotemImpact = useMemo(() => {
    if (!chaosTotem100Uptime) return 0;
    const p = effectiveParams;
    const withDoubledRecharge: GameParameters = {
      ...p,
      gem_bomb_recharge_seconds: (p.gem_bomb_recharge_seconds ?? 1) * 2,
      cherry_bomb_recharge_seconds: (p.cherry_bomb_recharge_seconds ?? 1) * 2,
      battery_bomb_recharge_seconds: (p.battery_bomb_recharge_seconds ?? 1) * 2,
      d20_bomb_recharge_seconds: (p.d20_bomb_recharge_seconds ?? 1) * 2,
    };
    const withChaos = calculateGemBombGemsPerHour(p);
    const withoutChaos = calculateGemBombGemsPerHour(withDoubledRecharge);
    return Math.max(0, withChaos - withoutChaos);
  }, [chaosTotem100Uptime, effectiveParams]);

  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(GEMEV_EXTERNAL_KEY) ?? {};
    ext.gemBombGemsPerHourFromBombs = gemBombGemsPerHour;
    ext.gemBomb10xImpactFromBombs = gemBomb10xImpact;
    ext.chaosTotem100FromBombs = chaosTotem100Uptime;
    if (chaosTotem100Uptime) {
      ext.chaosTotemImpactFromBombs = chaosTotemImpact;
      ext.chaosTotemImpact = chaosTotemImpact;
      ext.chaosTotemUptimePct = 100;
    } else {
      ext.chaosTotemImpactFromBombs = 0;
      // Do not overwrite chaosTotemUptimePct or chaosTotemImpact so Items can supply them for the chart.
    }
    ext.gemBomb10xImpact = gemBomb10xImpact;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [gemBombGemsPerHour, gemBomb10xImpact, chaosTotemImpact, chaosTotem100Uptime]);

  const gameSpeedMult = typeof externalFromGemEv.game_speed_multiplier === "number" ? externalFromGemEv.game_speed_multiplier : 1.0;
  const autoBomberStats = useMemo(() => {
    const drone10xMinPerHour = autoBomberOfflineGains ? 0 : externalFromGemEv.drone;
    const drone10xUptime = drone10xMinPerHour / 60.0;
    const bomb10xFactor = 1.0 + 9.0 * drone10xUptime;
    const chaosUptime = chaosTotem100Uptime ? 1.0 : 0.0;
    const chaosFactor = 1.0 + chaosUptime;
    const gameSpeedBonus = getGameSpeedBonus({ ...effectiveParams, game_speed_multiplier: gameSpeedMult });
    const effGemSec = Math.max(0.01, params.gem_bomb_recharge_seconds) / (1.0 + gameSpeedBonus) / bomb10xFactor / chaosFactor;
    const freeBombMult = 1.0 / (1.0 - Math.max(0, Math.min(0.99, params.free_bomb_chance)));
    const gemMult = rechargeChargeMultiplier(params.gem_bomb_recharge_card_level);
    const gemBombsRechargedPerHour = (3600 / effGemSec) * gemMult * freeBombMult;
    const intervalRealSec = AUTO_BOMBER_INTERVAL_GAME_SEC / gameSpeedMult;
    const gemBombsDroppedPerHour = intervalRealSec > 0 ? 3600 / intervalRealSec : 0;
    const effectiveGemBombsPerHour = Math.min(gemBombsDroppedPerHour, gemBombsRechargedPerHour);
    const gemChance = Math.max(0, Math.min(1, params.gem_bomb_gem_chance)) + getGemBombGemChanceT12Bonus(effectiveParams);
    const gemEVPerHour = effectiveGemBombsPerHour * gemChance;
    const rechargeMinusDropped = gemBombsRechargedPerHour - gemBombsDroppedPerHour;
    return { gemBombsDroppedPerHour, gemBombsRechargedPerHour, gemEVPerHour, rechargeMinusDropped };
  }, [effectiveParams, params.free_bomb_chance, params.gem_bomb_recharge_seconds, params.gem_bomb_recharge_card_level, params.gem_bomb_gem_chance, externalFromGemEv.drone, externalFromGemEv.game_speed_multiplier, gameSpeedMult, chaosTotem100Uptime, autoBomberOfflineGains]);

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="title">Bombs</h1>
          <p className="subtitle">Same bomb parameters as in Gem EV Calculator. Edit here for a dedicated view; state is separate from Gem EV.</p>
        </div>
      </div>

      <div className="panel bombsModule" style={{ maxWidth: 720, margin: "0 auto" }}>
        <div className={`bombsGameSpeedToggle ${gameSpeedMult > 1 ? "bombsGameSpeedToggleOn" : ""}`}>
          <div className="bombsGameSpeedReadOnly">
            <span className="bombsGameSpeedLabel">
              Game speed
              <Tooltip
                content={{
                  title: "Game speed",
                  sections: [
                    {
                      heading: "Source",
                      lines: [
                        "Taken from Gem EV Calculator. Same value as Stats screen.",
                        "Auto-bomber interval and recharge in real time = game time ÷ game speed.",
                      ],
                    },
                    { heading: "Edit", lines: ["Change it in the Gem EV Calculator module."] },
                  ],
                }}
                label="?"
              />
            </span>
            <span className="mono bombsGameSpeedValue">{gameSpeedMult.toFixed(2)}×</span>
          </div>
          <label className="toggle bombsChaosTotem100Toggle" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 0 }}>
            <input
              type="checkbox"
              checked={chaosTotem100Uptime}
              onChange={(e) => setChaosTotem100Uptime(e.target.checked)}
            />
            <img src={CHAOS_TOTEM_ICON} alt="" className="iconSmall" style={{ width: 20, height: 20 }} aria-hidden />
            <span>Chaos Totem 100% Uptime?</span>
            <Tooltip
              content={{
                title: "Chaos Totem 100% Uptime",
                lines: [
                  "When checked, enter the in-game recharge times (the values shown in game, already with Chaos Totem active). The formula does not apply Chaos again.",
                  "When unchecked, enter base recharge (without Chaos Totem). Chaos Totem uptime can come from Items (chests × duration).",
                ],
              }}
              label="?"
            />
          </label>
        </div>
        <Collapsible
          id="bombs-bomb-input"
          title="Bomb Input"
          defaultExpanded={false}
          className="gemEvSection tierHeader1"
          headerRight={<Tooltip content={bombsInfo} label="?" />}
        >
        <div className="gemEvSectionBody">
          {(externalFromGemEv.lootbug > 0 || externalFromGemEv.drone > 0) ? (
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
                          "Sum of Lootbug and Elixir Drone 10× Bomb Recharge min/h. Open Lootbug or Drone to update.",
                          "Effective bomb recharge in calculations is divided by (1 + 9×uptime); 60 min/h ⇒ ÷10.",
                        ],
                      },
                    ],
                  }}
                  label="?"
                />
              </span>
              <span className="mono small">{externalFromGemEv.total.toFixed(1)} min/h</span>
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
                    <span className="mono" style={{ fontWeight: 900 }}>Founder Bomb</span>
                    <Sprite path="sprites/event/founderbomb.png" alt="Founder Bomb" className="iconSmall" />
                  </div>
                  <CardToggles value={params.founder_bomb_recharge_card_level} disabled={!params.founder_enabled} onChange={(lvl) => setParams((s) => ({ ...s, founder_bomb_recharge_card_level: lvl }))} />
                </div>
                <Stepper label="Founder Bomb Interval (Seconds)" value={params.founder_bomb_interval_seconds} onChange={(v) => setParams((s) => ({ ...s, founder_bomb_interval_seconds: v }))} step={0.01} min={0.1} max={9999} decimals={2} disabled={!params.founder_enabled} />
                <p className="small" style={{ margin: "4px 0 0" }}>10% chance for 10 s of 2× speed (fixed).</p>
              </div>
              <div className="gemEvDivider" />
            </>
          ) : null}

          <div className="gemEvInlineHead"><span className="mono">Bomb cycle</span></div>
          <div className="gemEvRow" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <label className="toggle" style={{ margin: 0 }}>
              <input type="radio" name="bomb_cycle" checked={(params.bomb_cycle ?? "early") === "early"} onChange={() => setParams((s) => ({ ...s, bomb_cycle: "early" }))} />
              Early: Cherry → Battery → D20 → Gem
            </label>
            <label className="toggle" style={{ margin: 0 }}>
              <input type="radio" name="bomb_cycle" checked={(params.bomb_cycle ?? "early") === "late"} onChange={() => setParams((s) => ({ ...s, bomb_cycle: "late" }))} />
              Late: Cherry → Gem → Battery → D20
            </label>
          </div>

          <div className="gemEvDivider" />

          <div className="gemEvInlineHead"><span className="mono">Count as bomb types</span></div>
          <div className="gemEvRow" style={{ flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <label className="toggle" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={params.include_founder_bomb_in_total ?? true} onChange={(e) => setParams((s) => ({ ...s, include_founder_bomb_in_total: e.target.checked }))} />
              <Sprite path="sprites/event/founderbomb.png" alt="Founder Bomb" className="iconSmall" />
              Founder Bomb
            </label>
            <label className="toggle" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={params.has_veinmorph_bomb ?? true} onChange={(e) => setParams((s) => ({ ...s, has_veinmorph_bomb: e.target.checked }))} />
              <Sprite path="sprites/event/veinmorph.png" alt="Veinmorph" className="iconSmall" label="sprites/event/veinmorph.png" />
              Veinmorph
            </label>
            <label className="toggle" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={params.has_megabomb ?? false} onChange={(e) => setParams((s) => ({ ...s, has_megabomb: e.target.checked }))} />
              <Sprite path="sprites/event/megabomb.png" alt="Megabomb" className="iconSmall" label="sprites/event/megabomb.png" />
              Megabomb
            </label>
            <span className="mono small" style={{ opacity: 0.9 }}>Total: {effectiveParams.total_bomb_types}</span>
          </div>

          <div className="gemEvDivider" />

          <div className="gemEvBombBlock">
            <div className="gemEvBombHeader">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="mono" style={{ fontWeight: 900 }}>Gem Bomb</span>
                <Sprite path="sprites/event/gembomb.png" alt="Gem Bomb" className="iconSmall" />
                <Tooltip content={{ title: "Gem Bomb", lines: ["As shown in bomb's ingame tooltip."] }} />
              </div>
              <CardToggles value={params.gem_bomb_recharge_card_level} onChange={(lvl) => setParams((s) => ({ ...s, gem_bomb_recharge_card_level: lvl }))} />
            </div>
            <Stepper label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Recharge (seconds{chaosTotem100Uptime ? ")" : ", without Chaos Totem)"}{chaosTotem100Uptime ? null : <img src={CHAOS_TOTEM_ICON} alt="Chaos Totem" className="iconSmall" aria-hidden />}</span>} value={params.gem_bomb_recharge_seconds} onChange={(v) => setParams((s) => ({ ...s, gem_bomb_recharge_seconds: v }))} step={0.01} min={0.1} max={9999} decimals={2} />
            <Stepper label="Gem Chance per Charge (%)" value={params.gem_bomb_gem_chance * 100} onChange={(v) => setParams((s) => ({ ...s, gem_bomb_gem_chance: v / 100 }))} step={0.1} min={0} max={100} decimals={1} />
          </div>

          <div className="gemEvDivider" />

          <div className="gemEvBombBlock">
            <div className="gemEvBombHeader">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="mono" style={{ fontWeight: 900 }}>Cherry Bomb</span>
                <Sprite path="sprites/event/cherrybomb.png" alt="Cherry Bomb" className="iconSmall" />
                <Tooltip content={{ title: "Cherry Bomb", lines: ["As shown in bomb's ingame tooltip."] }} />
              </div>
              <CardToggles value={params.cherry_bomb_recharge_card_level} onChange={(lvl) => setParams((s) => ({ ...s, cherry_bomb_recharge_card_level: lvl }))} />
            </div>
            <Stepper label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Recharge (seconds{chaosTotem100Uptime ? ")" : ", without Chaos Totem)"}{chaosTotem100Uptime ? null : <img src={CHAOS_TOTEM_ICON} alt="Chaos Totem" className="iconSmall" aria-hidden />}</span>} value={params.cherry_bomb_recharge_seconds} onChange={(v) => setParams((s) => ({ ...s, cherry_bomb_recharge_seconds: v }))} step={0.01} min={0.1} max={9999} decimals={2} />
            <Stepper label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>3× Charges Chance (%) <Tooltip content={{ title: "3× charges chance", sections: [{ heading: "Where to find it", lines: [<span key="w" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><img src={WORKSHOP_BUTTON_ICON} alt="Workshop" style={{ width: 18, height: 18, objectFit: "contain" }} /> Look up your value in the Workshop (Bombs section).</span>] }] }} /></span>} value={params.cherry_bomb_triple_charge_chance * 100} onChange={(v) => setParams((s) => ({ ...s, cherry_bomb_triple_charge_chance: v / 100 }))} step={0.5} min={0} max={100} decimals={1} />
          </div>

          <div className="gemEvDivider" />

          <div className="gemEvBombBlock">
            <div className="gemEvBombHeader">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="mono" style={{ fontWeight: 900 }}>Battery Bomb</span>
                <Sprite path="sprites/common/battery_bomb.png" alt="Battery Bomb" className="iconSmall" label="sprites/common/battery_bomb.png" />
                <Tooltip content={{ title: "Battery Bomb", lines: ["As shown in bomb's ingame tooltip."] }} />
              </div>
              <CardToggles value={params.battery_bomb_recharge_card_level} onChange={(lvl) => setParams((s) => ({ ...s, battery_bomb_recharge_card_level: lvl }))} />
            </div>
            <Stepper label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Recharge (seconds{chaosTotem100Uptime ? ")" : ", without Chaos Totem)"}{chaosTotem100Uptime ? null : <img src={CHAOS_TOTEM_ICON} alt="Chaos Totem" className="iconSmall" aria-hidden />}</span>} value={params.battery_bomb_recharge_seconds} onChange={(v) => setParams((s) => ({ ...s, battery_bomb_recharge_seconds: v }))} step={0.01} min={0.1} max={9999} decimals={2} />
          </div>

          <div className="gemEvDivider" />

          <div className="gemEvBombBlock">
            <div className="gemEvBombHeader">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="mono" style={{ fontWeight: 900 }}>D20 Bomb</span>
                <Sprite path="sprites/common/d20_bomb.png" alt="D20 Bomb" className="iconSmall" label="sprites/common/d20_bomb.png" />
                <Tooltip content={{ title: "D20 Bomb", lines: ["As shown in bomb's ingame tooltip."] }} />
              </div>
              <CardToggles value={params.d20_bomb_recharge_card_level} onChange={(lvl) => setParams((s) => ({ ...s, d20_bomb_recharge_card_level: lvl }))} />
            </div>
            <Stepper label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Recharge (seconds{chaosTotem100Uptime ? ")" : ", without Chaos Totem)"}{chaosTotem100Uptime ? null : <img src={CHAOS_TOTEM_ICON} alt="Chaos Totem" className="iconSmall" aria-hidden />}</span>} value={params.d20_bomb_recharge_seconds} onChange={(v) => setParams((s) => ({ ...s, d20_bomb_recharge_seconds: v }))} step={0.01} min={0.1} max={9999} decimals={2} />
            <Stepper label="Charges Distributed" value={params.d20_bomb_charges_distributed} onChange={(v) => setParams((s) => ({ ...s, d20_bomb_charges_distributed: clampInt(v, 0, 9999) }))} step={1} min={0} max={9999} inputMode="numeric" decimals={0} />
            <Stepper label="Refill Chance (%)" value={params.d20_bomb_refill_chance * 100} onChange={(v) => setParams((s) => ({ ...s, d20_bomb_refill_chance: v / 100 }))} step={0.5} min={0} max={100} decimals={1} />
          </div>
        </div>
        </Collapsible>

        <Collapsible
          id="bombs-auto-bomber"
          title="Auto-Bomber"
          defaultExpanded={false}
          className="gemEvSection tierHeader1"
          headerRight={
            <Tooltip
              content={{
                title: "Auto-Bomber",
                sections: [
                  {
                    heading: "What this shows",
                    lines: [
                      "Gem Bomb balance if you only run the auto-bomber: consumption (drops) vs recharge. No Battery/D20 refills, no Charge Magnets.",
                      "1.25 s between drops (game time); divided by Game Speed from Gem EV for real time.",
                    ],
                  },
                  {
                    heading: "10× Bomb Recharge",
                    lines: ["Only Elixir Drone is used here (runs on auto-pilot). Lootbug is not included."],
                  },
                  {
                    heading: "Offline Gains",
                    lines: ["When checked, Elixir Drone 10× recharge is excluded from the auto-bomber calculation (offline = no drone buff)."],
                  },
                ],
              }}
              label="?"
            />
          }
        >
          <div className="gemEvSectionBody">
            <p className="small" style={{ marginBottom: 10 }}>
              Raw Gem Bombs: how many dropped by auto-bomber vs how many recharged (no D20/Battery refills, no Charge Magnets). Interval: {AUTO_BOMBER_INTERVAL_GAME_SEC} s game time ÷ Game Speed = {(AUTO_BOMBER_INTERVAL_GAME_SEC / gameSpeedMult).toFixed(2)} s real.
            </p>
            <label className="toggle" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={autoBomberOfflineGains}
                onChange={(e) => setAutoBomberOfflineGains(e.target.checked)}
              />
              <span>Offline Gains = No Elixir Drone buff</span>
            </label>
            <div className="gemEvBombBlock">
              <div className="gemEvBombHeader">
                <span className="mono" style={{ fontWeight: 900 }}>Gem Bomb (auto-bomber)</span>
                <Sprite path="sprites/event/gembomb.png" alt="Gem Bomb" className="iconSmall" />
              </div>
              <div className="gemEvRow" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="gemEvRow" style={{ justifyContent: "space-between" }}>
                  <span className="mono small">Gem Bombs/h dropped (auto-bomber)</span>
                  <span className="mono">{autoBomberStats.gemBombsDroppedPerHour.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                </div>
                <div className="gemEvRow" style={{ justifyContent: "space-between" }}>
                  <span className="mono small">Gem Bombs/h recharged</span>
                  <span className="mono">{autoBomberStats.gemBombsRechargedPerHour.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                </div>
                <div
                  className={`gemEvRow ${autoBomberStats.rechargeMinusDropped < 0 ? "gemEvAutoBomberNegativeGlow" : ""}`}
                  style={{ justifyContent: "space-between" }}
                >
                  <span className="mono small">Recharge − Dropped</span>
                  <span className="mono">{autoBomberStats.rechargeMinusDropped >= 0 ? "+" : ""}{autoBomberStats.rechargeMinusDropped.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                </div>
                <div className="gemEvRow" style={{ justifyContent: "space-between" }}>
                  <span className="mono small">Gem EV/h (from Gem Bomb)</span>
                  <span className="mono">{autoBomberStats.gemEVPerHour.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                </div>
              </div>
            </div>
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
