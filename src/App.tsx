import { useEffect, useMemo, useRef, useState } from "react";
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
  computeQaoaObjectiveGradients,
  computeVqeObjectiveGradients,
  evaluateQaoaCost,
  evaluateVqeEnergy,
} from "./lib/algorithms";
import { buildQaoaCircuit, buildVqeCircuit } from "./lib/circuitBuilders";
import { edgeKey, makeDefaultBetas, makeDefaultGammas, makeDefaultThetas, parseEdge, resizeArray } from "./lib/utils";
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

const getEffectiveLearningRate = (
  algorithm: Algorithm,
  baseLearningRate: number,
  iteration: number,
  vqeDecay: VqeDecayConfig,
): number => {
  if (algorithm !== "vqe" || !vqeDecay.enabled) return baseLearningRate;
  if (vqeDecay.mode === "exponential") {
    return Math.max(vqeDecay.minLearningRate, baseLearningRate * Math.pow(vqeDecay.expGamma, iteration));
  }
  const decaySteps = Math.floor(iteration / Math.max(1, vqeDecay.stepEvery));
  return Math.max(vqeDecay.minLearningRate, baseLearningRate * Math.pow(vqeDecay.stepFactor, decaySteps));
};

export default function App(): JSX.Element {
  const [algorithm, setAlgorithm] = useState<Algorithm>("qaoa");
  const [circuitMode, setCircuitMode] = useState<CircuitMode>("logical");

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
  const vqeStallRef = useRef<number>(0);

  const currentMetric = useMemo(() => {
    if (algorithm === "qaoa") {
      return evaluateQaoaCost(nodeCount, edges, gammas, betas);
    }
    return evaluateVqeEnergy(thetas, molecule);
  }, [algorithm, betas, edges, gammas, molecule, nodeCount, thetas]);

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
    setEdges((prev) =>
      prev.filter((key) => {
        const [a, b] = parseEdge(key);
        return a < nodeCount && b < nodeCount;
      }),
    );
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

  const liveRef = useRef<LiveState>({
    algorithm,
    depth,
    gammas,
    betas,
    thetas,
    nodeCount,
    edges,
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
    edges,
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
      return buildQaoaCircuit(circuitMode, nodeCount, edges, gammas, betas);
    }
    return buildVqeCircuit(circuitMode, thetas);
  }, [algorithm, betas, circuitMode, edges, gammas, nodeCount, thetas]);

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

  const resetSimulation = () => {
    setRunning(false);
    setStopReason(null);
    vqeStallRef.current = 0;

    if (algorithm === "qaoa") {
      const g = makeDefaultGammas(depth);
      const b = makeDefaultBetas(depth);
      setGammas(g);
      setBetas(b);
      setCostHistory([evaluateQaoaCost(nodeCount, edges, g, b)]);
    } else {
      const t = makeDefaultThetas(depth);
      setThetas(t);
      setCostHistory([evaluateVqeEnergy(t, molecule)]);
    }

    setIteration(0);
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
            <TargetDomainWidget
              algorithm={algorithm}
              running={running}
              nodeCount={nodeCount}
              edges={edges}
              selectedNode={selectedNode}
              graphPositions={graphPositions}
              onNodeClick={handleNodeClick}
              onAddNode={() => setNodeCount((n) => Math.min(8, n + 1))}
              onRemoveNode={() => setNodeCount((n) => Math.max(2, n - 1))}
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
              onChange={(next) =>
                setLearningRates((prev) => ({
                  ...prev,
                  [algorithm]: next,
                }))
              }
            />
            {algorithm === "vqe" ? <VqeScheduleControls config={vqeDecay} onChange={setVqeDecay} /> : null}
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
          </aside>

          <main className="space-y-4">
            <CircuitVisualizer
              circuitMode={circuitMode}
              onToggleMode={() => setCircuitMode((m) => (m === "logical" ? "transpiled" : "logical"))}
              columns={circuitColumns}
              qubitCount={qubitCount}
            />

            <EnergyChart
              algorithm={algorithm}
              molecule={molecule}
              edges={edges}
              costHistory={costHistory}
              currentMetric={currentMetric}
              iteration={iteration}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
