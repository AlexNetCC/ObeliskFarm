import { useEffect, useRef, useState } from "react";
import "./items.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
import { loadJson, saveJson } from "../../lib/storage";
import { calculateChargeMagnetGemsPerHour, calculateGemBombGemsPerHour, calculateLuckyMultiplier, defaultGameParameters, getGameSpeedMultiplier, type GameParameters } from "../../lib/gemev/freebieEv";

const GEMEV_STORAGE_KEY = "obeliskfarm:web:gemev_save.json:v1";
const BOMBS_STORAGE_KEY = "obeliskfarm:web:bombs_save.json:v1";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";
const CHAOS_TOTEM_ICON = "https://static.wikitide.net/shminerwiki/a/a6/Chaos_Totem.png";
const CHEST_ICON = "https://static.wikitide.net/shminerwiki/a/a8/Item_Chest.png";
const CHARGE_MAGNET_ICON = "https://static.wikitide.net/shminerwiki/f/fc/Charge_Magnet.png";
const GEM_ICON = "https://static.wikitide.net/shminerwiki/a/aa/Gem.png";

/** Base: one of 12 Gift outcomes is "25–40 Item Chests" (avg 32.5). Lucky multiplier (3×/50× rolls) applied. */
const CHESTS_PER_GIFT_BASE = 32.5 / 12;

/** Charge Magnet obtain chance from Item Chests (%), from wiki. Not user input. */
const CHARGE_MAGNET_OBTAIN_CHANCE_PCT = 2.6;

type ItemsState = {
  chaosTotemDurationMin: number;
  chaosTotemDurationSec: number;
  chaosTotemObtainChance: number; // stored for later /h calc
  /** Items obtained from opening one Item Chest. */
  itemsPerChest: number;
};

const STORAGE_KEY = "obeliskfarm:web:items_save.json:v1";

