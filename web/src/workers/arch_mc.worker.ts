import {
  blockBreakdownSummary,
  fragmentSimsSummary,
  fragmentSimsSummaryWithVariance,
  stageSimsDetailed,
  stageSimsSummary,
  stageSimsSummaryWithVariance,
  MonteCarloArchaeologySimulator,
  type CardConfig,
} from "../lib/archaeology/mc/monteCarlo";
import { mulberry32 } from "../lib/archaeology/mc/prng";

type Msg =
  | { type: "stageSummary"; payload: Parameters<typeof stageSimsSummary>[0] }
  | { type: "stageSummaryWithVariance"; payload: Parameters<typeof stageSimsSummaryWithVariance>[0] }
  | { type: "fragmentSummary"; payload: Parameters<typeof fragmentSimsSummary>[0] }
  | { type: "fragmentSummaryWithVariance"; payload: Parameters<typeof fragmentSimsSummaryWithVariance>[0] }
  | { type: "stageDetailed"; payload: Parameters<typeof stageSimsDetailed>[0] }
  | { type: "blockBreakdown"; payload: Parameters<typeof blockBreakdownSummary>[0] }
  | {
      type: "stageLite";
      payload: {
        stats: any;
        starting_floor: number;
        n_sims: number;
        options: { use_crit: boolean; enrage_enabled: boolean; flurry_enabled: boolean; quake_enabled: boolean };
        cardCfg: CardConfig | null;
        seed: number;
        targetFrag?: string | null;
      };
    };

function runStageLite(payload: any) {
  // Lite variant to keep transfer sizes small.
  const rng = mulberry32((payload.seed ?? 0) >>> 0);
  const sim = new MonteCarloArchaeologySimulator(rng);
  const max_stage_samples: number[] = [];
  const floors_cleared_samples: number[] = [];
  const xp_per_run_samples: number[] = [];
  const total_fragments_samples: number[] = [];
  const run_duration_seconds_samples: number[] = [];
  const total_hits_samples: number[] = [];
  const target_frag_samples: number[] = [];
  const tfrag = payload.targetFrag ? String(payload.targetFrag) : null;
  const FRAG_TYPES = ["common", "rare", "epic", "legendary", "mythic"] as const;
  const run_fragments_by_type: Record<string, number[]> = {};
  for (const k of FRAG_TYPES) run_fragments_by_type[k] = [];
  const stamina_at_stage_sum: Record<number, number> = {};
  const stamina_at_stage_sum_sq: Record<number, number> = {};
  const stamina_at_stage_count: Record<number, number> = {};
  const stamina_at_stage_by_run: number[][] = [];

  for (let i = 0; i < Math.max(0, Math.trunc(payload.n_sims)); i += 1) {
    const r: any = sim.simulateRun(payload.stats, payload.starting_floor, { ...payload.options, return_block_metrics: false }, payload.cardCfg);
    const maxStage = Number(r.max_stage_reached ?? 0);
    max_stage_samples.push(maxStage);
    floors_cleared_samples.push(Number(r.floors_cleared ?? 0));
    xp_per_run_samples.push(Number(r.xp_per_run ?? 0));
    total_fragments_samples.push(Number(r.total_fragments ?? 0));
    run_duration_seconds_samples.push(Number(r.run_duration_seconds ?? 1));
    total_hits_samples.push(Number(r.total_hits ?? 0));
    if (tfrag) target_frag_samples.push(Number(r.fragments?.[tfrag] ?? 0));
    for (const k of FRAG_TYPES) run_fragments_by_type[k].push(Number(r.fragments?.[k] ?? 0));
    const stam: Record<number, number> | undefined = r.stamina_at_end_of_stage;
    if (stam && typeof stam === "object") {
      for (const [stageStr, val] of Object.entries(stam)) {
        const stage = Math.trunc(Number(stageStr));
        const v = Number(val);
        if (!Number.isFinite(stage) || !Number.isFinite(v)) continue;
        stamina_at_stage_sum[stage] = (stamina_at_stage_sum[stage] ?? 0) + v;
        stamina_at_stage_sum_sq[stage] = (stamina_at_stage_sum_sq[stage] ?? 0) + v * v;
        stamina_at_stage_count[stage] = (stamina_at_stage_count[stage] ?? 0) + 1;
      }
      const row: number[] = [];
      for (let s = 1; s <= maxStage; s += 1) {
        row.push(Number((stam as Record<number, number>)[s] ?? 0));
      }
      stamina_at_stage_by_run.push(row);
    } else {
      stamina_at_stage_by_run.push([]);
    }
  }

  return {
    max_stage_samples,
    floors_cleared_samples,
    xp_per_run_samples,
    total_fragments_samples,
    run_duration_seconds_samples,
    total_hits_samples,
    target_frag_samples: tfrag ? target_frag_samples : null,
    run_fragments_by_type,
    stamina_at_stage_sum: Object.keys(stamina_at_stage_sum).length > 0 ? stamina_at_stage_sum : undefined,
    stamina_at_stage_sum_sq: Object.keys(stamina_at_stage_sum_sq).length > 0 ? stamina_at_stage_sum_sq : undefined,
    stamina_at_stage_count: Object.keys(stamina_at_stage_count).length > 0 ? stamina_at_stage_count : undefined,
    stamina_at_stage_by_run: stamina_at_stage_by_run.length > 0 ? stamina_at_stage_by_run : undefined,
  };
}

self.onmessage = async (ev: MessageEvent<Msg>) => {
  const msg = ev.data;
  try {
    if (msg.type === "stageSummary") {
      (self as unknown as Worker).postMessage({ type: "ok", payload: stageSimsSummary(msg.payload) });
      return;
    }
    if (msg.type === "stageSummaryWithVariance") {
      (self as unknown as Worker).postMessage({ type: "ok", payload: stageSimsSummaryWithVariance(msg.payload) });
      return;
    }
    if (msg.type === "fragmentSummary") {
      (self as unknown as Worker).postMessage({ type: "ok", payload: fragmentSimsSummary(msg.payload) });
      return;
    }
    if (msg.type === "fragmentSummaryWithVariance") {
      (self as unknown as Worker).postMessage({ type: "ok", payload: fragmentSimsSummaryWithVariance(msg.payload) });
      return;
    }
    if (msg.type === "stageDetailed") {
      (self as unknown as Worker).postMessage({ type: "ok", payload: stageSimsDetailed(msg.payload) });
      return;
    }
    if (msg.type === "blockBreakdown") {
      (self as unknown as Worker).postMessage({ type: "ok", payload: blockBreakdownSummary(msg.payload) });
      return;
    }
    if (msg.type === "stageLite") {
      const r = runStageLite(msg.payload);
      (self as unknown as Worker).postMessage({ type: "ok", payload: r });
      return;
    }
  } catch (e) {
    (self as unknown as Worker).postMessage({ type: "error", payload: { message: e instanceof Error ? e.message : String(e) } });
  }
};

