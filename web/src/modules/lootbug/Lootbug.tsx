import { useEffect, useRef, useState } from "react";
import "./lootbug.css";
import { Tooltip } from "../../components/Tooltip";
import { Collapsible } from "../../components/Collapsible";
import { loadJson, saveJson } from "../../lib/storage";

const WIKI_ICON = "https://static.wikitide.net/shminerwiki/2/27/Blank_Button.png";

const LOOTBUG_BASE_SPAWN_MIN = 20;

const STORAGE_KEY = "obeliskfarm:web:lootbug_save.json:v1";

type LootbugState = {
  spawnRateMultiplier: number;
  tripleChancePct: number;
  goldenChancePct: number;
  bankedCap: number;
  gemCostReduction: number;
  lootMultiplier: number;
};

const DEFAULT: LootbugState = {
  spawnRateMultiplier: 1,
  tripleChancePct: 0,
  goldenChancePct: 0,
  bankedCap: 0,
  gemCostReduction: 0,
  lootMultiplier: 1,
};

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

const STATS: Array<{
  id: keyof LootbugState;
  label: string;
  description: string;
  sources: string[];
  suffix?: string;
  decimals?: number;
}> = [
  {
    id: "spawnRateMultiplier",
    label: "Lootbug Spawn Rate Multiplier",
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
    id: "tripleChancePct",
    label: "Triple Lootbug Chance",
    description: "The chance for 3 Lootbugs to appear when a spawn occurs.",
    sources: [
      "Cards: Whale Card",
      "Pets: Whale Pet",
      "Stargazing: Libra",
      "Skins: Skin Reward",
    ],
    suffix: "%",
    decimals: 1,
  },
  {
    id: "goldenChancePct",
    label: "Golden Lootbug Chance",
    description: "The chance for the Lootbug purchasable loot to be free (Gem buff for free).",
    sources: [
      "Store: Golden Lootbug Bundle, Founder Perk (Tier 5)",
      "Stargazing: Aquarius",
    ],
    suffix: "%",
    decimals: 1,
  },
  {
    id: "bankedCap",
    label: "Banked Lootbug Cap",
    description: "How many Lootbugs you can keep in storage in addition to the one on screen.",
    sources: [
      "Items: Lootbug Lantern",
      "Store: Banker's Bundle, Bigger Banker's Bundle",
      "Skill-Tree: Saving For A Rainy Day, Anyone Up Lootin' They Bugs",
      "Pets: Whale Pet Quest",
      "Stargazing: Ophiuchus + Super Star, Eighth Black Hole boost",
      "Construct: Statue of Eastwood",
      "Fishing: Tier 1 Storm Serpent Tribute",
      "Skins: Skin Reward (multiplier)",
    ],
    decimals: 0,
  },
  {
    id: "gemCostReduction",
    label: "Lootbug Gem Cost Reduction",
    description: "The amount by which the gem cost of purchasable loot is reduced.",
    sources: [
      "Skill-Tree: Saving For A Rainy Day",
      "Pets: Whale Pet Skin",
      "Skins: Skin Rewards",
    ],
    decimals: 0,
  },
  {
    id: "lootMultiplier",
    label: "Lootbug Loot Multiplier",
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
];

export function Lootbug() {
  const [state, setState] = useState<LootbugState>(() => {
    const saved = loadJson<Partial<LootbugState>>(STORAGE_KEY);
    const s = { ...DEFAULT, ...saved } as LootbugState;
    s.spawnRateMultiplier = clamp(s.spawnRateMultiplier, 0.1, 20);
    s.tripleChancePct = clamp(s.tripleChancePct, 0, 100);
    s.goldenChancePct = clamp(s.goldenChancePct, 0, 100);
    s.bankedCap = clamp(s.bankedCap, 0, 100);
    s.gemCostReduction = clamp(s.gemCostReduction, 0, 20);
    s.lootMultiplier = clamp(s.lootMultiplier, 1, 5);
    return s;
  });

  useEffect(() => {
    saveJson(STORAGE_KEY, state);
  }, [state]);

  const update = (patch: Partial<LootbugState>) => setState((s) => ({ ...s, ...patch }));

  const spawnRateMult = clamp(state.spawnRateMultiplier, 0.1, 20);
  const effectiveSpawnMin = spawnRateMult > 0 ? LOOTBUG_BASE_SPAWN_MIN / spawnRateMult : 0;

  return (
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
          {STATS.map((stat) => (
            <NumInput
              key={stat.id}
              label={
                <span className="lootbugStatLabel">
                  <img src={WIKI_ICON} alt="" className="lootbugStatIcon" aria-hidden />
                  <span className="lootbugLabel">
                    {stat.label}{" "}
                    <Tooltip
                      content={{
                        title: stat.label,
                        sections: [
                          { heading: "Description", lines: [stat.description] },
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
          ))}

          <div className="lootbugDerived">
            <div className="lootbugDerivedTitle">Derived</div>
            <div className="lootbugRow">
              <span className="lootbugLabel">
                Effective spawn interval (game time)
                <Tooltip
                  content={{
                    title: "Effective spawn interval",
                    lines: [
                      "Time between Lootbug spawns in game minutes.",
                      "Formula: 20 ÷ Lootbug Spawn Rate Multiplier.",
                    ],
                  }}
                />
              </span>
              <span className="lootbugValue">
                {effectiveSpawnMin >= 1
                  ? effectiveSpawnMin.toFixed(1) + " min"
                  : (effectiveSpawnMin * 60).toFixed(1) + " s"}
              </span>
            </div>
          </div>
        </div>
      </Collapsible>

      <Collapsible id="lootbug-buffs" title="Lootbug buffs (reference)" defaultExpanded={false}>
        <div className="lootbugSection">
          <div className="lootbugSectionTitle">Free buffs (tap Lootbug)</div>
          <p className="lootbugHint" style={{ marginBottom: 8 }}>
            Rewards are chosen randomly with weights. Examples: +2 Gems, +1 Item Chest, +1 Relic
            Chest, +10 Cherry Charges, 2× Ore Income (2 min), 3× Vein Spawn Rate (2 min), 2× Game
            Speed (2 min), 2× Star Spawn Rate (2 min), 100% Auto-Catch (4 min). Some require
            unlocks (e.g. Telescope, Cherry Bomb, Stone Vein Research).
          </p>
          <div className="lootbugSectionTitle" style={{ marginTop: 12 }}>
            Gem buffs (pay Gems or free with Golden Lootbug)
          </div>
          <p className="lootbugHint">
            Examples: +3 Item Chests, +1 Relic Chest, +100 Cherry Charges, 2× Ore Income (10 min),
            3× Vein Spawn Rate (10 min), 2× Game Speed (10 min), 10× Bomb Recharge (2 min), 2× Star
            Spawn Rate (10 min), 100% Auto-Catch (20 min), Archaeology Attacks +600, Fishing Ticks
            +12. Cost and weights vary; see wiki.
          </p>
        </div>
      </Collapsible>
    </div>
  );
}
