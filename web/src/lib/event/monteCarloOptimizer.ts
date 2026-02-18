// Ported from ObeliskGemEV/event/monte_carlo_optimizer.py (guided single-core MC).

import { COSTS, getPrestigeWaveRequirement, getRewardBand, isDamageOnlyUpgrade, isPureCritUpgrade, TARGET_WAVE_ATK_BUFFER } from "./constants";
import { applyUpgrades, runFullSimulation, calculateMaterials, getEnemyHpAtWave } from "./simulation";
import { createBaseEnemyStats, type EnemyStats, type PlayerStats } from "./stats";
import { greedyOptimize, type Budget, type UpgradeState, copyState, createEmptyState, getMaxLevelWithCaps, isUpgradeUnlocked, canAllocateUpgrade } from "./optimizer";
import { mulberry32 } from "../rng";

export type ProgressCallback = (currentRun: number, totalRuns: number, currentWave: number, bestWave: number) => void;

export interface MCOptimizationResult {
  bestState: UpgradeState;
  bestWave: number;
  bestTime: number;
  materialsSpent: Budget;
  materialsRemaining: Budget;
  playerStats: PlayerStats;
  enemyStats: EnemyStats;
  allResults: Array<{ state: UpgradeState; wave: number; time: number }>;
  statistics: Record<string, number>;
  /** When band mode: effective band and currency/h used for tie-break. */
  bestWaveBand?: number;
  bestCurrencyPerHour?: number;
  /** Per-tier currency per hour (Tier 1–4) for the best build when band mode. */
  bestCurrencyPerHourByTier?: { 1: number; 2: number; 3: number; 4: number };
  /** Set when band from fixed step (e.g. 5). */
  waveBandStep?: number;
  /** Set when band from reward milestones. */
  tieBreakByRewardMilestones?: boolean;
}

type Rng = { random: () => number };

function makeRng(seed: number): Rng {
  const r = mulberry32(seed);
  return { random: r };
}

function weightedChoice<T>(items: T[], weights: number[], rng: Rng): T {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return items[Math.floor(rng.random() * items.length)];
  const x = rng.random() * total;
  let acc = 0;
  for (let i = 0; i < items.length; i += 1) {
    acc += weights[i];
    if (x <= acc) return items[i];
  }
  return items[items.length - 1];
}

