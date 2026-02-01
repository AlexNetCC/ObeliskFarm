import { useEffect, useMemo, useRef, useState } from "react";
import "./lootbug.css";
import { Tooltip } from "../../components/Tooltip";
import { Collapsible } from "../../components/Collapsible";
import { loadJson, saveJson } from "../../lib/storage";
import {
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
      "The multiplier on Lootbug rewards. Non-integer results randomly round to adjacent integers.",
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

  const spawnRateMult = clamp(state.spawnRateMultiplier, 0.1, 20);
  const triplePct = clamp(state.tripleChancePct, 0, 100) / 100;
  const effectiveSpawnMinGame = spawnRateMult > 0 ? LOOTBUG_BASE_SPAWN_MIN / spawnRateMult : 0;
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
    const freeMinPerHour = (freePerHour * 2) / gameSpeed;
    const gemMinPerHour = (gemPerHour * 10) / gameSpeed;
    return freeMinPerHour + gemMinPerHour;
  }, [lootbugsPerHour, totalFreeWeight, totalGemWeightAll, gameSpeed]);

  const bombRecharge10xMinPerHour = useMemo(() => {
    if (gameSpeed <= 0) return 0;
    const buff = GEM_BUFFS.find((b) => b.name === "10x Bomb Recharge");
    if (!buff || totalGemWeightAll <= 0) return 0;
    const perHour = (lootbugsPerHour * getWeight(buff)) / totalGemWeightAll;
    return (perHour * 2) / gameSpeed;
  }, [lootbugsPerHour, totalGemWeightAll, gameSpeed]);

  const goldenPct = clamp(state.goldenChancePct, 0, 100) / 100;

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

  const netGemsPerHour = gemsPerHour - totalGemCostPerHour;

  useEffect(() => {
    const ext = loadJson<{ lootbugBomb10xMinPerHour?: number; droneBomb10xMinPerHour?: number; lootbugNetGemsPerHour?: number }>(GEMEV_EXTERNAL_KEY) ?? {};
    ext.lootbugBomb10xMinPerHour = bombRecharge10xMinPerHour;
    ext.lootbugNetGemsPerHour = netGemsPerHour;
    saveJson(GEMEV_EXTERNAL_KEY, ext);
  }, [bombRecharge10xMinPerHour, netGemsPerHour]);

  const GEM_ICON = "https://static.wikitide.net/shminerwiki/a/aa/Gem.png";
  const GAME_SPEED_ICON = "https://static.wikitide.net/shminerwiki/d/d4/Game_Speed_Multiplier.png";
  const BOMB_RECHARGE_ICON =
    "https://static.wikitide.net/shminerwiki/b/ba/Bomb_Recharge_Speed_10x_Buff.png";

  return (
    <div className="container">
      <div className="lootbugGrid">
      <div className="lootbugIntro">
        <p>
          Lootbugs spawn on the main screen every 20 game minutes (base). Tap to claim a free reward,
          or pay Gems for an additional reward. Golden Lootbugs grant the Gem buff for free.
        </p>
        <p>
          Enter your stats below to see effective values (e.g. time between spawns). Stats and
          sources follow the{" "}
          <a
            href="https://shminer.miraheze.org/wiki/Stats#Lootbugs"
            target="_blank"
            rel="noreferrer noopener"
          >
            Stats
          </a>{" "}
          and{" "}
          <a
            href="https://shminer.miraheze.org/wiki/Lootbugs"
            target="_blank"
            rel="noreferrer noopener"
          >
            Lootbugs
          </a>{" "}
          wiki pages.
        </p>
      </div>

      <Collapsible id="lootbug-stats" title="Lootbug stats" defaultExpanded={true}>
        <div className="lootbugSection">
          <div className="lootbugSectionTitle">Your stats</div>
          <div className="lootbugGameSpeedReadOnly">
            <div className="lootbugRow lootbugGameSpeedRow">
              <span className="lootbugLabel">
                Game Speed
                <Tooltip
                  content={{
                    title: "Game Speed",
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
            stat.id === "goldenChancePct" ? (
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

      <Collapsible id="lootbug-gains" title="Lootbug gains" defaultExpanded={true}>
        <div className="lootbugSection">
          <div className="lootbugGemsBlock">
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
              <span className="lootbugValue">{gemsPerHour.toFixed(1)}</span>
            </div>
            <div className="lootbugRow lootbugNetGemsRow">
              <span className="lootbugStatLabel">
                <img src={GEM_ICON} alt="" className="lootbugStatIcon" aria-hidden />
                <span className="lootbugLabel">
                  Net gems / h
                  <Tooltip
                    content={{
                      title: "Net gems / h",
                      lines: [
                        "Gems (raw) minus Gem/h spent on 2× Game Speed and 10× Bomb Recharge.",
                        "Raw gems + (negative Gem/h) = net gems after costs.",
                      ],
                    }}
                  />
                </span>
              </span>
              <span
                className="lootbugValue"
                style={
                  netGemsPerHour < 0
                    ? { color: "var(--bad)" }
                    : netGemsPerHour > 0
                      ? { color: "var(--good)" }
                      : undefined
                }
              >
                {netGemsPerHour.toFixed(1)}
              </span>
            </div>
          </div>
          <div className="lootbugBuffsBlock">
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
              <span className="lootbugValue">{gameSpeed2xMinPerHour.toFixed(2)} min</span>
            </div>
            <div className="lootbugRow">
              <span className="lootbugStatLabel">
                <img src={BOMB_RECHARGE_ICON} alt="" className="lootbugStatIcon" aria-hidden />
                <span className="lootbugLabel">
                  10× Bomb Recharge / h
                  <Tooltip
                    content={{
                      title: "10× Bomb Recharge / h",
                      lines: [
                        "Min/h with 10× Bomb Recharge active (gem buff, 2 min duration).",
                      ],
                    }}
                  />
                </span>
              </span>
              <span className="lootbugValue">{bombRecharge10xMinPerHour.toFixed(2)} min</span>
            </div>
          </div>
        </div>
      </Collapsible>

      <Collapsible id="lootbug-free-buffs" title="Free buffs" defaultExpanded={true}>
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
                    min/h
                    <Tooltip
                      content={{
                        title: "min/h",
                        sections: [
                          {
                            heading: "Real time",
                            lines: [
                              "Average minutes per hour this buff is active (real time).",
                              "Formula: per hour × duration (game min) ÷ game speed. Applied once; not double-counted with the duration shown in parentheses.",
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
                  const perHour = totalFreeWeight > 0 ? (lootbugsPerHour * weight) / totalFreeWeight : 0;
                  const durMin = getDurationMinutes(buff.duration);
                  const minPerHour =
                    durMin != null && gameSpeed > 0 ? (perHour * durMin) / gameSpeed : null;
                  const realDurMin = durMin != null && gameSpeed > 0 ? durMin / gameSpeed : null;
                  return (
                    <tr key={buff.name}>
                      <td>
                        <span className="lootbugBuffCell">
                          <img src={getFreeBuffIcon(buff.name)} alt="" className="lootbugBuffIcon" aria-hidden />
                          <span>{buff.name}</span>
                          {buff.duration ? (
                            <span className="lootbugBuffDuration">
                              {realDurMin != null
                                ? (() => {
                                    const m = Math.floor(realDurMin);
                                    const s = Math.round((realDurMin * 60) % 60);
                                    return ` (${m}:${String(s).padStart(2, "0")} min)`;
                                  })()
                                : ` (${buff.duration})`}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="lootbugTableNum">{perHour.toFixed(2)}</td>
                      <td className="lootbugTableNum">
                        {minPerHour != null ? minPerHour.toFixed(2) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      </Collapsible>

      <Collapsible id="lootbug-gem-buffs" title="Gem buffs" defaultExpanded={true}>
        <div className="lootbugSection lootbugBuffsSection">
          <p className="lootbugHint" style={{ marginBottom: 10 }}>
            Per hour and min/h use the full pool (all buffs can appear). Toggle Buy for buffs you pay for; only those count toward Gem/h and net gems.
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
                        lines: [
                          "Average occurrences of this buff per hour (full pool, independent of Buy).",
                          "Formula: lootbugs/h × (weight ÷ total weight of all gem buffs).",
                        ],
                      }}
                    />
                  </th>
                  <th className="lootbugTableThRight">
                    min/h
                    <Tooltip
                      content={{
                        title: "min/h",
                        sections: [
                          {
                            heading: "Real time",
                            lines: [
                              "Average minutes per hour this buff is active (real time). From full pool.",
                              "Formula: per hour × duration (game min) ÷ game speed.",
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
                  const perHour =
                    totalGemWeightAll > 0 ? (lootbugsPerHour * weight) / totalGemWeightAll : 0;
                  const durMin = getDurationMinutes(buff.duration);
                  const minPerHour =
                    durMin != null && gameSpeed > 0 ? (perHour * durMin) / gameSpeed : null;
                  const realDurMin = durMin != null && gameSpeed > 0 ? durMin / gameSpeed : null;
                  const actualCost = isBuy ? Math.max(0, buff.cost - state.gemCostReduction) : 0;
                  const gemCostWithGolden =
                    isBuy && actualCost > 0 ? perHour * actualCost * (1 - goldenPct) : 0;
                  const gemPerHourDisplay =
                    isBuy && gemCostWithGolden > 0 ? -gemCostWithGolden : null;
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
                          <span>{buff.name}</span>
                          {buff.duration ? (
                            <span className="lootbugBuffDuration">
                              {realDurMin != null
                                ? (() => {
                                    const m = Math.floor(realDurMin);
                                    const s = Math.round((realDurMin * 60) % 60);
                                    return ` (${m}:${String(s).padStart(2, "0")} min)`;
                                  })()
                                : ` (${buff.duration})`}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="lootbugTableNum">{perHour.toFixed(2)}</td>
                      <td className="lootbugTableNum">
                        {minPerHour != null ? minPerHour.toFixed(2) : "—"}
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
