import { runLookaheadOptimizer } from "../lib/event/lookaheadOptimizer";
import type { Budget, UpgradeState } from "../lib/event/optimizer";
import type { LookaheadObjective, LookaheadQuality } from "../lib/event/lookaheadOptimizer";

type StartMessage = {
  type: "start";
  payload: {
    currentBudget: Budget;
    prestige: number;
    initialState: UpgradeState;
    horizonMinutes: number;
    maxIdleWaitMinutes: number;
    targetWave: number;
    objective: LookaheadObjective;
    quality: LookaheadQuality;
    seedBase?: number;
  };
};

type CancelMessage = { type: "cancel" };
type InMessage = StartMessage | CancelMessage;

let cancelled = false;

self.onmessage = (ev: MessageEvent<InMessage>) => {
  const msg = ev.data;
  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }
  if (msg.type !== "start") return;
  cancelled = false;

  try {
    const result = runLookaheadOptimizer({
      ...msg.payload,
      progressCallback: (progress) => {
        if (cancelled) throw new Error("cancelled");
        (self as unknown as Worker).postMessage({ type: "progress", payload: progress });
      },
    });
    if (cancelled) throw new Error("cancelled");
    (self as unknown as Worker).postMessage({ type: "done", payload: result });
  } catch (e) {
    if (String(e).includes("cancelled")) {
      (self as unknown as Worker).postMessage({ type: "cancelled" });
      return;
    }
    (self as unknown as Worker).postMessage({
      type: "error",
      payload: { message: e instanceof Error ? e.message : String(e) },
    });
  }
};