function buildCandidateState(args: {
  budget: Budget;
  prestige: number;
  initialState: UpgradeState;
  seed: number;
  epsilonGreedy: number;
  /** When set with requiredAtk: skip damage-only upgrades that would push atk above this (target-wave cap). */
  requiredAtk?: number | null;
}): UpgradeState {
  const { budget, prestige, initialState, seed, epsilonGreedy, requiredAtk } = args;
  const rng = makeRng(seed);

  const state = copyState(initialState);
  const remaining: Budget = { 1: budget[1], 2: budget[2], 3: budget[3], 4: budget[4] };

  const available: Array<{ tier: 1 | 2 | 3 | 4; idx: number }> = [];
  for (const tier of [1, 2, 3, 4] as const) {
    for (let idx = 0; idx < COSTS[tier].length; idx += 1) {
      if (isUpgradeUnlocked(tier, idx, prestige)) available.push({ tier, idx });
    }
  }

  const tierPriorityScore: Record<number, Record<number, number>> = {
    1: { 0: 100, 9: 95, 6: 90, 1: 80, 2: 70, 4: 65, 3: 60, 5: 50, 7: 40, 8: 30 },
    2: { 2: 100, 0: 90, 1: 85, 4: 80, 3: 70, 5: 50, 6: 40 },
    3: { 0: 100, 4: 95, 7: 90, 1: 85, 3: 80, 2: 60, 6: 50, 5: 40 },
    4: { 4: 100, 7: 95, 1: 90, 3: 85, 0: 80, 2: 70, 5: 50, 6: 40 },
  };

  const maxIterations = 2000;
  for (let it = 0; it < maxIterations; it += 1) {
    const affordable: Array<{ tier: 1 | 2 | 3 | 4; idx: number; cost: number; eff: number }> = [];

    for (const a of available) {
      if (!canAllocateUpgrade(a.tier, a.idx, state)) continue;
      const currentLevel = state.levels[a.tier][a.idx];
      const maxLevel = getMaxLevelWithCaps(a.tier, a.idx, state);
      if (currentLevel >= maxLevel) continue;

      const baseCost = COSTS[a.tier][a.idx];
      const nextCost = Math.round(baseCost * 1.25 ** currentLevel);
      if (nextCost > remaining[a.tier]) continue;

      if (requiredAtk != null && requiredAtk > 0) {
        if (isPureCritUpgrade(a.tier, a.idx) && currentLevel >= 1) continue;
        if (isDamageOnlyUpgrade(a.tier, a.idx)) {
          const testState = copyState(state);
          testState.levels[a.tier][a.idx] = currentLevel + 1;
          const { player } = applyUpgrades(testState.levels, prestige, testState.gemLevels);
          if (player.atk > requiredAtk) continue;
        }
      }

      const prio = tierPriorityScore[a.tier]?.[a.idx] ?? 10;
      const eff = prio / (nextCost + 1) ** 0.35;
      affordable.push({ tier: a.tier, idx: a.idx, cost: nextCost, eff });
    }

    if (!affordable.length) break;

    let pick: { tier: 1 | 2 | 3 | 4; idx: number; cost: number };
    // Match Python logic:
    // if epsilon_greedy > 0 and rng.random() >= epsilon_greedy -> greedy; else exploratory weighted.
    if (epsilonGreedy > 0 && rng.random() >= epsilonGreedy) {
      const best = affordable.reduce((acc, cur) => (cur.eff > acc.eff ? cur : acc), affordable[0]);
      pick = { tier: best.tier, idx: best.idx, cost: best.cost };
    } else {
      const weights = affordable.map((x) => Math.max(1e-6, x.eff));
      const chosen = weightedChoice(affordable, weights, rng);
      pick = { tier: chosen.tier, idx: chosen.idx, cost: chosen.cost };
    }

    state.levels[pick.tier][pick.idx] += 1;
    remaining[pick.tier] -= pick.cost;
  }

  return state;
}

function evaluateStateSerial(args: { state: UpgradeState; prestige: number; runs: number; seed: number }): { wave: number; time: number; player: PlayerStats; enemy: EnemyStats } {
  const { state, prestige, runs, seed } = args;
  const rng = mulberry32(seed & 0x7fffffff);

  const { player, enemy } = applyUpgrades(state.levels, prestige, state.gemLevels);
  const sim = runFullSimulation(player, enemy, Math.max(1, runs), rng);
  return { wave: sim.avgWave, time: sim.avgTime, player, enemy };
}

export interface PrestigeReachMcResult {
  probability: number;
  successCount: number;
  totalRuns: number;
  targetWave: number;
  meanWave: number;
  budget: Budget;
}

