import { useEffect, useMemo, useRef, useState } from "react";
import { ExecutionBackendPanel } from "./components/ExecutionBackendPanel";
import { ExecutionJobsPanel } from "./components/ExecutionJobsPanel";
import { HeaderBar } from "./components/HeaderBar";
import { TargetDomainWidget } from "./components/TargetDomainWidget";
import { DepthSlider } from "./components/DepthSlider";
import { LearningRateSlider } from "./components/LearningRateSlider";
import { VqeScheduleControls, type VqeDecayConfig } from "./components/VqeScheduleControls";
import { VqeEarlyStoppingControls, type VqeEarlyStopConfig } from "./components/VqeEarlyStoppingControls";
import { ParameterList } from "./components/ParameterList";
import { ActionButtons } from "./components/ActionButtons";
import { CircuitVisualizer } from "./components/CircuitVisualizer";
import { EnergyChart } from "./components/EnergyChart";
import { type MoleculeKey } from "./data/molecules";
import {
  buildQaoaExecutionCircuit,
  buildVqeExecutionCircuit,
  computeQaoaObjectiveGradients,
  computeVqeObjectiveGradients,
  evaluateQaoaCost,
  evaluateVqeEnergy,
} from "./lib/algorithms";
import { loadBackendPreferences, saveBackendPreferences, type BackendPreferences } from "./lib/backendPreferences";
import { getBackendTargetDescriptor } from "./lib/backendTargets";
import { buildQaoaCircuit, buildVqeCircuit } from "./lib/circuitBuilders";
import {
  loadExecutionJobs,
  pollExecutionJobs,
  retryExecutionJob,
  saveExecutionJobs,
  submitSamplingExecutionJob,
  type ExecutionJobRecord,
} from "./lib/executionJobs";
import {
  getProviderAuthConfigurationStatus,
  loadProviderSessionCredentials,
  resolveProviderAuthForTarget,
  saveProviderSessionCredentials,
  type ProviderSessionCredentials,
} from "./lib/providerAuth";
import {
  edgeKey,
  filterEdgesForNodeCount,
  makeDefaultBetas,
  makeDefaultGammas,
  makeDefaultThetas,
  parseAndValidateEdge,
  resizeArray,
} from "./lib/utils";
import type { Algorithm, CircuitMode } from "./types";

type LiveState = {
  algorithm: Algorithm;
  depth: number;
  gammas: number[];
  betas: number[];
  thetas: number[];
  nodeCount: number;
  edges: string[];
  molecule: MoleculeKey;
  learningRates: Record<Algorithm, number>;
  vqeDecay: VqeDecayConfig;
  vqeEarlyStop: VqeEarlyStopConfig;
  iteration: number;
};

type SampledOutcome = {
  bitstring: string;
  count: number;
  probability: number;
};

type SampledMetricSummary = {
  estimate: number;
  totalShotsUsed: number;
};

const MAX_RENDERED_OUTCOMES = 8;
const SHOT_PRESETS = [64, 256, 1024] as const;

const getEffectiveLearningRate = (
  algorithm: Algorithm,
  baseLearningRate: number,
  iteration: number,
  vqeDecay: VqeDecayConfig,
): number => {
  if (algorithm !== "vqe" || !vqeDecay.enabled) return baseLearningRate;
  const minLearningRate = Math.min(vqeDecay.minLearningRate, baseLearningRate);
  if (vqeDecay.mode === "exponential") {
    return Math.max(minLearningRate, baseLearningRate * Math.pow(vqeDecay.expGamma, iteration));
  }
  const decaySteps = Math.floor(iteration / Math.max(1, vqeDecay.stepEvery));
  return Math.max(minLearningRate, baseLearningRate * Math.pow(vqeDecay.stepFactor, decaySteps));
};

const clampVqeDecayConfig = (config: VqeDecayConfig, baseLearningRate: number): VqeDecayConfig => ({
  ...config,
  minLearningRate: Math.min(config.minLearningRate, baseLearningRate),
});

