import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import type { Budget, UpgradeState } from "./lib/event/optimizer";
import { createEmptyState } from "./lib/event/optimizer";
import type {
  LookaheadObjective,
  LookaheadProgress,
  LookaheadQuality,
  LookaheadResult,
  LookaheadStrategy,
} from "./lib/event/lookaheadOptimizer";

const STORAGE_KEY = "obeliskfarm:web:event_budget_save.json:v1";

type SavedStateV1 = {
  prestige?: number;
  upgrade_levels?: Record<string, number[]>;
  gem_levels?: number[];
  targetWave?: number;
};

function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtMinutes(minutes: number): string {
  if (minutes < 0.75) return "Now";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function readSavedState(): { prestige: number; targetWave: number; upgrades: UpgradeState } {
  const empty = createEmptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { prestige: 0, targetWave: 250, upgrades: empty };
    const saved = JSON.parse(raw) as SavedStateV1;
    if (saved.upgrade_levels) {
      for (const tier of [1, 2, 3, 4] as const) {
        const arr = saved.upgrade_levels[String(tier)];
        if (Array.isArray(arr) && arr.length === empty.levels[tier].length) {
          empty.levels[tier] = arr.map((x) => Math.max(0, Math.trunc(Number(x) || 0)));
        }
      }
    }
    if (Array.isArray(saved.gem_levels) && saved.gem_levels.length === 4) {
      empty.gemLevels = saved.gem_levels.map((x) => Math.max(0, Math.trunc(Number(x) || 0))) as [number, number, number, number];
    }
    return {
      prestige: Math.max(0, Math.trunc(Number(saved.prestige) || 0)),
      targetWave: Math.max(1, Math.trunc(Number(saved.targetWave) || 250)),
      upgrades: empty,
    };
  } catch {
    return { prestige: 0, targetWave: 250, upgrades: empty };
  }
}

function readBudgetInputs(): Budget {
  const rows = Array.from(document.querySelectorAll(".budgetInputs .budgetRow input")) as HTMLInputElement[];
  const values = rows.slice(0, 4).map((input) => {
    const raw = input.value.trim().replaceAll(",", "").replaceAll(" ", "");
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  });
  return { 1: values[0] ?? 0, 2: values[1] ?? 0, 3: values[2] ?? 0, 4: values[3] ?? 0 };
}

function StrategySummary({ strategy, title }: { strategy: LookaheadStrategy; title: string }) {
  const p = strategy.performance;
  return (
    <div className="lookaheadCompareCard">
      <div className="lookaheadCompareTitle">{title}</div>
      <div className="lookaheadMetrics">
        <span>Wave <strong>{p.expectedWave.toFixed(1)}</strong></span>
        <span>Target <strong>{(p.targetProbability * 100).toFixed(1)}%</strong></span>
        <span>Income <strong>{fmt(p.totalCurrencyPerHour)}/h</strong></span>
      </div>
    </div>
  );
}