/** MC: with this budget (e.g. from 1h farming), how often do we reach the next prestige wave? */
export function prestigeReachMc(args: {
  budget: Budget;
  prestige: number;
  /** If set, use this as target wave instead of (prestige+1)*5. */
  targetWave?: number | null;
  initialState?: UpgradeState | null;
  numRuns?: number;
  runsPerCombo?: number;
  seedBase?: number | null;
}): PrestigeReachMcResult {
  const {
    budget,
    prestige,
    targetWave: targetWaveArg = null,
    initialState = null,
    numRuns = 500,
    runsPerCombo = 5,
    seedBase = null,
  } = args;
  const targetWave = targetWaveArg != null ? targetWaveArg : getPrestigeWaveRequirement(prestige);
  const state0 = initialState ? copyState(initialState) : createEmptyState();
  const seed = (seedBase ?? (Date.now() & 0x7fffffff)) & 0x7fffffff;
  let successCount = 0;
  let waveSum = 0;

  for (let i = 0; i < numRuns; i += 1) {
    const opt = greedyOptimize({
      budget: { 1: budget[1], 2: budget[2], 3: budget[3], 4: budget[4] },
      prestige,
      targetWave,
      initialState: state0,
      seed: seed + i * 1000,
    });
    const ev = evaluateStateSerial({ state: opt.upgrades, prestige, runs: runsPerCombo, seed: seed + i * 2000 + 1 });
    waveSum += ev.wave;
    if (ev.wave >= targetWave) successCount += 1;
  }

  return {
    probability: successCount / numRuns,
    successCount,
    totalRuns: numRuns,
    targetWave,
    meanWave: waveSum / numRuns,
    budget: { 1: budget[1], 2: budget[2], 3: budget[3], 4: budget[4] },
  };
}

/** Estimate P(reach target wave) for a fixed build: no optimization, just many sim runs. */
export function estimateReachProbabilityGivenState(args: {
  state: UpgradeState;
  prestige: number;
  targetWave: number;
  budget: Budget;
  numRuns?: number;
  runsPerCombo?: number;
  seedBase?: number | null;
}): PrestigeReachMcResult {
  const {
    state,
    prestige,
    targetWave,
    budget,
    numRuns = 500,
    runsPerCombo = 5,
    seedBase = null,
  } = args;
  const runs = Math.max(1, Math.trunc(runsPerCombo));
  const n = Math.max(1, Math.trunc(numRuns));
  const seed = (seedBase ?? (Date.now() & 0x7fffffff)) & 0x7fffffff;
  let successCount = 0;
  let waveSum = 0;
  for (let i = 0; i < n; i += 1) {
    const ev = evaluateStateSerial({ state, prestige, runs, seed: seed + i * 2000 + 1 });
    waveSum += ev.wave;
    if (ev.wave >= targetWave) successCount += 1;
  }
  return {
    probability: successCount / n,
    successCount,
    totalRuns: n,
    targetWave,
    meanWave: waveSum / n,
    budget: { 1: budget[1], 2: budget[2], 3: budget[3], 4: budget[4] },
  };
}

