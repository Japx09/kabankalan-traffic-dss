import { create } from 'zustand';
import { buildCeresRoadGraph } from '@/gis/roadGraphBuilder';
import { evaluateScenarioBenchmark } from '@/sim/analytics';
import { initSimulation, stepSimulation } from '@/sim/engine';
import {
  DEFAULT_SIM_PARAMS,
  type CameraPresetId,
  type OverlayToggles,
  type ScenarioId,
  type ScenarioSnapshot,
  type SimulationParams,
  type SimulationState,
} from '@/sim/types';

export interface SimStoreState {
  simState: SimulationState;
  params: SimulationParams;
  isRunning: boolean;
  cameraPreset: CameraPresetId;
  cameraPresetNonce: number;
  selectedVehicleId: string | null;
  followSelectedVehicle: boolean;
  isDefenseMode: boolean;
  overlays: OverlayToggles;
  scenarioSnapshots: Partial<Record<ScenarioId, ScenarioSnapshot>>;

  setRunning: (running: boolean) => void;
  toggleRunning: () => void;
  step: (dt: number) => void;
  resetSimulation: () => void;
  setScenario: (scenario: ScenarioId) => void;
  updateParams: (partial: Partial<SimulationParams>) => void;
  setCameraPreset: (preset: CameraPresetId) => void;
  selectVehicle: (id: string | null) => void;
  setFollowSelectedVehicle: (follow: boolean) => void;
  toggleDefenseMode: () => void;
  setOverlay: <K extends keyof OverlayToggles>(key: K, value: OverlayToggles[K]) => void;
  captureScenarioSnapshot: () => void;
  runAllScenarioBenchmarks: () => void;
}

const DEFAULT_OVERLAYS: OverlayToggles = {
  groundMode: 'game',
  showLaneSplines: false,
  showConflictZones: false,
  showBoundingBoxes: false,
  showTrails: false,
  showLandmarks: true,
  showConflictPulses: true,
};

const sharedGraph = buildCeresRoadGraph();
let liveSimState: SimulationState = initSimulation({ ...DEFAULT_SIM_PARAMS }, sharedGraph);
let publishAccumulator = 0;
const UI_PUBLISH_INTERVAL = 0.16; // ~6 Hz React UI snapshots while R3F reads 60 FPS live state

/** Zero-rerender 60 FPS accessor consumed inside React Three Fiber `useFrame`. */
export function getLiveSimState(): SimulationState {
  return liveSimState;
}

function makeUiSnapshot(): SimulationState {
  return {
    ...liveSimState,
    metrics: { ...liveSimState.metrics },
    signalState: { ...liveSimState.signalState },
    telemetryHistory: liveSimState.telemetryHistory.slice(),
    conflicts: liveSimState.conflicts.slice(),
  };
}

export const useSimStore = create<SimStoreState>((set, get) => ({
  simState: makeUiSnapshot(),
  params: { ...DEFAULT_SIM_PARAMS },
  isRunning: true,
  cameraPreset: 'isometric',
  cameraPresetNonce: 0,
  selectedVehicleId: null,
  followSelectedVehicle: false,
  isDefenseMode: false,
  overlays: { ...DEFAULT_OVERLAYS },
  scenarioSnapshots: {},

  setRunning: (running) => set({ isRunning: running }),

  toggleRunning: () => set((s) => ({ isRunning: !s.isRunning })),

  step: (dt) => {
    const state = get();
    if (!state.isRunning) return;

    const wallDt = Math.max(0, Math.min(dt, 0.1));
    if (wallDt <= 0) return;

    const simDt = wallDt * state.params.playbackSpeed;
    stepSimulation(liveSimState, state.params, simDt);

    publishAccumulator += wallDt;
    if (publishAccumulator >= UI_PUBLISH_INTERVAL) {
      publishAccumulator = 0;
      const selId = state.selectedVehicleId;
      const selStillAlive =
        selId !== null && liveSimState.vehicles.some((v) => v.id === selId);

      set({
        simState: makeUiSnapshot(),
        ...(selId !== null && !selStillAlive
          ? { selectedVehicleId: null, followSelectedVehicle: false }
          : {}),
      });
    }
  },

  resetSimulation: () => {
    const { params } = get();
    liveSimState = initSimulation({ ...params }, sharedGraph);
    publishAccumulator = 0;
    set({
      simState: makeUiSnapshot(),
      selectedVehicleId: null,
      followSelectedVehicle: false,
    });
  },

  setScenario: (scenario) => {
    const nextParams: SimulationParams = { ...get().params, scenario };
    liveSimState = initSimulation(nextParams, sharedGraph);
    publishAccumulator = 0;
    set({
      params: nextParams,
      simState: makeUiSnapshot(),
      selectedVehicleId: null,
      followSelectedVehicle: false,
    });
  },

  updateParams: (partial) => {
    const prev = get().params;
    const nextParams: SimulationParams = { ...prev, ...partial };
    const needsReset =
      (partial.scenario !== undefined && partial.scenario !== prev.scenario) ||
      (partial.seed !== undefined && partial.seed !== prev.seed);

    if (needsReset) {
      liveSimState = initSimulation(nextParams, sharedGraph);
      publishAccumulator = 0;
      set({
        params: nextParams,
        simState: makeUiSnapshot(),
        selectedVehicleId: null,
        followSelectedVehicle: false,
      });
    } else {
      set({ params: nextParams });
    }
  },

  setCameraPreset: (preset) =>
    set((s) => ({
      cameraPreset: preset,
      cameraPresetNonce: s.cameraPresetNonce + 1,
      followSelectedVehicle: false,
    })),

  selectVehicle: (id) =>
    set({
      selectedVehicleId: id,
      followSelectedVehicle: id ? get().followSelectedVehicle : false,
    }),

  setFollowSelectedVehicle: (follow) =>
    set((s) => ({
      followSelectedVehicle: follow && s.selectedVehicleId !== null,
    })),

  toggleDefenseMode: () => set((s) => ({ isDefenseMode: !s.isDefenseMode })),

  setOverlay: (key, value) =>
    set((s) => ({
      overlays: {
        ...s.overlays,
        [key]: value,
      },
    })),

  captureScenarioSnapshot: () => {
    const { params } = get();
    const snap: ScenarioSnapshot = {
      scenario: params.scenario,
      simTime: Number(liveSimState.simTime.toFixed(1)),
      metrics: { ...liveSimState.metrics },
    };
    set((s) => ({
      scenarioSnapshots: {
        ...s.scenarioSnapshots,
        [params.scenario]: snap,
      },
    }));
  },

  runAllScenarioBenchmarks: () => {
    const { params } = get();
    const scenarios: readonly ScenarioId[] = [
      'baseline',
      'dedicated-bays',
      'signalized-overpass',
    ];
    const snapshots: Partial<Record<ScenarioId, ScenarioSnapshot>> = {};
    for (const sc of scenarios) {
      snapshots[sc] = evaluateScenarioBenchmark(sharedGraph, params, sc, 120);
    }
    set({ scenarioSnapshots: snapshots });
  },
}));
