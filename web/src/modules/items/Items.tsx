import { useEffect, useRef, useState } from "react";
import "./items.css";
import { Collapsible } from "../../components/Collapsible";
import { Tooltip } from "../../components/Tooltip";
import { loadJson, saveJson } from "../../lib/storage";
import { defaultGameParameters, getGameSpeedMultiplier, type GameParameters } from "../../lib/gemev/freebieEv";

const GEMEV_STORAGE_KEY = "obeliskfarm:web:gemev_save.json:v1";
const GEMEV_EXTERNAL_KEY = "obeliskfarm:web:gemev_external.json";
const CHAOS_TOTEM_ICON = "https://static.wikitide.net/shminerwiki/a/a6/Chaos_Totem.png";

type ItemsState = {
  chaosTotemDurationMin: number;
  chaosTotemDurationSec: number;
  chaosTotemUptimePct: number;
  chaosTotemObtainChance: number; // stored for later /h calc
  /** Items obtained from opening one Item Chest. */
  itemsPerChest: number;
};

const STORAGE_KEY = "obeliskfarm:web:items_save.json:v1";

const DEFAULT: ItemsState = {
  chaosTotemDurationMin: 2,
  chaosTotemDurationSec: 30,
  chaosTotemUptimePct: 0,
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

  useEffect(() => {
    const ext = loadJson<Record<string, unknown>>(GEMEV_EXTERNAL_KEY) ?? {};
    ext.chaosTotemUptimePct = state.chaosTotemUptimePct;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [state.chaosTotemUptimePct]);

  /** Chests per hour = freebies/h from Gem EV (1 freebie = 1 chest). */
  const extFreebies = loadJson<{ freebiesPerHour?: number }>(GEMEV_EXTERNAL_KEY);
  const chestsPerHour =
    typeof extFreebies?.freebiesPerHour === "number" ? extFreebies.freebiesPerHour : 0;

  const itemsPerHourFromChests = state.itemsPerChest * chestsPerHour;

  return (
    <div className="itemsGrid">
      <div className="itemsChestsBlock">
        <h3 className="itemsBlockTitle">Chests</h3>
        <div className="itemsSection">
          <div className="itemsRow">
            <span className="itemsLabel">
              Items per chest
              <Tooltip
                content={{
                  title: "Items per chest",
                  lines: ["Average number of items you get from opening one Item Chest."],
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
          <div className="itemsRow">
            <span className="itemsLabel">
              Chests per hour
              <Tooltip
                content={{
                  title: "Chests per hour",
                  lines: [
                    "Computed from Gem EV: freebies per hour (1 freebie = 1 chest).",
                    "Update Gem EV parameters to change this value.",
                  ],
                }}
              />
            </span>
            <span className="itemsValue mono">{chestsPerHour.toFixed(2)}</span>
          </div>
          <div className="itemsRow">
            <span className="itemsLabel">Items per hour (from chests)</span>
            <span className="itemsValue mono">{itemsPerHourFromChests.toFixed(2)}</span>
          </div>
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
                Estimated Uptime
                <Tooltip
                  content={{
                    title: "Uptime (estimate)",
                    sections: [
                      {
                        heading: "Meaning",
                        lines: ["Your estimated fraction of time Chaos Totem is active (0–100%). Used for Gem EV bomb recharge."],
                      },
                    ],
                  }}
                />
              </span>
              <input
                className="itemsInput"
                type="number"
                min={0}
                max={100}
                step={5}
                value={state.chaosTotemUptimePct}
                onChange={(e) => update({ chaosTotemUptimePct: clamp(Number(e.target.value) || 0, 0, 100) })}
                aria-label="Chaos Totem uptime percent"
              />
              <span className="itemsSuffix">%</span>
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
                {(itemsPerHourFromChests * (state.chaosTotemObtainChance / 100)).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