export function monteCarloOptimizeGuided(args: {
  budget: Budget;
  prestige: number;
  initialState?: UpgradeState | null;
  numRuns?: number;
  eventRunsPerCombination?: number;
  seedBase?: number | null;
  progressCallback?: ProgressCallback | null;
  /** Wave band step (e.g. 5): same band → tie-break by currency/h. 0 = off. */
  waveBandStep?: number | null;
  /** When true: band = highest reward wave reached (EVENT_REWARD_WAVES), tie-break by currency/h. */
  useRewardMilestones?: boolean | null;
  /** When set: used as reference; optimizer skips damage-only upgrades once atk >= enemy HP at this wave. */
  targetWave?: number | null;
}): MCOptimizationResult {
  const {
    budget,
    prestige,
    initialState: initialStateArg = null,
    numRuns = 2000,
    eventRunsPerCombination = 5,
    seedBase = null,
    progressCallback = null,
    waveBandStep: waveBandStepArg = null,
    useRewardMilestones = false,
    targetWave: targetWaveArg = null,
  } = args;
  const waveBandStep = waveBandStepArg != null && waveBandStepArg > 0 ? Math.trunc(waveBandStepArg) : 0;
  const useReward = Boolean(useRewardMilestones);
  const bandMode = useReward || waveBandStep > 0;
  const targetWave = targetWaveArg != null && Number.isFinite(targetWaveArg) ? Math.max(0, Math.trunc(targetWaveArg)) : null;

  const initialState = initialStateArg ? copyState(initialStateArg) : createEmptyState();
  const { enemy: enemyBase } = applyUpgrades(initialState.levels, prestige, initialState.gemLevels);
  const requiredAtk =
    targetWave != null
      ? Math.ceil(getEnemyHpAtWave(enemyBase, targetWave) * TARGET_WAVE_ATK_BUFFER)
      : null;

  const nCandidates = Math.max(1, Math.trunc(numRuns));
  const runs = Math.max(1, Math.trunc(eventRunsPerCombination));
  const seedBaseLocal = (seedBase ?? (Date.now() & 0x7fffffff)) & 0x7fffffff;

  const candidates: UpgradeState[] = [];
  try {
    const greedy = greedyOptimize({
      budget,
      prestige,
      initialState,
      targetWave: null,
      requiredAtk: requiredAtk ?? undefined,
      seed: seedBaseLocal + 123,
    });
    candidates.push(copyState(greedy.upgrades));
  } catch {
    // ignore
  }

  for (let i = 0; i < nCandidates; i += 1) {
    const eps = i % 5 !== 0 ? 0.2 : 1.0;
    candidates.push(
      buildCandidateState({
        budget,
        prestige,
        initialState,
        seed: seedBaseLocal + i,
        epsilonGreedy: eps,
        requiredAtk: requiredAtk ?? undefined,
      }),
    );
  }

  const allResults: Array<{ state: UpgradeState; wave: number; time: number }> = [];
  let bestState: UpgradeState | null = null;
  let bestWave = -1;
  let bestTime = Number.POSITIVE_INFINITY;
  let bestWaveBand = -1;
  let bestCurrencyPerHour = -1;

  for (let idx = 0; idx < candidates.length; idx += 1) {
    const cand = candidates[idx];
    const ev = evaluateStateSerial({ state: cand, prestige, runs, seed: seedBaseLocal + 10_000 + (idx + 1) });
    allResults.push({ state: copyState(cand), wave: ev.wave, time: ev.time });

    const band = useReward ? getRewardBand(ev.wave) : waveBandStep > 0 ? Math.floor(ev.wave / waveBandStep) * waveBandStep : ev.wave;
    const mats = ev.time > 0 ? calculateMaterials(ev.wave, ev.player) : { mat1: 0, mat2: 0, mat3: 0, mat4: 0 };
    const totalMats = mats.mat1 + mats.mat2 + mats.mat3 + mats.mat4;
    const currencyPerHour = ev.time > 0 ? totalMats * (3600 / ev.time) : 0;

    let isBetter: boolean;
    if (bandMode) {
      isBetter = band > bestWaveBand || (band === bestWaveBand && currencyPerHour > bestCurrencyPerHour);
      if (isBetter) {
        bestWaveBand = band;
        bestCurrencyPerHour = currencyPerHour;
      }
    } else {
      isBetter = ev.wave > bestWave || (ev.wave === bestWave && ev.time < bestTime);
    }
    if (isBetter) {
      bestWave = ev.wave;
      bestTime = ev.time;
      bestState = copyState(cand);
      if (!bandMode) {
        bestWaveBand = ev.wave;
        bestCurrencyPerHour = ev.time > 0 ? totalMats * (3600 / ev.time) : 0;
      }
    }

    if (progressCallback) progressCallback(idx + 1, candidates.length, ev.wave, bestWave);
  }

  const waves = allResults.map((r) => r.wave);
  const times = allResults.map((r) => r.time);
  const wavesSorted = waves.slice().sort((a, b) => a - b);
  const timesSorted = times.slice().sort((a, b) => a - b);
  const n = waves.length;

  const meanWave = n ? waves.reduce((a, b) => a + b, 0) / n : 0;
  const meanTime = n ? times.reduce((a, b) => a + b, 0) / n : 0;

  const stdDevWave =
    n > 1 ? Math.sqrt(waves.reduce((acc, w) => acc + (w - meanWave) ** 2, 0) / (n - 1)) : 0;
  const stdDevTime =
    n > 1 ? Math.sqrt(times.reduce((acc, t) => acc + (t - meanTime) ** 2, 0) / (n - 1)) : 0;

  const medianWave = n ? wavesSorted[Math.floor(n / 2)] : 0;
  const medianTime = n ? timesSorted[Math.floor(n / 2)] : 0;
  const p5Wave = n ? wavesSorted[Math.floor(n * 0.05)] : 0;
  const p95Wave = n ? wavesSorted[Math.floor(n * 0.95)] : 0;

  const best = bestState ?? initialState;

  // spent/remaining relative to initial state (matches Python)
  const materialsSpent: Budget = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const materialsRemaining: Budget = { 1: budget[1], 2: budget[2], 3: budget[3], 4: budget[4] };
  for (const tier of [1, 2, 3, 4] as const) {
    for (let uidx = 0; uidx < COSTS[tier].length; uidx += 1) {
      const initialLevel = initialState.levels[tier][uidx] ?? 0;
      const finalLevel = best.levels[tier][uidx] ?? 0;
      for (let level = initialLevel; level < finalLevel; level += 1) {
        const cost = Math.round(COSTS[tier][uidx] * 1.25 ** level);
        materialsSpent[tier] += cost;
        materialsRemaining[tier] -= cost;
      }
    }
  }

  const { playerStats, enemyStats } = (() => {
    const { player, enemy } = applyUpgrades(best.levels, prestige, best.gemLevels);
    return { playerStats: player, enemyStats: enemy };
  })();

  const bestCurrencyPerHourByTier =
    bandMode && bestTime > 0
      ? (() => {
          const mats = calculateMaterials(bestWave, playerStats);
          const scale = 3600 / bestTime;
          return { 1: mats.mat1 * scale, 2: mats.mat2 * scale, 3: mats.mat3 * scale, 4: mats.mat4 * scale };
        })()
      : undefined;

  const statistics: Record<string, number> = {
    mean_wave: meanWave,
    median_wave: medianWave,
    std_dev_wave: stdDevWave,
    min_wave: n ? Math.min(...waves) : 0,
    max_wave: n ? Math.max(...waves) : 0,
    p5_wave: p5Wave,
    p95_wave: p95Wave,
    mean_time: meanTime,
    median_time: medianTime,
    std_dev_time: stdDevTime,
    min_time: n ? Math.min(...times) : 0,
    max_time: n ? Math.max(...times) : 0,
  };

  return {
    bestState: best,
    bestWave,
    bestTime,
    materialsSpent,
    materialsRemaining,
    playerStats,
    enemyStats,
    allResults,
    statistics,
    ...(bandMode
      ? {
          bestWaveBand,
          bestCurrencyPerHour,
          ...(bestCurrencyPerHourByTier ? { bestCurrencyPerHourByTier } : {}),
          ...(waveBandStep > 0 ? { waveBandStep } : {}),
          ...(useReward ? { tieBreakByRewardMilestones: true } : {}),
        }
      : {}),
  };
}