function LookaheadCompanion() {
  const [eventVisible, setEventVisible] = useState(false);
  const [open, setOpen] = useState(true);
  const [horizonMinutes, setHorizonMinutes] = useState(60);
  const [maxIdleWaitMinutes, setMaxIdleWaitMinutes] = useState(60);
  const [objective, setObjective] = useState<LookaheadObjective>("balanced");
  const [quality, setQuality] = useState<LookaheadQuality>("standard");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<LookaheadProgress | null>(null);
  const [result, setResult] = useState<LookaheadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const detect = () => setEventVisible(Boolean(document.querySelector(".eventSimTop")));
    detect();
    const observer = new MutationObserver(detect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  const presets = useMemo(() => [15, 30, 60, 120, 240], []);

  function run() {
    const saved = readSavedState();
    const budget = readBudgetInputs();
    setError(null);
    setResult(null);
    setProgress(null);
    setRunning(true);

    workerRef.current?.terminate();
    const worker = new Worker(new URL("./workers/event_lookahead.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (ev: MessageEvent<any>) => {
      const msg = ev.data;
      if (msg?.type === "progress") {
        setProgress(msg.payload as LookaheadProgress);
        return;
      }
      if (msg?.type === "done") {
        setResult(msg.payload as LookaheadResult);
        setRunning(false);
        setProgress(null);
        return;
      }
      if (msg?.type === "cancelled") {
        setRunning(false);
        setProgress(null);
        return;
      }
      if (msg?.type === "error") {
        setError(msg.payload?.message ?? "Lookahead optimizer failed.");
        setRunning(false);
        setProgress(null);
      }
    };
    worker.onerror = (ev) => {
      setError(ev.message || "Lookahead worker failed.");
      setRunning(false);
    };
    worker.postMessage({
      type: "start",
      payload: {
        currentBudget: budget,
        prestige: saved.prestige,
        initialState: saved.upgrades,
        horizonMinutes,
        maxIdleWaitMinutes: Math.min(maxIdleWaitMinutes, horizonMinutes),
        targetWave: saved.targetWave,
        objective,
        quality,
        seedBase: 0x51a7e123,
      },
    });
  }

  if (!eventVisible) return null;

  if (!open) {
    return (
      <button className="lookaheadFab" type="button" onClick={() => setOpen(true)} title="Open Strategy Lookahead">
        ⏱ Strategy
      </button>
    );
  }

  const first = result?.best.actions[0] ?? null;

  return (
    <aside className="lookaheadCompanion" aria-label="Event Strategy Lookahead">
      <div className="lookaheadHeader">
        <div>
          <div className="lookaheadEyebrow">NEW • TEMPORAL OPTIMIZER</div>
          <div className="lookaheadTitle">Strategy Lookahead</div>
          <div className="lookaheadSubtitle">Buy now vs. wait vs. sequential purchases</div>
        </div>
        <button type="button" className="lookaheadClose" onClick={() => setOpen(false)} aria-label="Minimize Strategy Lookahead">×</button>
      </div>

      <div className="lookaheadControls">
        <div className="lookaheadControlLabel">Look ahead</div>
        <div className="lookaheadPresetRow">
          {presets.map((m) => (
            <button
              type="button"
              key={m}
              className={horizonMinutes === m ? "lookaheadChip lookaheadChipActive" : "lookaheadChip"}
              onClick={() => {
                setHorizonMinutes(m);
                setMaxIdleWaitMinutes((v) => Math.min(v, m));
              }}
            >
              {fmtMinutes(m)}
            </button>
          ))}
        </div>
        <div className="lookaheadInlineControls">
          <label>
            Custom min
            <input type="number" min={5} max={1440} value={horizonMinutes} onChange={(e) => setHorizonMinutes(Math.max(5, Math.min(1440, Number(e.target.value) || 60)))} />
          </label>
          <label>
            Max idle wait
            <input type="number" min={0} max={horizonMinutes} value={maxIdleWaitMinutes} onChange={(e) => setMaxIdleWaitMinutes(Math.max(0, Math.min(horizonMinutes, Number(e.target.value) || 0)))} />
          </label>
        </div>
        <div className="lookaheadInlineControls">
          <label>
            Goal
            <select value={objective} onChange={(e) => setObjective(e.target.value as LookaheadObjective)}>
              <option value="balanced">Balanced progression</option>
              <option value="maxWave">Maximize wave</option>
              <option value="targetChance">Reach target wave</option>
              <option value="currency">Maximize currency/h</option>
            </select>
          </label>
          <label>
            Search
            <select value={quality} onChange={(e) => setQuality(e.target.value as LookaheadQuality)}>
              <option value="standard">Standard</option>
              <option value="thorough">Thorough</option>
            </select>
          </label>
        </div>
      </div>

      <div className="lookaheadButtons">
        <button type="button" className="lookaheadRun" onClick={run} disabled={running}>
          {running ? "Simulating strategies…" : "Run Strategy Lookahead"}
        </button>
        {running ? (
          <button
            type="button"
            className="lookaheadCancel"
            onClick={() => {
              workerRef.current?.postMessage({ type: "cancel" });
              setRunning(false);
            }}
          >
            Cancel
          </button>
        ) : null}
      </div>

      {running && progress ? (
        <div className="lookaheadProgress">
          {progress.phase === "validate" ? "Validating finalists" : progress.phase === "immediate" ? "Comparing spend-now paths" : "Searching buy/wait paths"}
          <span>{fmt(progress.evaluatedStates)} states</span>
        </div>
      ) : null}

      {error ? <div className="lookaheadError">{error}</div> : null}

      {result ? (
        <div className="lookaheadResult">
          <div className={first && first.waitMinutes >= 0.75 ? "lookaheadRecommendation lookaheadWait" : "lookaheadRecommendation lookaheadBuy"}>
            <div className="lookaheadRecLabel">RECOMMENDED NOW</div>
            <div className="lookaheadRecText">{result.recommendation}</div>
            {first ? (
              <div className="lookaheadRecMeta">
                Cost {fmt(first.cost)} • projected purchase at {fmtMinutes(first.atMinutes)}
              </div>
            ) : null}
          </div>

          <div className="lookaheadCompareGrid">
            <StrategySummary strategy={result.best} title="Lookahead" />
            <StrategySummary strategy={result.buyNow} title="Spend now" />
            <StrategySummary strategy={result.waitOnly} title="Wait only" />
          </div>

          <div className="lookaheadSectionTitle">Recommended timeline</div>
          {result.best.actions.length ? (
            <div className="lookaheadTimeline">
              {result.best.actions.map((action, i) => (
                <div className="lookaheadAction" key={`${action.tier}-${action.upgradeIdx}-${i}`}>
                  <div className="lookaheadActionTime">{fmtMinutes(action.atMinutes)}</div>
                  <div className="lookaheadActionBody">
                    <strong>T{action.tier} {action.upgradeName}</strong>
                    <span>{fmt(action.cost)} currency{action.waitMinutes >= 0.75 ? ` • wait ${fmtMinutes(action.waitMinutes)}` : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="lookaheadNote">No purchase during this horizon beats continuing to farm with the current build.</div>
          )}

          <details className="lookaheadDetails">
            <summary>Why?</summary>
            {result.explanation.map((line, i) => <div key={i}>{line}</div>)}
            <div>Evaluated {fmt(result.evaluatedStates)} simulated states. Income is recalculated after every purchase.</div>
          </details>

          {result.alternatives.length ? (
            <details className="lookaheadDetails">
              <summary>Alternative first moves</summary>
              {result.alternatives.map((alt, i) => {
                const action = alt.actions[0];
                return (
                  <div key={i} className="lookaheadAlt">
                    <strong>{action ? `${fmtMinutes(action.atMinutes)} • T${action.tier} ${action.upgradeName}` : "Wait"}</strong>
                    <span>Wave {alt.performance.expectedWave.toFixed(1)} • {(alt.performance.targetProbability * 100).toFixed(1)}% target</span>
                  </div>
                );
              })}
            </details>
          ) : null}
        </div>
      ) : (
        <div className="lookaheadNote">
          Uses your current Event upgrade save plus the live Tier 1–4 currency boxes. It does not change your saved build or spend points.
        </div>
      )}
    </aside>
  );
}

const mount = document.getElementById("lookahead-root");
if (mount) {
  ReactDOM.createRoot(mount).render(
    <React.StrictMode>
      <LookaheadCompanion />
    </React.StrictMode>,
  );
}
