import { useEffect, useRef, useState } from "react";
import "./items.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
import { loadJson, saveJson } from "../../lib/storage";
import { calculateLuckyMultiplier, defaultGameParameters, getGameSpeedMultiplier, type GameParameters } from "../../lib/gemev/freebieEv";

const GEMEV_STORAGE_KEY = "obeliskfarm:web:gemev_save.json:v1";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";
const CHAOS_TOTEM_ICON = "https://static.wikitide.net/shminerwiki/a/a6/Chaos_Totem.png";
const CHEST_ICON = "https://static.wikitide.net/shminerwiki/a/a8/Item_Chest.png";

/** Base: one of 12 Gift outcomes is "25–40 Item Chests" (avg 32.5). Lucky multiplier (3×/50× rolls) applied. */
const CHESTS_PER_GIFT_BASE = 32.5 / 12;

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
    if (typeof saved?.chaosTotemDuration === "string" && saved.chaosTotemDuration.trim()) {
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
    saveJson(STORAGE_KEY, state);
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


  /** Chests per hour = freebies/h (Gem EV) + stonks chests/h (when stonks enabled in Gem EV) + Lootbug "+1 Item Chest" per hour. */
  const ext = loadJson<{ freebiesPerHour?: number; stonksChestsPerHour?: number; lootbugItemChestsPerHour?: number; chaosTotemImpact?: number }>(GEMEV_EXTERNAL_KEY);
  const freebiesPerHour = typeof ext?.freebiesPerHour === "number" ? ext.freebiesPerHour : 0;
  const stonksChestsPerHour = typeof ext?.stonksChestsPerHour === "number" ? ext.stonksChestsPerHour : 0;
  const lootbugItemChestsPerHour = typeof ext?.lootbugItemChestsPerHour === "number" ? ext.lootbugItemChestsPerHour : 0;
  const chaosTotemImpact = typeof ext?.chaosTotemImpact === "number" ? ext.chaosTotemImpact : 0;
  const chestsPerHour = freebiesPerHour + stonksChestsPerHour + lootbugItemChestsPerHour;

  /** Expected chests per Gift: base (1/12 × 32.5) × Lucky multiplier (3×/50× rolls). FYI only. */
  const expectedChestsPerGift = CHESTS_PER_GIFT_BASE * calculateLuckyMultiplier();

  const itemsPerHourFromChests = state.itemsPerChest * chestsPerHour;

  /** Expected Chaos Totem uptime: real min/h from chests; Gem EV uses this (not a manual estimate). */
  const chaosTotemsPerHour = itemsPerHourFromChests * (state.chaosTotemObtainChance / 100);
  const durationGameMin = state.chaosTotemDurationMin + state.chaosTotemDurationSec / 60;
  const expectedUptimeMinPerHour =
    chaosTotemsPerHour * (durationGameMin / gameSpeedMult);
  const expectedUptimeFraction = Math.min(1, Math.max(0, expectedUptimeMinPerHour / 60));

  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(GEMEV_EXTERNAL_KEY) ?? {};
    ext.chaosTotemUptimePct = expectedUptimeFraction * 100;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [expectedUptimeFraction]);

  return (
    <div className="itemsGrid">
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
                          "Freebies: freebie events per hour from Gem EV (1 freebie = 1 chest).",
                          "Stonks: when enabled in Gem EV, chests from stonks procs (only when Stonks is checked).",
                          "Lootbug: free buff \"+1 Item Chest\" per hour.",
                          "Open Gem EV and Lootbug to refresh.",
                        ],
                      },
                      {
                        heading: "Freebies",
                        lines: [
                          "Freebie rate uses game speed and freebie timer. In Gem EV, refresh and jackpot affect rewards per freebie, not the event count.",
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
                        width: `${(freebiesPerHour / chestsPerHour) * 100}%`,
                      }}
                      title={`Freebies: ${freebiesPerHour.toFixed(2)}/h`}
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
              </div>
            </div>
          </div>
          <div className="itemsRow">
            <span className="itemsLabel">Items per hour (from chests)</span>
            <span className="itemsValue mono itemsPerHourGlow">{itemsPerHourFromChests.toFixed(2)}</span>
          </div>
          <Collapsible id="items-chests-per-gift" title="Chests per Gift (FYI)" defaultExpanded={false} className="itemsChestsPerGiftCollapsible">
            <div className="itemsSection itemsChestsPerGiftSection">
              <div className="itemsRow">
                <span className="itemsLabel">
                  Expected chests per Gift
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
          </Collapsible>
        </div>
      </div>

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
          <span className="itemsValue">{gameSpeedMult.toFixed(2)}×</span>
        </div>
      </div>

      <Collapsible id="items-tier1" title="Tier 1 Items" defaultExpanded={true}>
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
                      "Value comes from Gem EV module; open or refresh Gem EV to see it.",
                    ],
                  }}
                />
              </span>
              <span
                className={`itemsValue mono ${chaosTotemImpact > 0 ? "itemsChaosTotemGemEv" : "itemsChaosTotemGemEvMuted"}`}
              >
                {chaosTotemImpact > 0 ? `+${chaosTotemImpact.toFixed(1)} Gem/h` : "—"}
              </span>
            </div>
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