/** Build grid of per-tier budget points: 0, step, 2*step, ... up to budget[t]. */
function budgetGrid(budget: Budget, step: number): Array<{ 1: number; 2: number; 3: number; 4: number }> {
  const s = Math.max(1, Math.trunc(step));
  const p1 = [0]; for (let x = s; x <= budget[1]; x += s) p1.push(x);
  const p2 = [0]; for (let x = s; x <= budget[2]; x += s) p2.push(x);
  const p3 = [0]; for (let x = s; x <= budget[3]; x += s) p3.push(x);
  const p4 = [0]; for (let x = s; x <= budget[4]; x += s) p4.push(x);
  const out: Array<{ 1: number; 2: number; 3: number; 4: number }> = [];
  for (const a of p1) for (const b of p2) for (const c of p3) for (const d of p4) {
    out.push({ 1: a, 2: b, 3: c, 4: d });
  }
  return out;
}

/**
 * Brute-force optimizer: grid over per-tier budgets, greedy allocation per point, then evaluate.
 * Same selection logic (band + currency/h or wave + time) and return shape as guided MC.
 */
export function bruteForceOptimize(args: {
  budget: Budget;
  prestige: number;
  initialState?: UpgradeState | null;
  /** Budget step per tier (e.g. 200). Grid size = product of (floor(b[t]/step)+1); use larger step for big budgets. */
  budgetStep?: number;
  eventRunsPerCombination?: number;
  seedBase?: number | null;
  progressCallback?: ProgressCallback | null;
  waveBandStep?: number | null;
  useRewardMilestones?: boolean | null;
  /** Max grid points to try; if grid is larger, step is increased. */
  maxCandidates?: number;
}): MCOptimizationResult {
  const {
    budget,
    prestige,
    initialState: initialStateArg = null,
    budgetStep = 200,
    eventRunsPerCombination = 5,
    seedBase = null,
    progressCallback = null,
    waveBandStep: waveBandStepArg = null,
    useRewardMilestones = false,
    maxCandidates = 25000,
  } = args;
  const waveBandStep = waveBandStepArg != null && waveBandStepArg > 0 ? Math.trunc(waveBandStepArg) : 0;
  const useReward = Boolean(useRewardMilestones);
  const bandMode = useReward || waveBandStep > 0;
  const initialState = initialStateArg ? copyState(initialStateArg) : createEmptyState();
  const runs = Math.max(1, Math.trunc(eventRunsPerCombination));
  const seedBaseLocal = (seedBase ?? (Date.now() & 0x7fffffff)) & 0x7fffffff;

  let step = Math.max(1, Math.trunc(budgetStep));
  let grid = budgetGrid(budget, step);
  while (grid.length > maxCandidates && step < Math.max(budget[1], budget[2], budget[3], budget[4])) {
    step = Math.min(step * 2, 99999);
    grid = budgetGrid(budget, step);
  }

  const allResults: Array<{ state: UpgradeState; wave: number; time: number }> = [];
  let bestState: UpgradeState | null = null;
  let bestWave = -1;
  let bestTime = Number.POSITIVE_INFINITY;
  let bestWaveBand = -1;
  let bestCurrencyPerHour = -1;

  for (let idx = 0; idx < grid.length; idx += 1) {
    const sub = grid[idx];
    let cand: UpgradeState;
    try {
      const opt = greedyOptimize({
        budget: { 1: sub[1], 2: sub[2], 3: sub[3], 4: sub[4] },
        prestige,
        initialState,
        seed: seedBaseLocal + idx,
      });
      cand = opt.upgrades;
    } catch {
      continue;
    }
    const ev = evaluateStateSerial({ state: cand, prestige, runs, seed: seedBaseLocal + 50_000 + (idx + 1) });
    allResults.push({ state: copyState(cand), wave: ev.wave, time: ev.time });

    const band = useReward ? getRewardBand(ev.wave) : waveBandStep > 0 ? Math.floor(ev.wave / waveBandStep) * waveBandStep : ev.wave;
    const mats = ev.time > 0 ? calculateMaterials(ev.wave, ev.player) : { mat1: 0, mat2: 0, mat3: 0, mat4: 0 };
    const totalMats = mats.mat1 + mats.mat2 + mats.mat3 + mats.mat4;
    const currencyPerHour = ev.time > 0 ? totalMats * (3600 / ev.time) : 0;

    let isBetter: boolean;
    if (bandMode) {
      isBetter = band > bestWaveBand || (band === bestWaveBand && currencyPerHour > bestCurrencyPerHour);
      if (isBetter) {
        bestWaveBand = band;
        bestCurrencyPerHour = currencyPerHour;
      }
    } else {
      isBetter = ev.wave > bestWave || (ev.wave === bestWave && ev.time < bestTime);
    }
    if (isBetter) {
      bestWave = ev.wave;
      bestTime = ev.time;
      bestState = copyState(cand);
      if (!bandMode) {
        bestWaveBand = ev.wave;
        bestCurrencyPerHour = ev.time > 0 ? totalMats * (3600 / ev.time) : 0;
      }
    }

    if (progressCallback) progressCallback(idx + 1, grid.length, ev.wave, bestWave);
  }

  const waves = allResults.map((r) => r.wave);
  const times = allResults.map((r) => r.time);
  const wavesSorted = waves.slice().sort((a, b) => a - b);
  const timesSorted = times.slice().sort((a, b) => a - b);
  const n = waves.length;

  const meanWave = n ? waves.reduce((a, b) => a + b, 0) / n : 0;
  const meanTime = n ? times.reduce((a, b) => a + b, 0) / n : 0;
  const stdDevWave = n > 1 ? Math.sqrt(waves.reduce((acc, w) => acc + (w - meanWave) ** 2, 0) / (n - 1)) : 0;
  const stdDevTime = n > 1 ? Math.sqrt(times.reduce((acc, t) => acc + (t - meanTime) ** 2, 0) / (n - 1)) : 0;
  const medianWave = n ? wavesSorted[Math.floor(n / 2)] : 0;
  const medianTime = n ? timesSorted[Math.floor(n / 2)] : 0;
  const p5Wave = n ? wavesSorted[Math.floor(n * 0.05)] : 0;
  const p95Wave = n ? wavesSorted[Math.floor(n * 0.95)] : 0;

  const best = bestState ?? initialState;

  const materialsSpent: Budget = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const materialsRemaining: Budget = { 1: budget[1], 2: budget[2], 3: budget[3], 4: budget[4] };
  for (const tier of [1, 2, 3, 4] as const) {
    for (let uidx = 0; uidx < COSTS[tier].length; uidx += 1) {
      const initialLevel = initialState.levels[tier][uidx] ?? 0;
      const finalLevel = best.levels[tier][uidx] ?? 0;
      for (let level = initialLevel; level < finalLevel; level += 1) {
        const cost = Math.round(COSTS[tier][uidx] * 1.25 ** level);
        materialsSpent[tier] += cost;
        materialsRemaining[tier] -= cost;
      }
    }
  }

  const { playerStats, enemyStats } = (() => {
    const { player, enemy } = applyUpgrades(best.levels, prestige, best.gemLevels);
    return { playerStats: player, enemyStats: enemy };
  })();

  const bestCurrencyPerHourByTier =
    bandMode && bestTime > 0
      ? (() => {
          const mats = calculateMaterials(bestWave, playerStats);
          const scale = 3600 / bestTime;
          return { 1: mats.mat1 * scale, 2: mats.mat2 * scale, 3: mats.mat3 * scale, 4: mats.mat4 * scale };
        })()
      : undefined;

  const statistics: Record<string, number> = {
    mean_wave: meanWave,
    median_wave: medianWave,
    std_dev_wave: stdDevWave,
    min_wave: n ? Math.min(...waves) : 0,
    max_wave: n ? Math.max(...waves) : 0,
    p5_wave: p5Wave,
    p95_wave: p95Wave,
    mean_time: meanTime,
    median_time: medianTime,
    std_dev_time: stdDevTime,
    min_time: n ? Math.min(...times) : 0,
    max_time: n ? Math.max(...times) : 0,
  };

  return {
    bestState: best,
    bestWave,
    bestTime,
    materialsSpent,
    materialsRemaining,
    playerStats,
    enemyStats,
    allResults,
    statistics,
    ...(bandMode
      ? {
          bestWaveBand,
          bestCurrencyPerHour,
          ...(bestCurrencyPerHourByTier ? { bestCurrencyPerHourByTier } : {}),
          ...(waveBandStep > 0 ? { waveBandStep } : {}),
          ...(useReward ? { tieBreakByRewardMilestones: true } : {}),
        }
      : {}),
  };
}

