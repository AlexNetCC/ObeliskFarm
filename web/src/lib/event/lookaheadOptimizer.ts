import { COSTS, UPGRADE_SHORT_NAMES, getRewardBand } from "./constants";
import {
  canAllocateUpgrade,
  copyState,
  getMaxLevelWithCaps,
  isUpgradeUnlocked,
  type Budget,
  type UpgradeState,
} from "./optimizer";
import { applyUpgrades, calculateMaterials, runFullSimulation } from "./simulation";
import { mulberry32 } from "../rng";

const TIERS = [1, 2, 3, 4] as const;
type Tier = (typeof TIERS)[number];

export type LookaheadObjective = "balanced" | "maxWave" | "targetChance" | "currency";
export type LookaheadQuality = "standard" | "thorough";

export interface LookaheadPerformance {
  expectedWave: number;
  expectedRunSeconds: number;
  rewardBand: number;
  expectedRewardBand: number;
  targetWave: number;
  targetProbability: number;
  currencyPerHourByTier: Budget;
  totalCurrencyPerHour: number;
}

export interface LookaheadAction {
  atMinutes: number;
  waitMinutes: number;
  tier: Tier;
  upgradeIdx: number;
  upgradeName: string;
  cost: number;
  balanceBefore: number;
  balanceAfter: number;
}

export interface LookaheadStrategy {
  label: string;
  actions: LookaheadAction[];
  finalState: UpgradeState;
  finalBalance: Budget;
  performance: LookaheadPerformance;
  score: number;
}

export interface LookaheadResult {
  horizonMinutes: number;
  maxIdleWaitMinutes: number;
  objective: LookaheadObjective;
  quality: LookaheadQuality;
  currentPerformance: LookaheadPerformance;
  best: LookaheadStrategy;
  buyNow: LookaheadStrategy;
  waitOnly: LookaheadStrategy;
  alternatives: LookaheadStrategy[];
  evaluatedStates: number;
  recommendation: string;
  explanation: string[];
}

export interface LookaheadProgress {
  phase: "search" | "immediate" | "validate";
  depth: number;
  evaluatedStates: number;
  beamSize: number;
}

export type LookaheadProgressCallback = (progress: LookaheadProgress) => void;

export interface LookaheadArgs {
  currentBudget: Budget;
  prestige: number;
  initialState: UpgradeState;
  horizonMinutes?: number;
  maxIdleWaitMinutes?: number;
  targetWave?: number;
  objective?: LookaheadObjective;
  quality?: LookaheadQuality;
  seedBase?: number;
  progressCallback?: LookaheadProgressCallback | null;
}

type CandidateAction = {
  tier: Tier;
  idx: number;
  cost: number;
  waitMinutes: number;
  priority: number;
};

type SearchNode = {
  timeMinutes: number;
  state: UpgradeState;
  balance: Budget;
  performance: LookaheadPerformance;
  actions: LookaheadAction[];
  beamScore: number;
};

type QualityConfig = {
  beamWidth: number;
  candidateLimit: number;
  maxActions: number;
  searchRuns: number;
  validationRuns: number;
};

const QUALITY: Record<LookaheadQuality, QualityConfig> = {
  standard: {
    beamWidth: 16,
    candidateLimit: 16,
    maxActions: 11,
    searchRuns: 32,
    validationRuns: 180,
  },
  thorough: {
    beamWidth: 28,
    candidateLimit: 22,
    maxActions: 15,
    searchRuns: 56,
    validationRuns: 320,
  },
};

/**
 * Search-only priority. This does NOT alter the game model or final scoring;
 * it simply ensures strategically important / gating upgrades survive candidate truncation.
 */
const STRATEGIC_PRIORITY: Record<Tier, Record<number, number>> = {
  1: { 0: 65, 1: 92, 2: 122, 3: 105, 4: 118, 5: 35, 6: 104, 7: 108, 8: 150, 9: 116 },
  2: { 0: 96, 1: 124, 2: 138, 3: 124, 4: 108, 5: 112, 6: 150 },
  3: { 0: 62, 1: 122, 2: 30, 3: 120, 4: 108, 5: 115, 6: 155, 7: 148 },
  4: { 0: 136, 1: 105, 2: 132, 3: 125, 4: 112, 5: 116, 6: 118, 7: 150 },
};