const DEFAULT: ItemsState = {
  chaosTotemDurationMin: 2,
  chaosTotemDurationSec: 30,
  chaosTotemObtainChance: 4.6,
  itemsPerChest: 1,
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function parseDecimal(raw: string): number {
  const cleaned = raw.trim().replaceAll(",", ".").replaceAll(" ", "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function Items() {
  const [state, setState] = useState<ItemsState>(() => {
    const saved = loadJson<Partial<ItemsState> & { chaosTotemDuration?: string }>(STORAGE_KEY);
    const base = { ...DEFAULT, ...saved };
    // Prefer numeric duration fields so base duration persists; fall back to legacy string.
    if (typeof saved?.chaosTotemDurationMin === "number" && typeof saved?.chaosTotemDurationSec === "number") {
      base.chaosTotemDurationMin = Math.max(0, Math.trunc(saved.chaosTotemDurationMin));
      base.chaosTotemDurationSec = Math.max(0, Math.min(59, Math.trunc(saved.chaosTotemDurationSec)));
    } else if (typeof saved?.chaosTotemDuration === "string" && saved.chaosTotemDuration.trim()) {
      const parts = saved.chaosTotemDuration.trim().split(/[:\s]+/);
      if (parts.length >= 2) {
        const m = Number(parts[0]);
        const sec = Number(parts[1]);
        if (Number.isFinite(m) && Number.isFinite(sec)) {
          base.chaosTotemDurationMin = Math.max(0, Math.trunc(m));
          base.chaosTotemDurationSec = Math.max(0, Math.min(59, Math.trunc(sec)));
        }
      } else if (parts.length === 1) {
        const m = Number(parts[0]);
        if (Number.isFinite(m)) {
          base.chaosTotemDurationMin = Math.max(0, Math.trunc(m));
          base.chaosTotemDurationSec = 0;
        }
      }
    }
    return base;
  });

  useEffect(() => {
    saveJson(STORAGE_KEY, { ...state, chaosTotemDuration: `${state.chaosTotemDurationMin}:${String(state.chaosTotemDurationSec).padStart(2, "0")}` });
  }, [state]);

  const update = (patch: Partial<ItemsState>) => setState((s) => ({ ...s, ...patch }));

  const gameSpeedMult = (() => {
    const base = defaultGameParameters();
    const saved = loadJson<{ params?: Partial<GameParameters> }>(GEMEV_STORAGE_KEY);
    const merged: GameParameters = { ...base, ...(saved?.params ?? {}) };
    let mult = "game_speed_multiplier" in merged ? merged.game_speed_multiplier : 1.0;
    const gameSpeedPct = (merged as { game_speed_pct?: number }).game_speed_pct;
    if (mult === 1.0 && typeof gameSpeedPct === "number" && gameSpeedPct > 0)
      mult = 1.0 + clampInt(gameSpeedPct, 0, 12) / 100.0;
    return getGameSpeedMultiplier({ ...merged, game_speed_multiplier: clamp(Number(mult), 1.0, 10.0) });
  })();


  /** Chests per hour = freebie + stonks + Lootbug "+1 Item Chest" + Founder Supply Drop (2 chests per drop). */
  const ext = loadJson<{
    freebiesPerHour?: number;
    freebieChestsPerHour?: number;
    stonksChestsPerHour?: number;
    lootbugItemChestsPerHour?: number;
    founderSupplyDropItemChestsPerHour?: number;
    chaosTotemImpact?: number;
    chaosTotem100FromBombs?: boolean;
    total10xMinPerHour?: number;
    lootbugBomb10xMinPerHour?: number;
    droneBomb10xMinPerHour?: number;
  }>(GEMEV_EXTERNAL_KEY);
  const chaosTotem100FromBombs = Boolean(ext?.chaosTotem100FromBombs);
  const freebieChestsPerHour =
    typeof ext?.freebieChestsPerHour === "number" ? ext.freebieChestsPerHour : (typeof ext?.freebiesPerHour === "number" ? ext.freebiesPerHour : 0);
  const stonksChestsPerHour = typeof ext?.stonksChestsPerHour === "number" ? ext.stonksChestsPerHour : 0;
  const lootbugItemChestsPerHour = typeof ext?.lootbugItemChestsPerHour === "number" ? ext.lootbugItemChestsPerHour : 0;
  const founderSupplyDropItemChestsPerHour = typeof ext?.founderSupplyDropItemChestsPerHour === "number" ? ext.founderSupplyDropItemChestsPerHour : 0;
  const chestsPerHour = freebieChestsPerHour + stonksChestsPerHour + lootbugItemChestsPerHour + founderSupplyDropItemChestsPerHour;

  /** Expected chests per Gift: base (1/12 × 32.5) × Lucky multiplier (3×/50× rolls). FYI only. */
  const expectedChestsPerGift = CHESTS_PER_GIFT_BASE * calculateLuckyMultiplier();

  const itemsPerHourFromChests = state.itemsPerChest * chestsPerHour;

  /** Expected Chaos Totem uptime: real min/h from chests; Gem EV uses this (not a manual estimate). */
  const chaosTotemsPerHour = itemsPerHourFromChests * (state.chaosTotemObtainChance / 100);
  const durationGameMin = state.chaosTotemDurationMin + state.chaosTotemDurationSec / 60;
  const expectedUptimeMinPerHour =
    chaosTotemsPerHour * (durationGameMin / gameSpeedMult);
  const expectedUptimeFraction = Math.min(1, Math.max(0, expectedUptimeMinPerHour / 60));

  /** Params for Charge Magnet value: bomb settings from Bombs module (so bomb cycle etc. apply), 10× from external, Chaos Totem from Items or 100% when set in Bombs. */
  const effectiveParamsForChargeMagnet = (() => {
    const base = defaultGameParameters();
    const gemevSaved = loadJson<{ params?: Partial<GameParameters> }>(GEMEV_STORAGE_KEY);
    const bombsSaved = loadJson<{ params?: Partial<GameParameters> }>(BOMBS_STORAGE_KEY);
    const merged: GameParameters = { ...base, ...(gemevSaved?.params ?? {}), ...(bombsSaved?.params ?? {}) };
    const total10x = typeof ext?.total10xMinPerHour === "number"
      ? ext.total10xMinPerHour
      : (ext?.lootbugBomb10xMinPerHour ?? 0) + (ext?.droneBomb10xMinPerHour ?? 0);
    merged.bomb_recharge_10x_min_per_hour = total10x;
    // When 100% from Bombs, recharge params are in-game (already /2), so do not apply Chaos again (= 0).
    merged.chaos_totem_uptime = chaosTotem100FromBombs ? 0 : expectedUptimeFraction;
    return merged;
  })();
  const chargeMagnetGemsPerHour = calculateChargeMagnetGemsPerHour(effectiveParamsForChargeMagnet, 20);
  /** Expected Charge Magnets per hour from Item Chests. */
  const chargeMagnetsPerHour = itemsPerHourFromChests * (CHARGE_MAGNET_OBTAIN_CHANCE_PCT / 100);
  const chargeMagnetGemEvPerHour = chargeMagnetsPerHour * chargeMagnetGemsPerHour;

  /** Chaos Totem contribution to Gem EV/h. When 100% from Bombs: impact = current gem EV − gem EV with doubled recharge (simulating no Chaos); then value per totem = impact ÷ (totems/h needed to sustain 60 min). */
  const chaosTotemImpactLive = (() => {
    if (chaosTotem100FromBombs) {
      const p = effectiveParamsForChargeMagnet;
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
    }
    return (
      calculateGemBombGemsPerHour(effectiveParamsForChargeMagnet) -
      calculateGemBombGemsPerHour({ ...effectiveParamsForChargeMagnet, chaos_totem_uptime: 0 })
    );
  })();

  /** When 100% from Bombs: value per Chaos Totem = chaosImpact ÷ (totems/h to sustain 60 min). Chaos totems per chest then contribute to chest value. */
  const chaosValuePerChestWhen100 = (() => {
    if (!chaosTotem100FromBombs || chaosTotemImpactLive <= 0 || durationGameMin <= 0) return 0;
    const totemsPerHourToSustain60 = (60 * gameSpeedMult) / durationGameMin;
    const valuePerTotem = chaosTotemImpactLive / totemsPerHourToSustain60;
    const chaosTotemsPerChest = state.itemsPerChest * (state.chaosTotemObtainChance / 100);
    return chaosTotemsPerChest * valuePerTotem;
  })();

  /** Value of 1 chest in Gem/h from Tier 1 items (Charge Magnet + Chaos Totem). */
  const valueOfOneChestGemPerHour =
    state.itemsPerChest * (CHARGE_MAGNET_OBTAIN_CHANCE_PCT / 100) * chargeMagnetGemsPerHour +
    (chaosTotem100FromBombs ? chaosValuePerChestWhen100 : chestsPerHour > 0 ? chaosTotemImpactLive / chestsPerHour : 0);

  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(GEMEV_EXTERNAL_KEY) ?? {};
    if (!ext.chaosTotem100FromBombs) {
      ext.chaosTotemUptimePct = expectedUptimeFraction * 100;
      ext.chaosTotemImpact = Math.max(0, chaosTotemImpactLive);
    }
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [expectedUptimeFraction, chaosTotemImpactLive]);

  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(GEMEV_EXTERNAL_KEY) ?? {};
    ext.chargeMagnetImpact = chargeMagnetGemEvPerHour;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [chargeMagnetGemEvPerHour]);

  return (
    <div className="itemsGrid">
      <div className={`itemsGameSpeedToggle ${gameSpeedMult > 1 ? "itemsGameSpeedToggleOn" : ""}`}>
        <div className="itemsGameSpeedReadOnly">
          <span className="itemsLabel">
            Game speed
            <Tooltip
              content={{
                title: "Game speed",
                sections: [
                  {
                    heading: "Source",
                    lines: [
                      "Taken from Gem EV Calculator. Same value as Stats screen.",
                    ],
                  },
                  { heading: "Edit", lines: ["Change it in the Gem EV Calculator module."] },
                ],
              }}
            />
          </span>
          <span className="itemsValue mono">{gameSpeedMult.toFixed(2)}×</span>
        </div>
      </div>

      <div className="itemsChestsBlock">
        <div className="itemsBlockHeader">
          <img src={CHEST_ICON} alt="" className="itemsItemIcon" aria-hidden />
          <h3 className="itemsBlockTitle">Chests</h3>
        </div>
        <div className="itemsSection">
          <div className="itemsRow">
            <span className="itemsLabel">
              Items per chest
              <Tooltip
                content={{
                  title: "Items per chest",
                  lines: ["Items you get from opening a Chest (increased by Store Gem-Upgrade) ."],
                }}
              />
            </span>
            <input
              className="itemsInput"
              type="text"
              inputMode="decimal"
              value={state.itemsPerChest}
              onChange={(e) => update({ itemsPerChest: Math.max(0, parseDecimal(e.target.value)) })}
              aria-label="Items per chest"
            />
          </div>
          <div className="itemsChestsBarBlock">
            <div className="itemsRow itemsChestsBarHeader">
              <span className="itemsLabel">
                Chests per hour
                <Tooltip
                  content={{
                    title: "Chests per hour",
                    sections: [
                      {
                        heading: "Summands",
                        lines: [
                          "Freebies: effective chests from freebie rolls (1 roll = 1 chest, jackpot = 5 chests, refresh = +1 chest).",
                          "Stonks: when enabled in Gem EV, chests from stonks procs.",
                          "Lootbug: free buff \"+1 Item Chest\" per hour.",
                          "Open Gem EV and Lootbug to refresh.",
                        ],
                      },
                      {
                        heading: "Freebies (jackpot & refresh)",
                        lines: [
                          "Jackpot: 5 chests instead of 1. Refresh: 1 extra roll = 1 extra chest. Both scale freebie chests per hour.",
                        ],
                      },
                    ],
                  }}
                />
              </span>
              <span className="itemsValue mono">{chestsPerHour.toFixed(2)}</span>
            </div>
            <div className="itemsChestsBarWrap">
              <div className="itemsChestsBarBg">
                {chestsPerHour > 0 ? (
                  <>
                    <div
                      className="itemsChestsBarSeg itemsChestsBarFreebies"
                      style={{
                        width: `${(freebieChestsPerHour / chestsPerHour) * 100}%`,
                      }}
                      title={`Freebies: ${freebieChestsPerHour.toFixed(2)}/h`}
                    />
                    {stonksChestsPerHour > 0 ? (
                      <div
                        className="itemsChestsBarSeg itemsChestsBarStonks"
                        style={{
                          width: `${(stonksChestsPerHour / chestsPerHour) * 100}%`,
                        }}
                        title={`Stonks: ${stonksChestsPerHour.toFixed(2)}/h`}
                      />
                    ) : null}
                    <div
                      className="itemsChestsBarSeg itemsChestsBarLootbug"
                      style={{
                        width: `${(lootbugItemChestsPerHour / chestsPerHour) * 100}%`,
                      }}
                      title={`Lootbug: ${lootbugItemChestsPerHour.toFixed(2)}/h`}
                    />
                    {founderSupplyDropItemChestsPerHour > 0 ? (
                      <div
                        className="itemsChestsBarSeg itemsChestsBarFounder"
                        style={{
                          width: `${(founderSupplyDropItemChestsPerHour / chestsPerHour) * 100}%`,
                        }}
                        title={`Founder Supply Drop: ${founderSupplyDropItemChestsPerHour.toFixed(2)}/h`}
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
              <div className="itemsChestsBarLegend">
                <span className="itemsChestsBarLegendItem">
                  <span className="itemsChestsBarLegendSwatch itemsChestsBarFreebies" />
                  Freebies
                </span>
                {stonksChestsPerHour > 0 ? (
                  <span className="itemsChestsBarLegendItem">
                    <span className="itemsChestsBarLegendSwatch itemsChestsBarStonks" />
                    Stonks
                  </span>
                ) : null}
                <span className="itemsChestsBarLegendItem">
                  <span className="itemsChestsBarLegendSwatch itemsChestsBarLootbug" />
                  Lootbug
                </span>
                {founderSupplyDropItemChestsPerHour > 0 ? (
                  <span className="itemsChestsBarLegendItem">
                    <span className="itemsChestsBarLegendSwatch itemsChestsBarFounder" />
                    Founder Supply Drop
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="itemsRow">
            <span className="itemsLabel">Items per hour (from chests)</span>
            <span className="itemsValue mono itemsPerHourGlow">{itemsPerHourFromChests.toFixed(2)}</span>
          </div>
          <div className="itemsRow">
            <span className="itemsLabel">
              Value of 1 Chest (Tier 1)
              <Tooltip
                content={{
                  title: "Value of 1 Chest (Tier 1)",
                  sections: [
                    {
                      heading: "Meaning",
                      lines: [
                        "Expected gem-equivalent from the Tier 1 items in one chest (Charge Magnet + Chaos Totem).",
                        "Same number as the contribution to Gem/h from one chest; shown here as Gems (one-hour equivalent).",
                      ],
                    },
                    {
                      heading: "Formula",
                      lines: [
                        "Charge Magnet: items per chest × 2.6% × value of 1 Charge Magnet (in Gems).",
                        "Chaos Totem: (Chaos Totem Gem EV per hour) ÷ chests per hour.",
                      ],
                    },
                  ],
                }}
              />
            </span>
            <span className="itemsValue mono itemsValueWithIcon">
              {Number.isFinite(valueOfOneChestGemPerHour) && valueOfOneChestGemPerHour > 0 ? (
                <>
                  {valueOfOneChestGemPerHour.toFixed(1)}
                  <img src={GEM_ICON} alt="" className="itemsGemIcon" aria-hidden />
                </>
              ) : (
                "—"
              )}
            </span>
          </div>
          <div className="itemsRow">
            <span className="itemsLabel">
              Expected chests per Gift (FYI)
              <Tooltip
                content={{
                  title: "Expected chests per Gift",
                  lines: [
                    "One of 12 base Gift outcomes is \"25–40 Item Chests\" (avg 32.5). Base: 32.5 ÷ 12.",
                    "Lucky multiplier (1/20 for 3×, 1/2500 for 50×) applied to quantities. FYI only.",
                  ],
                }}
              />
            </span>
            <span className="itemsValue mono itemsChestsPerGiftValue">{expectedChestsPerGift.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <Collapsible id="items-tier1" title="Tier 1 Items" defaultExpanded={false}>
        <div className="itemsSection">
          <p className="itemsIntro">
            Tier 1 items are obtained from Item Chests with the exception of Skill Shards which are obtained via Freebie packs.
          </p>

          <div className="itemsChaosTotem">
            <div className="itemsChaosTotemHeader">
              <img src={CHAOS_TOTEM_ICON} alt="" className="itemsItemIcon" aria-hidden />
              <span className="itemsItemName">Chaos Totem</span>
            </div>
            <div className="itemsChaosTotemEffect">
              Bomb Damage 3.00×, Bomb Recharge Rate 2.00×
            </div>
            {chaosTotem100FromBombs ? (
              <>
                <div className="itemsRow">
                  <span className="itemsLabel">
                    100% uptime (Bombs)
                    <Tooltip
                      content={{
                        title: "100% uptime (Bombs)",
                        lines: [
                          "Chaos Totem 100% Uptime is checked in the Bombs module. Bomb contribution in Gem EV uses 100% uptime; base duration and chests from Items are not used.",
                        ],
                      }}
                    />
                  </span>
                  <span className="itemsValue mono itemsChaosTotemGemEv">100%</span>
                </div>
                <div className="itemsRow itemsChaosTotemGemEvRow">
                  <span className="itemsLabel">
                    → Gem EV (FYI)
                    <Tooltip
                      content={{
                        title: "Gem EV (FYI)",
                        lines: [
                          "Impact of having 100% Chaos vs none (current recharge vs doubled recharge).",
                          "Chest value includes Chaos Totem: this impact ÷ (totems/h needed to sustain 60 min) × totems per chest, so one chest reflects that without Chaos Totems you would not have 100%.",
                        ],
                      }}
                    />
                  </span>
                  <span
                    className={`itemsValue mono ${chaosTotemImpactLive > 0 ? "itemsChaosTotemGemEv" : "itemsChaosTotemGemEvMuted"}`}
                  >
                    {chaosTotemImpactLive > 0 ? `+${chaosTotemImpactLive.toFixed(1)} Gem/h` : "—"}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="itemsRow itemsDurationRow">
                  <span className="itemsLabel">
                    Base duration (bomb's tooltip)
                    <Tooltip
                      content={{
                        title: "Base duration",
                        sections: [
                          {
                            heading: "Meaning",
                            lines: ["Duration of the Chaos Totem buff in game time. Base from table: 2m30."],
                          },
                          { heading: "Format", lines: ["Enter minutes and seconds in the two fields."] },
                        ],
                      }}
                    />
                  </span>
                  <span className="itemsDurationFields">
                    <input
                      className="itemsInput itemsDurationInput"
                      type="number"
                      min={0}
                      max={999}
                      value={state.chaosTotemDurationMin}
                      onChange={(e) => update({ chaosTotemDurationMin: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
                      aria-label="Chaos Totem duration minutes"
                    />
                    <span className="itemsDurationSep">min</span>
                    <input
                      className="itemsInput itemsDurationInput"
                      type="number"
                      min={0}
                      max={59}
                      value={state.chaosTotemDurationSec}
                      onChange={(e) => update({ chaosTotemDurationSec: Math.max(0, Math.min(59, Math.trunc(Number(e.target.value) || 0))) })}
                      aria-label="Chaos Totem duration seconds"
                    />
                    <span className="itemsDurationSep">sec</span>
                  </span>
                </div>
                <div className="itemsRow">
                  <span className="itemsLabel">
                    Average Chaos Totems / h
                    <Tooltip
                      content={{
                        title: "Average Chaos Totems / h",
                        lines: [
                          "Expected Chaos Totems per hour from Item Chests.",
                          "Formula: Items per hour (from chests) × (obtain chance ÷ 100).",
                        ],
                      }}
                    />
                  </span>
                  <span className="itemsValue mono">
                    {chaosTotemsPerHour.toFixed(2)}
                  </span>
                </div>
                <div className="itemsRow">
                  <span className="itemsLabel">
                    Expected Uptime
                    <Tooltip
                      content={{
                        title: "Expected Uptime",
                        lines: [
                          "Expected real-time minutes per hour Chaos Totem is active. Gem EV uses this for bomb recharge.",
                          "Formula: Chaos Totems/h × (base duration in game min ÷ game speed).",
                        ],
                      }}
                    />
                  </span>
                  <span className="itemsValue mono">
                    {expectedUptimeMinPerHour.toFixed(2)} min
                  </span>
                </div>
                <div className="itemsRow itemsChaosTotemGemEvRow">
                  <span className="itemsLabel">
                    → Gem EV (FYI)
                    <Tooltip
                      content={{
                        title: "Gem EV (FYI)",
                        lines: [
                          "Contribution of this Chaos Totem uptime to total Gem EV per hour.",
                          "Updates live when you change base duration, obtain chance, or chests/h.",
                        ],
                      }}
                    />
                  </span>
                  <span
                    className={`itemsValue mono ${chaosTotemImpactLive > 0 ? "itemsChaosTotemGemEv" : "itemsChaosTotemGemEvMuted"}`}
                  >
                    {chaosTotemImpactLive > 0 ? `+${chaosTotemImpactLive.toFixed(1)} Gem/h` : "—"}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="itemsChargeMagnet">
            <div className="itemsChaosTotemHeader">
              <img src={CHARGE_MAGNET_ICON} alt="" className="itemsItemIcon" aria-hidden />
              <span className="itemsItemName">Charge Magnet</span>
            </div>
            <div className="itemsChaosTotemEffect">
              1 Charge Magnet → 20 charges to every bomb (Gem, Cherry, Battery, D20)
            </div>
            <div className="itemsRow">
              <span className="itemsLabel">
                1 Charge Magnet
                <Tooltip
                  content={{
                    title: "1 Charge Magnet",
                    lines: [
                      "Contribution of one Charge Magnet to Gem EV. Uses Gem EV bomb settings (recharge times, gem chance, 10× min/h, Chaos Totem, and bomb cycle early/late).",
                      "Same value × Charge Magnets per hour = → Gem EV (FYI) below.",
                    ],
                  }}
                />
              </span>
              <span className="itemsValue mono itemsValueWithIcon">
                {chargeMagnetGemsPerHour > 0 ? (
                  <>
                    {chargeMagnetGemsPerHour.toFixed(1)}
                    <img src={GEM_ICON} alt="" className="itemsGemIcon" aria-hidden />
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="itemsRow">
              <span className="itemsLabel">
                Average Charge Magnets / h
                <Tooltip
                  content={{
                    title: "Average Charge Magnets / h",
                    lines: [
                      "Expected Charge Magnets per hour from Item Chests.",
                      "Formula: Items per hour (from chests) × 2.6% (obtain chance from wiki).",
                    ],
                  }}
                />
              </span>
              <span className="itemsValue mono">
                {chargeMagnetsPerHour.toFixed(2)}
              </span>
            </div>
            <div className="itemsRow itemsChaosTotemGemEvRow">
              <span className="itemsLabel">
                → Gem EV (FYI)
                <Tooltip
                  content={{
                    title: "Gem EV (FYI)",
                    lines: [
                      "Contribution of Charge Magnets from chests to Gem EV per hour.",
                      "Formula: Average Charge Magnets / h × value of one Charge Magnet (from Gem EV bomb settings).",
                    ],
                  }}
                />
              </span>
              <span
                className={`itemsValue mono ${chargeMagnetGemEvPerHour > 0 ? "itemsChaosTotemGemEv" : "itemsChaosTotemGemEvMuted"}`}
              >
                {chargeMagnetGemEvPerHour > 0 ? `+${chargeMagnetGemEvPerHour.toFixed(1)} Gem/h` : "—"}
              </span>
            </div>
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