const summarizeBitstrings = (bitstrings: string[]): SampledOutcome[] => {
  const counts = new Map<string, number>();
  for (const bitstring of bitstrings) {
    counts.set(bitstring, (counts.get(bitstring) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([bitstring, count]) => ({
      bitstring,
      count,
      probability: count / bitstrings.length,
    }))
    .sort((a, b) => b.count - a.count || a.bitstring.localeCompare(b.bitstring));
};

export default function App(): JSX.Element {
  const [algorithm, setAlgorithm] = useState<Algorithm>("qaoa");
  const [circuitMode, setCircuitMode] = useState<CircuitMode>("logical");
  const [backendPreferences, setBackendPreferences] = useState<BackendPreferences>(() => loadBackendPreferences());
  const [providerSessionCredentials, setProviderSessionCredentials] = useState<ProviderSessionCredentials>(() =>
    loadProviderSessionCredentials(),
  );
  const [executionJobs, setExecutionJobs] = useState<ExecutionJobRecord[]>(() => loadExecutionJobs());

  const [depth, setDepth] = useState<number>(2);
  const [gammas, setGammas] = useState<number[]>(() => makeDefaultGammas(2));
  const [betas, setBetas] = useState<number[]>(() => makeDefaultBetas(2));
  const [thetas, setThetas] = useState<number[]>(() => makeDefaultThetas(2));

  const [nodeCount, setNodeCount] = useState<number>(4);
  const [edges, setEdges] = useState<string[]>(["0-1", "1-2", "2-3", "3-0"]);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);

  const [molecule, setMolecule] = useState<MoleculeKey>("H2_0.74");

  const [running, setRunning] = useState<boolean>(false);
  const [iteration, setIteration] = useState<number>(0);
  const [costHistory, setCostHistory] = useState<number[]>([]);
  const [learningRates, setLearningRates] = useState<Record<Algorithm, number>>({
    qaoa: 0.05,
    vqe: 0.02,
  });
  const [vqeDecay, setVqeDecay] = useState<VqeDecayConfig>({
    enabled: true,
    mode: "exponential",
    minLearningRate: 0.004,
    expGamma: 0.992,
    stepEvery: 20,
    stepFactor: 0.8,
  });
  const [vqeEarlyStop, setVqeEarlyStop] = useState<VqeEarlyStopConfig>({
    enabled: true,
    deltaThreshold: 0.0005,
    patience: 24,
    minIterations: 50,
  });
  const [stopReason, setStopReason] = useState<"converged" | null>(null);
  const [measurementShots, setMeasurementShots] = useState<number>(256);
  const [sampledBitstrings, setSampledBitstrings] = useState<string[]>([]);
  const [sampledMetric, setSampledMetric] = useState<SampledMetricSummary | null>(null);
  const [samplingError, setSamplingError] = useState<string | null>(null);
  const [samplingNotice, setSamplingNotice] = useState<string | null>(null);
  const vqeStallRef = useRef<number>(0);
  const effectiveEdges = useMemo(() => filterEdgesForNodeCount(edges, nodeCount), [edges, nodeCount]);
  const selectedExecutionTargetDescriptor = useMemo(
    () => getBackendTargetDescriptor(backendPreferences.executionTarget),
    [backendPreferences.executionTarget],
  );
  const selectedExecutionTargetAuth = useMemo(
    () => resolveProviderAuthForTarget(backendPreferences.executionTarget, backendPreferences, providerSessionCredentials),
    [backendPreferences, providerSessionCredentials],
  );
  const selectedExecutionTargetAuthStatus = useMemo(
    () => getProviderAuthConfigurationStatus(selectedExecutionTargetAuth),
    [selectedExecutionTargetAuth],
  );

  const currentMetric = useMemo(() => {
    if (algorithm === "qaoa") {
      return evaluateQaoaCost(nodeCount, effectiveEdges, gammas, betas);
    }
    return evaluateVqeEnergy(thetas, molecule);
  }, [algorithm, betas, effectiveEdges, gammas, molecule, nodeCount, thetas]);

  const sampledOutcomeSummary = useMemo(() => summarizeBitstrings(sampledBitstrings), [sampledBitstrings]);
  const sampledMetricDelta = sampledMetric ? sampledMetric.estimate - currentMetric : null;
  const sampledRelativeError =
    sampledMetricDelta !== null && Math.abs(currentMetric) > 1e-9
      ? (Math.abs(sampledMetricDelta) / Math.abs(currentMetric)) * 100
      : null;

  useEffect(() => {
    setRunning(false);
    setIteration(0);
    setCostHistory([]);
    setStopReason(null);
    vqeStallRef.current = 0;
  }, [algorithm]);

  useEffect(() => {
    setGammas((prev) => resizeArray(prev, depth, (i) => 0.7 / (i + 1)));
    setBetas((prev) => resizeArray(prev, depth, (i) => 0.35 / (i + 1)));
    setThetas((prev) => resizeArray(prev, depth * 2, (i) => 0.25 / (i + 1)));
    setRunning(false);
    setIteration(0);
    setCostHistory([]);
    setStopReason(null);
    vqeStallRef.current = 0;
  }, [depth]);

  useEffect(() => {
    setEdges((prev) => filterEdgesForNodeCount(prev, nodeCount));
    setSelectedNode((prev) => (prev !== null && prev >= nodeCount ? null : prev));
    setIteration(0);
    setCostHistory([]);
    setStopReason(null);
    vqeStallRef.current = 0;
  }, [nodeCount]);

  useEffect(() => {
    if (!running && iteration === 0) {
      setCostHistory([currentMetric]);
    }
  }, [currentMetric, iteration, running]);

  useEffect(() => {
    setSampledBitstrings([]);
    setSampledMetric(null);
    setSamplingError(null);
    setSamplingNotice(null);
  }, [algorithm, betas, effectiveEdges, gammas, measurementShots, molecule, nodeCount, thetas]);

  useEffect(() => {
    saveBackendPreferences(backendPreferences);
  }, [backendPreferences]);

  useEffect(() => {
    saveProviderSessionCredentials(providerSessionCredentials);
  }, [providerSessionCredentials]);

  useEffect(() => {
    saveExecutionJobs(executionJobs);
  }, [executionJobs]);

  const liveRef = useRef<LiveState>({
    algorithm,
    depth,
    gammas,
    betas,
    thetas,
    nodeCount,
    edges: effectiveEdges,
    molecule,
    learningRates,
    vqeDecay,
    vqeEarlyStop,
    iteration,
  });

  liveRef.current = {
    algorithm,
    depth,
    gammas,
    betas,
    thetas,
    nodeCount,
    edges: effectiveEdges,
    molecule,
    learningRates,
    vqeDecay,
    vqeEarlyStop,
    iteration,
  };

  useEffect(() => {
    if (!running) return undefined;

    const timer = setInterval(() => {
      const snapshot = liveRef.current;
      const baseLr = snapshot.learningRates[snapshot.algorithm];
      const lr = getEffectiveLearningRate(snapshot.algorithm, baseLr, snapshot.iteration, snapshot.vqeDecay);
      const nextIteration = snapshot.iteration + 1;

      if (snapshot.algorithm === "qaoa") {
        vqeStallRef.current = 0;
        const d = snapshot.depth;
        const currentGammas = Array.from({ length: d }, (_, i) => snapshot.gammas[i] ?? 0);
        const currentBetas = Array.from({ length: d }, (_, i) => snapshot.betas[i] ?? 0);
        const { gammaGrads, betaGrads } = computeQaoaObjectiveGradients(
          snapshot.nodeCount,
          snapshot.edges,
          currentGammas,
          currentBetas,
        );
        const nextGammas = currentGammas.map((p, i) => p - lr * (gammaGrads[i] ?? 0));
        const nextBetas = currentBetas.map((p, i) => p - lr * (betaGrads[i] ?? 0));

        setGammas(nextGammas);
        setBetas(nextBetas);

        const metric = evaluateQaoaCost(snapshot.nodeCount, snapshot.edges, nextGammas, nextBetas);
        setCostHistory((prev) => [...prev, metric].slice(-320));
      } else {
        const d = snapshot.depth;
        const currentThetas = Array.from({ length: d * 2 }, (_, i) => snapshot.thetas[i] ?? 0);
        const currentMetricValue = evaluateVqeEnergy(currentThetas, snapshot.molecule);
        const grads = computeVqeObjectiveGradients(currentThetas, snapshot.molecule);
        const nextThetas = currentThetas.map((p, i) => p - lr * grads[i]);
        setThetas(nextThetas);

        const metric = evaluateVqeEnergy(nextThetas, snapshot.molecule);
        setCostHistory((prev) => [...prev, metric].slice(-320));

        if (snapshot.vqeEarlyStop.enabled && nextIteration >= snapshot.vqeEarlyStop.minIterations) {
          const delta = Math.abs(metric - currentMetricValue);
          if (delta < snapshot.vqeEarlyStop.deltaThreshold) {
            vqeStallRef.current += 1;
          } else {
            vqeStallRef.current = 0;
          }

          if (vqeStallRef.current >= snapshot.vqeEarlyStop.patience) {
            setRunning(false);
            setStopReason("converged");
          }
        } else {
          vqeStallRef.current = 0;
        }
      }

      setIteration((prev) => prev + 1);
    }, 150);

    return () => clearInterval(timer);
  }, [running]);

  const circuitColumns = useMemo(() => {
    if (algorithm === "qaoa") {
      return buildQaoaCircuit(circuitMode, nodeCount, effectiveEdges, gammas, betas);
    }
    return buildVqeCircuit(circuitMode, thetas);
  }, [algorithm, betas, circuitMode, effectiveEdges, gammas, nodeCount, thetas]);

  const currentExecutableCircuit = useMemo(() => {
    if (algorithm === "qaoa") {
      const edgePairs = effectiveEdges.map((edge) => parseAndValidateEdge(edge, nodeCount));
      return buildQaoaExecutionCircuit(nodeCount, edgePairs, gammas, betas);
    }
    return buildVqeExecutionCircuit(thetas);
  }, [algorithm, betas, effectiveEdges, gammas, nodeCount, thetas]);

  const qubitCount = algorithm === "qaoa" ? nodeCount : 2;
  const effectiveLearningRate = getEffectiveLearningRate(
    algorithm,
    learningRates[algorithm],
    iteration,
    vqeDecay,
  );

  const graphPositions = useMemo(
    () =>
      Array.from({ length: nodeCount }, (_, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / nodeCount;
        return {
          x: 128 + 88 * Math.cos(angle),
          y: 128 + 88 * Math.sin(angle),
        };
      }),
    [nodeCount],
  );

  const handleNodeClick = (node: number) => {
    if (running) return;
    if (selectedNode === null) {
      setSelectedNode(node);
      return;
    }
    if (selectedNode === node) {
      setSelectedNode(null);
      return;
    }

    const key = edgeKey(selectedNode, node);
    setEdges((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    setSelectedNode(null);
    setIteration(0);
    setCostHistory([]);
    setStopReason(null);
    vqeStallRef.current = 0;
  };

  const handleAddNode = () => {
    if (running) return;
    setNodeCount((n) => Math.min(8, n + 1));
  };

  const handleRemoveNode = () => {
    if (running) return;
    setNodeCount((n) => Math.max(2, n - 1));
  };

  const resetSimulation = () => {
    setRunning(false);
    setStopReason(null);
    vqeStallRef.current = 0;

    if (algorithm === "qaoa") {
      const g = makeDefaultGammas(depth);
      const b = makeDefaultBetas(depth);
      setGammas(g);
      setBetas(b);
      setCostHistory([evaluateQaoaCost(nodeCount, effectiveEdges, g, b)]);
    } else {
      const t = makeDefaultThetas(depth);
      setThetas(t);
      setCostHistory([evaluateVqeEnergy(t, molecule)]);
    }

    setIteration(0);
  };

  const handleSampleBitstrings = () => {
    if (running) return;

    try {
      const job =
        algorithm === "qaoa"
          ? submitSamplingExecutionJob({
              targetId: backendPreferences.executionTarget,
              circuit: currentExecutableCircuit,
              algorithm: "qaoa",
              shots: measurementShots,
              nodeCount,
              edges: effectiveEdges,
              gammas,
              betas,
            }, selectedExecutionTargetAuth)
          : submitSamplingExecutionJob({
              targetId: backendPreferences.executionTarget,
              circuit: currentExecutableCircuit,
              algorithm: "vqe",
              shots: measurementShots,
              thetas,
              molecule,
            }, selectedExecutionTargetAuth);

      setExecutionJobs((prev) => [job, ...prev].slice(0, 24));

      if (job.result) {
        setSampledBitstrings(job.result.bitstrings);
        setSampledMetric({
          estimate: job.result.estimate,
          totalShotsUsed: job.result.totalShotsUsed,
        });
      }

      setSamplingError(null);
      setSamplingNotice(job.statusDetail);
    } catch (error) {
      setSampledBitstrings([]);
      setSampledMetric(null);
      setSamplingNotice(null);
      setSamplingError(error instanceof Error ? error.message : "Unable to sample bitstrings.");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1600px] p-4 md:p-6">
        <HeaderBar algorithm={algorithm} onAlgorithmChange={setAlgorithm} />

        <div className="grid gap-4 lg:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]">
          <aside className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/80 p-4">
            <ExecutionBackendPanel
              executionTarget={backendPreferences.executionTarget}
              ionqCredentialMode={backendPreferences.ionqCredentialMode}
              ionqApiKey={providerSessionCredentials.ionqApiKey}
              ionqAuthConfigured={selectedExecutionTargetAuthStatus.configured}
              ionqAuthDetail={selectedExecutionTargetAuthStatus.detail}
              onExecutionTargetChange={(executionTarget) =>
                setBackendPreferences((prev) => ({
                  ...prev,
                  executionTarget,
                }))
              }
              onIonqCredentialModeChange={(ionqCredentialMode) =>
                setBackendPreferences((prev) => ({
                  ...prev,
                  ionqCredentialMode,
                }))
              }
              onIonqApiKeyChange={(ionqApiKey) =>
                setProviderSessionCredentials((prev) => ({
                  ...prev,
                  ionqApiKey,
                }))
              }
              onClearIonqApiKey={() =>
                setProviderSessionCredentials((prev) => ({
                  ...prev,
                  ionqApiKey: "",
                }))
              }
            />
            <ExecutionJobsPanel
              jobs={executionJobs}
              onClearHistory={() => setExecutionJobs([])}
              onPollJobs={() =>
                setExecutionJobs((prev) =>
                  pollExecutionJobs(
                    prev,
                    (targetId) => resolveProviderAuthForTarget(targetId, backendPreferences, providerSessionCredentials),
                  ),
                )
              }
              onRetryJob={(jobId) =>
                setExecutionJobs((prev) =>
                  prev.map((job) => (job.id === jobId && job.status === "failed" ? retryExecutionJob(job) : job)),
                )
              }
            />

            <TargetDomainWidget
              algorithm={algorithm}
              running={running}
              nodeCount={nodeCount}
              edges={effectiveEdges}
              selectedNode={selectedNode}
              graphPositions={graphPositions}
              onNodeClick={handleNodeClick}
              onAddNode={handleAddNode}
              onRemoveNode={handleRemoveNode}
              molecule={molecule}
              onMoleculeChange={(next) => {
                setMolecule(next);
                setIteration(0);
                setCostHistory([]);
                setStopReason(null);
                vqeStallRef.current = 0;
              }}
            />

            <DepthSlider depth={depth} running={running} onChange={setDepth} />
            <LearningRateSlider
              algorithm={algorithm}
              learningRate={learningRates[algorithm]}
              effectiveLearningRate={effectiveLearningRate}
              onChange={(next) => {
                setLearningRates((prev) => ({
                  ...prev,
                  [algorithm]: next,
                }));
                if (algorithm === "vqe") {
                  setVqeDecay((prev) => clampVqeDecayConfig(prev, next));
                }
              }}
            />
            {algorithm === "vqe" ? (
              <VqeScheduleControls
                config={vqeDecay}
                maxMinLearningRate={learningRates.vqe}
                onChange={(next) => setVqeDecay(clampVqeDecayConfig(next, learningRates.vqe))}
              />
            ) : null}
            {algorithm === "vqe" ? <VqeEarlyStoppingControls config={vqeEarlyStop} onChange={setVqeEarlyStop} /> : null}

            <ParameterList
              algorithm={algorithm}
              depth={depth}
              running={running}
              gammas={gammas}
              betas={betas}
              thetas={thetas}
              setGammas={setGammas}
              setBetas={setBetas}
              setThetas={setThetas}
            />

            <ActionButtons
              running={running}
              onToggleRun={() =>
                setRunning((r) => {
                  const next = !r;
                  if (next) {
                    setStopReason(null);
                    vqeStallRef.current = 0;
                  }
                  return next;
                })
              }
              onReset={resetSimulation}
            />
            {stopReason === "converged" ? (
              <p className="text-xs text-emerald-300">Optimizer stopped early: convergence threshold reached.</p>
            ) : null}
            {selectedExecutionTargetDescriptor.executionMode === "remote-job" ? (
              <p className="text-xs text-cyan-300">
                Local preview stays available while the selected execution target is modeled as a queued remote job.
              </p>
            ) : null}
          </aside>

          <main className="space-y-4">
            <CircuitVisualizer
              circuitMode={circuitMode}
              onToggleMode={() => setCircuitMode((m) => (m === "logical" ? "transpiled" : "logical"))}
              columns={circuitColumns}
              qubitCount={qubitCount}
            />

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
              <div className="mb-4 flex flex-col gap-3 border-b border-neutral-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-200">Analysis Workspace</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    Track optimization progress in the energy landscape, then compare the exact result against finite-shot sampling.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                  <span className="rounded-full border border-neutral-700 px-2 py-1">{algorithm === "qaoa" ? "QAOA" : "VQE"}</span>
                  <span className="rounded-full border border-neutral-700 px-2 py-1">{qubitCount} qubits</span>
                </div>
              </div>

              <div className="space-y-4">
                <EnergyChart
                  algorithm={algorithm}
                  molecule={molecule}
                  edges={effectiveEdges}
                  costHistory={costHistory}
                  currentMetric={currentMetric}
                  iteration={iteration}
                  variant="embedded"
                />

                <section className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-100">Measurement Dashboard</h3>
                      <p className="mt-1 text-xs text-neutral-400">
                        Compare the exact {algorithm === "qaoa" ? "QAOA cost" : "VQE energy"} against a finite-shot estimate.
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-500">
                        {algorithm === "qaoa"
                          ? "Sampling uses one computational-basis batch over the current graph state."
                          : "Sampling uses one computational-basis batch plus one rotated-basis batch to estimate the XX term."}
                      </p>
                    </div>
                    <span className="rounded-full border border-neutral-700 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-neutral-300">
                      Histogram + estimate
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Exact {algorithm === "qaoa" ? "cost" : "energy"}</p>
                      <p className="mt-2 font-mono text-lg text-neutral-100">{currentMetric.toFixed(6)}</p>
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Sampled estimate</p>
                      <p className="mt-2 font-mono text-lg text-cyan-300">
                        {sampledMetric ? sampledMetric.estimate.toFixed(6) : "Awaiting samples"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Absolute error</p>
                      <p className="mt-2 font-mono text-lg text-amber-300">
                        {sampledMetricDelta !== null ? Math.abs(sampledMetricDelta).toFixed(6) : "Awaiting samples"}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {sampledRelativeError !== null
                          ? `${sampledRelativeError.toFixed(2)}% relative error`
                          : "Capture measurements to compare."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-neutral-300" htmlFor="measurement-shots">
                        <span className="mb-1 block">Measurement shots per batch</span>
                        <input
                          id="measurement-shots"
                          type="number"
                          min={1}
                          max={4096}
                          step={1}
                          value={measurementShots}
                          onChange={(event) => {
                            const nextValue = Number.parseInt(event.target.value, 10);
                            setMeasurementShots(
                              Number.isFinite(nextValue) ? Math.min(4096, Math.max(1, nextValue)) : 1,
                            );
                          }}
                          disabled={running}
                          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {SHOT_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setMeasurementShots(preset)}
                            disabled={running}
                            className={`rounded-full border px-2.5 py-1 text-xs transition ${
                              measurementShots === preset
                                ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
                                : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            {preset} shots
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSampleBitstrings}
                      disabled={running}
                      className="rounded-md border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-900/60 disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-800 disabled:text-neutral-500"
                    >
                      Refresh sampled estimate
                    </button>
                  </div>

                  {sampledMetric ? (
                    <p className="mt-3 text-xs text-neutral-400">
                      Shot budget used: {sampledMetric.totalShotsUsed} total measurements
                      {sampledMetric.totalShotsUsed === measurementShots ? " across one basis." : " across multiple bases."}
                    </p>
                  ) : null}
                  {running ? (
                    <p className="mt-3 text-xs text-amber-300">Pause the optimizer before sampling the current state.</p>
                  ) : null}
                  {samplingNotice ? <p className="mt-3 text-xs text-cyan-300">{samplingNotice}</p> : null}
                  {samplingError ? <p className="mt-3 text-xs text-red-300">{samplingError}</p> : null}

                  {sampledBitstrings.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span>Histogram basis shots: {sampledBitstrings.length}</span>
                        <span>Unique outcomes: {sampledOutcomeSummary.length}</span>
                      </div>

                      <ul className="space-y-2">
                        {sampledOutcomeSummary.slice(0, MAX_RENDERED_OUTCOMES).map((outcome) => (
                          <li key={outcome.bitstring}>
                            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                              <span className="font-mono text-sm text-neutral-100">{outcome.bitstring}</span>
                              <span className="text-neutral-400">
                                {outcome.count} / {sampledBitstrings.length} shots ({(outcome.probability * 100).toFixed(1)}%)
                              </span>
                            </div>
                            <div className="h-3 overflow-hidden rounded-full bg-neutral-800">
                              <div
                                className="h-full rounded-full bg-cyan-400"
                                style={{ width: `${Math.max(outcome.probability * 100, 2)}%` }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>

                      {sampledOutcomeSummary.length > MAX_RENDERED_OUTCOMES ? (
                        <p className="text-xs text-neutral-500">
                          Showing the top {MAX_RENDERED_OUTCOMES} outcomes by observed frequency.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-neutral-500">
                      No sampled histogram yet. Capture measurements to compare exact and finite-shot behavior.
                    </p>
                  )}
                </section>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
