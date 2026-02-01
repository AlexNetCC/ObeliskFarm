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
};

const STORAGE_KEY = "obeliskfarm:web:items_save.json:v1";

const DEFAULT: ItemsState = {
  chaosTotemDurationMin: 2,
  chaosTotemDurationSec: 30,
  chaosTotemUptimePct: 0,
  chaosTotemObtainChance: 4.6,
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
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
                Uptime (estimate)
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
            {/* Obtain chance stored in state for later /h calculation; not shown for now */}
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