function copyBudget(b: Budget): Budget {
  return { 1: b[1], 2: b[2], 3: b[3], 4: b[4] };
}

function sanitizeBudget(b: Budget): Budget {
  return {
    1: Math.max(0, Number.isFinite(b[1]) ? b[1] : 0),
    2: Math.max(0, Number.isFinite(b[2]) ? b[2] : 0),
    3: Math.max(0, Number.isFinite(b[3]) ? b[3] : 0),
    4: Math.max(0, Number.isFinite(b[4]) ? b[4] : 0),
  };
}

function stateKey(state: UpgradeState): string {
  return `${TIERS.map((tier) => state.levels[tier].join(",")).join("|")}#${state.gemLevels.join(",")}`;
}

function stableHash(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function distanceFromResult(row: [number, number, number]): number {
  return row[0] + 1 - row[1] * 0.2;
}

function evaluateState(
  state: UpgradeState,
  prestige: number,
  targetWave: number,
  runs: number,
  seed: number,
): LookaheadPerformance {
  const { player, enemy } = applyUpgrades(state.levels, prestige, state.gemLevels);
  const sim = runFullSimulation(player, enemy, Math.max(1, Math.trunc(runs)), mulberry32(seed >>> 0));
  const runSeconds = Math.max(1e-6, sim.avgTime);
  const mats = calculateMaterials(sim.avgWave, player);
  const scale = 3600 / runSeconds;
  const perTier: Budget = {
    1: mats.mat1 * scale,
    2: mats.mat2 * scale,
    3: mats.mat3 * scale,
    4: mats.mat4 * scale,
  };
  const distances = sim.results.map(distanceFromResult);
  const targetProbability = distances.length
    ? distances.filter((wave) => wave >= targetWave).length / distances.length
    : 0;
  const expectedRewardBand = distances.length
    ? distances.reduce((sum, wave) => sum + getRewardBand(wave), 0) / distances.length
    : 0;

  return {
    expectedWave: sim.avgWave,
    expectedRunSeconds: sim.avgTime,
    rewardBand: getRewardBand(sim.avgWave),
    expectedRewardBand,
    targetWave,
    targetProbability,
    currencyPerHourByTier: perTier,
    totalCurrencyPerHour: perTier[1] + perTier[2] + perTier[3] + perTier[4],
  };
}

function performanceScore(p: LookaheadPerformance, objective: LookaheadObjective): number {
  const income = Math.log1p(Math.max(0, p.totalCurrencyPerHour));
  switch (objective) {
    case "maxWave":
      return p.expectedWave * 100 + p.expectedRewardBand * 2 + income;
    case "targetChance":
      return p.targetProbability * 10000 + p.expectedWave * 10 + p.expectedRewardBand + income;
    case "currency":
      return income * 100 + p.expectedWave * 0.25 + p.expectedRewardBand * 0.05;
    case "balanced":
    default:
      // Wave remains the primary objective; reward progress + farming rate break close calls.
      return p.expectedWave * 10 + p.expectedRewardBand * 1.5 + income * 6;
  }
}

function balancePotential(balance: Budget): number {
  return TIERS.reduce((sum, tier) => sum + Math.log1p(Math.max(0, balance[tier])), 0) * 0.025;
}

function terminalScore(node: SearchNode, objective: LookaheadObjective): number {
  return performanceScore(node.performance, objective) + balancePotential(node.balance);
}

function accrue(balance: Budget, performance: LookaheadPerformance, minutes: number): Budget {
  const m = Math.max(0, minutes);
  return {
    1: balance[1] + (performance.currencyPerHourByTier[1] * m) / 60,
    2: balance[2] + (performance.currencyPerHourByTier[2] * m) / 60,
    3: balance[3] + (performance.currencyPerHourByTier[3] * m) / 60,
    4: balance[4] + (performance.currencyPerHourByTier[4] * m) / 60,
  };
}

function nextUpgradeCost(tier: Tier, idx: number, state: UpgradeState): number {
  const level = state.levels[tier][idx] ?? 0;
  return Math.round(COSTS[tier][idx] * 1.25 ** level);
}

function listCandidateActions(
  node: SearchNode,
  prestige: number,
  horizonMinutes: number,
  maxIdleWaitMinutes: number,
  candidateLimit: number,
): CandidateAction[] {
  const remainingMinutes = Math.max(0, horizonMinutes - node.timeMinutes);
  const allowedWait = Math.min(remainingMinutes, Math.max(0, maxIdleWaitMinutes));
  const all: CandidateAction[] = [];

  for (const tier of TIERS) {
    for (let idx = 0; idx < COSTS[tier].length; idx += 1) {
      if (!isUpgradeUnlocked(tier, idx, prestige)) continue;
      if (!canAllocateUpgrade(tier, idx, node.state)) continue;
      const level = node.state.levels[tier][idx] ?? 0;
      if (level >= getMaxLevelWithCaps(tier, idx, node.state)) continue;

      const cost = nextUpgradeCost(tier, idx, node.state);
      const deficit = Math.max(0, cost - node.balance[tier]);
      let waitMinutes = 0;
      if (deficit > 1e-6) {
        const ratePerMinute = node.performance.currencyPerHourByTier[tier] / 60;
        if (!(ratePerMinute > 0)) continue;
        waitMinutes = deficit / ratePerMinute;
      }
      if (waitMinutes > allowedWait + 1e-7) continue;
      all.push({
        tier,
        idx,
        cost,
        waitMinutes,
        priority: STRATEGIC_PRIORITY[tier]?.[idx] ?? 50,
      });
    }
  }

  all.sort((a, b) => {
    const aRank = a.waitMinutes * 1.15 - a.priority * 0.09;
    const bRank = b.waitMinutes * 1.15 - b.priority * 0.09;
    return aRank - bRank;
  });

  if (all.length <= candidateLimit) return all;
  const selected = all.slice(0, candidateLimit);
  // Never truncate the highest-value strategic waits (prestige, 5x, late HP/AS, etc.).
  for (const candidate of all) {
    if (candidate.priority < 140) continue;
    if (!selected.some((x) => x.tier === candidate.tier && x.idx === candidate.idx)) selected.push(candidate);
  }
  return selected;
}

function finalizeNode(node: SearchNode, horizonMinutes: number, objective: LookaheadObjective): SearchNode {
  const remaining = Math.max(0, horizonMinutes - node.timeMinutes);
  const finalBalance = accrue(node.balance, node.performance, remaining);
  const final: SearchNode = {
    ...node,
    timeMinutes: horizonMinutes,
    balance: finalBalance,
    beamScore: 0,
  };
  final.beamScore = terminalScore(final, objective);
  return final;
}

function strategyFromNode(label: string, node: SearchNode, horizonMinutes: number, objective: LookaheadObjective): LookaheadStrategy {
  const final = finalizeNode(node, horizonMinutes, objective);
  return {
    label,
    actions: final.actions,
    finalState: copyState(final.state),
    finalBalance: copyBudget(final.balance),
    performance: final.performance,
    score: final.beamScore,
  };
}

function dedupeBeam(nodes: SearchNode[], beamWidth: number): SearchNode[] {
  const byKey = new Map<string, SearchNode>();
  for (const node of nodes) {
    const key = `${stateKey(node.state)}@${Math.round(node.timeMinutes * 2) / 2}`;
    const prev = byKey.get(key);
    if (!prev || node.beamScore > prev.beamScore) byKey.set(key, node);
  }
  return Array.from(byKey.values())
    .sort((a, b) => b.beamScore - a.beamScore)
    .slice(0, beamWidth);
}

function firstActionKey(strategy: LookaheadStrategy): string {
  const a = strategy.actions[0];
  return a ? `${a.tier}:${a.upgradeIdx}:${Math.round(a.atMinutes)}` : "none";
}

function formatMinutes(minutes: number): string {
  const m = Math.max(0, minutes);
  if (m < 0.75) return "now";
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m - h * 60);
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

export function runLookaheadOptimizer(args: LookaheadArgs): LookaheadResult {
  const horizonMinutes = Math.max(5, Math.min(24 * 60, Number(args.horizonMinutes ?? 60)));
  const maxIdleWaitMinutes = Math.max(0, Math.min(horizonMinutes, Number(args.maxIdleWaitMinutes ?? Math.min(60, horizonMinutes))));
  const targetWave = Math.max(1, Math.trunc(args.targetWave ?? 250));
  const objective: LookaheadObjective = args.objective ?? "balanced";
  const quality: LookaheadQuality = args.quality ?? "standard";
  const cfg = QUALITY[quality];
  const currentBudget = sanitizeBudget(args.currentBudget);
  const prestige = Math.max(0, Math.trunc(args.prestige));
  const initialState = copyState(args.initialState);
  const seedBase = (args.seedBase ?? 0x51a7e123) >>> 0;
  const progressCallback = args.progressCallback ?? null;

  const cache = new Map<string, LookaheadPerformance>();
  let evaluatedStates = 0;
  const evalCached = (state: UpgradeState, runs = cfg.searchRuns): LookaheadPerformance => {
    const key = `${stateKey(state)}:${runs}`;
    const existing = cache.get(key);
    if (existing) return existing;
    const perf = evaluateState(state, prestige, targetWave, runs, seedBase ^ stableHash(stateKey(state)));
    cache.set(key, perf);
    evaluatedStates += 1;
    return perf;
  };

  const currentPerformance = evalCached(initialState);
  const initialNode: SearchNode = {
    timeMinutes: 0,
    state: initialState,
    balance: copyBudget(currentBudget),
    performance: currentPerformance,
    actions: [],
    beamScore: performanceScore(currentPerformance, objective) + balancePotential(currentBudget),
  };

  const runSearch = (maxWait: number, phase: "search" | "immediate"): SearchNode[] => {
    let beam: SearchNode[] = [initialNode];
    const terminals: SearchNode[] = [finalizeNode(initialNode, horizonMinutes, objective)];

    for (let depth = 0; depth < cfg.maxActions; depth += 1) {
      const children: SearchNode[] = [];
      for (const node of beam) {
        const candidates = listCandidateActions(node, prestige, horizonMinutes, maxWait, cfg.candidateLimit);
        for (const candidate of candidates) {
          const atMinutes = node.timeMinutes + candidate.waitMinutes;
          if (atMinutes > horizonMinutes + 1e-7) continue;
          const balanceBeforePurchase = accrue(node.balance, node.performance, candidate.waitMinutes);
          if (balanceBeforePurchase[candidate.tier] + 1e-6 < candidate.cost) continue;

          const nextBalance = copyBudget(balanceBeforePurchase);
          nextBalance[candidate.tier] = Math.max(0, nextBalance[candidate.tier] - candidate.cost);
          const nextState = copyState(node.state);
          nextState.levels[candidate.tier][candidate.idx] += 1;
          const nextPerformance = evalCached(nextState);
          const action: LookaheadAction = {
            atMinutes,
            waitMinutes: candidate.waitMinutes,
            tier: candidate.tier,
            upgradeIdx: candidate.idx,
            upgradeName: UPGRADE_SHORT_NAMES[candidate.tier][candidate.idx].replace(/\n/g, " / "),
            cost: candidate.cost,
            balanceBefore: balanceBeforePurchase[candidate.tier],
            balanceAfter: nextBalance[candidate.tier],
          };
          const timeRemaining = Math.max(0, horizonMinutes - atMinutes);
          const nextNode: SearchNode = {
            timeMinutes: atMinutes,
            state: nextState,
            balance: nextBalance,
            performance: nextPerformance,
            actions: [...node.actions, action],
            beamScore:
              performanceScore(nextPerformance, objective) +
              balancePotential(nextBalance) +
              (candidate.priority / 1000) * Math.min(1, timeRemaining / Math.max(1, horizonMinutes)),
          };
          children.push(nextNode);
          terminals.push(finalizeNode(nextNode, horizonMinutes, objective));
        }
      }

      progressCallback?.({ phase, depth: depth + 1, evaluatedStates, beamSize: children.length });
      if (!children.length) break;
      beam = dedupeBeam(children, cfg.beamWidth);
    }

    return terminals.sort((a, b) => b.beamScore - a.beamScore);
  };

  const lookaheadTerminals = runSearch(maxIdleWaitMinutes, "search");
  const immediateTerminals = runSearch(0, "immediate");

  const candidateNodes: SearchNode[] = [];
  const seen = new Set<string>();
  for (const node of [...lookaheadTerminals.slice(0, 12), ...immediateTerminals.slice(0, 4)]) {
    const key = `${stateKey(node.state)}:${node.actions.map((a) => `${a.tier}-${a.upgradeIdx}@${Math.round(a.atMinutes)}`).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidateNodes.push(node);
    if (candidateNodes.length >= 12) break;
  }

  // Re-evaluate finalists with a much larger sample before making the recommendation.
  const validated: SearchNode[] = candidateNodes.map((node, idx) => {
    progressCallback?.({ phase: "validate", depth: idx + 1, evaluatedStates, beamSize: candidateNodes.length });
    const perf = evaluateState(
      node.state,
      prestige,
      targetWave,
      cfg.validationRuns,
      (seedBase ^ 0x9e3779b9 ^ stableHash(stateKey(node.state))) >>> 0,
    );
    evaluatedStates += 1;
    const final = finalizeNode({ ...node, performance: perf }, horizonMinutes, objective);
    final.beamScore = terminalScore(final, objective);
    return final;
  });
  validated.sort((a, b) => b.beamScore - a.beamScore);

  const bestNode = validated[0] ?? lookaheadTerminals[0] ?? initialNode;
  const immediateNode = immediateTerminals[0] ?? initialNode;
  const waitNode = finalizeNode(initialNode, horizonMinutes, objective);

  // Validate comparison baselines with the same larger sample.
  const validateBaseline = (node: SearchNode, salt: number): SearchNode => {
    const perf = evaluateState(
      node.state,
      prestige,
      targetWave,
      cfg.validationRuns,
      (seedBase ^ salt ^ stableHash(stateKey(node.state))) >>> 0,
    );
    evaluatedStates += 1;
    return finalizeNode({ ...node, performance: perf }, horizonMinutes, objective);
  };

  const best = strategyFromNode("Optimized lookahead", bestNode, horizonMinutes, objective);
  const buyNow = strategyFromNode("Spend available currency now", validateBaseline(immediateNode, 0xa341316c), horizonMinutes, objective);
  const waitOnly = strategyFromNode("Buy nothing during horizon", validateBaseline(waitNode, 0xc8013ea4), horizonMinutes, objective);

  const alternatives: LookaheadStrategy[] = [];
  const usedFirstActions = new Set<string>([firstActionKey(best)]);
  for (const node of validated.slice(1)) {
    const strategy = strategyFromNode("Alternative", node, horizonMinutes, objective);
    const key = firstActionKey(strategy);
    if (usedFirstActions.has(key)) continue;
    usedFirstActions.add(key);
    alternatives.push(strategy);
    if (alternatives.length >= 3) break;
  }

  const first = best.actions[0];
  let recommendation = "Hold currency for now";
  if (first) {
    recommendation = first.waitMinutes >= 0.75
      ? `Wait about ${formatMinutes(first.waitMinutes)} for Tier ${first.tier} ${first.upgradeName}`
      : `Buy Tier ${first.tier} ${first.upgradeName} now`;
  }

  const waveDelta = best.performance.expectedWave - buyNow.performance.expectedWave;
  const currencyDeltaPct = buyNow.performance.totalCurrencyPerHour > 0
    ? ((best.performance.totalCurrencyPerHour / buyNow.performance.totalCurrencyPerHour) - 1) * 100
    : 0;
  const targetDeltaPts = (best.performance.targetProbability - buyNow.performance.targetProbability) * 100;
  const explanation = [
    `At ${formatMinutes(horizonMinutes)}, lookahead projects wave ${best.performance.expectedWave.toFixed(1)} versus ${buyNow.performance.expectedWave.toFixed(1)} for the best spend-now path (${waveDelta >= 0 ? "+" : ""}${waveDelta.toFixed(1)}).`,
    `Projected farming rate is ${currencyDeltaPct >= 0 ? "+" : ""}${currencyDeltaPct.toFixed(1)}% versus spend-now.`,
    `Target-wave chance changes by ${targetDeltaPts >= 0 ? "+" : ""}${targetDeltaPts.toFixed(1)} percentage points (target Wave ${targetWave}).`,
    "Income is recalculated after every hypothetical purchase, so speed, 5x-drop, prestige, and combat upgrades can change the timing of later purchases.",
  ];

  return {
    horizonMinutes,
    maxIdleWaitMinutes,
    objective,
    quality,
    currentPerformance,
    best,
    buyNow,
    waitOnly,
    alternatives,
    evaluatedStates,
    recommendation,
    explanation,
  };
}
