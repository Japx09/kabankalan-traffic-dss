import { create } from 'zustand';
import {
  SimulationParameters,
  SimulationMetrics,
  VehicleType,
  LocationId,
  ScenarioId,
  CorridorConfig,
} from '@/simulation/types';
import { initSimulation, stepSimulation, SimulationState, FIXED_PHYSICS_DT } from '@/simulation/engine';
import { CORRIDORS, SCENARIOS, applyScenarioToCorridor } from '@/simulation/corridors';

export interface BaselineRecord {
  metrics: SimulationMetrics;
  params: SimulationParameters;
  simTime: number;
  capturedAt: string;
}

interface SimulationStore {
  // ─── Parameters ────────────────────────────────────────────
  params: SimulationParameters;
  setVehicleInflow: (type: VehicleType, value: number) => void;
  setDwellTime: (value: number) => void;
  setPedestrianVolume: (value: number) => void;
  setJaywalkingProbability: (value: number) => void;
  setLocation: (location: LocationId) => void;
  setScenario: (scenario: ScenarioId) => void;
  setSpeedMultiplier: (value: number) => void;
  setBusHeadway: (value: number) => void;
  setSeed: (seed: number) => void;
  setPlatoonCycle: (value: number) => void;
  setPlatoonReleaseDuration: (value: number) => void;
  applyTrafficPreset: (preset: 'am_peak' | 'off_peak' | 'pm_peak') => void;

  // ─── Modes & UI State ──────────────────────────────────────
  isDefenseMode: boolean;
  toggleDefenseMode: () => void;
  setDefenseMode: (value: boolean) => void;

  isDebugMode: boolean;
  toggleDebugMode: () => void;
  setDebugMode: (value: boolean) => void;
  selectedVehicleId: string | null;
  setSelectedVehicleId: (id: string | null) => void;

  // ─── Simulation State ──────────────────────────────────────
  simState: SimulationState;
  isRunning: boolean;
  startSimulation: () => void;
  pauseSimulation: () => void;
  resetSimulation: () => void;
  tick: (dt: number) => void;

  // ─── Baseline Comparison Tracking ──────────────────────────
  baselineRecord: BaselineRecord | null;
  baselineMetrics: SimulationMetrics | null;
  captureBaseline: () => void;
  clearBaseline: () => void;

  // ─── GIS & Viewport Overlays ───────────────────────────────
  cameraPreset: 'isometric' | 'topdown' | 'crosswalk' | 'terminal';
  setCameraPreset: (preset: 'isometric' | 'topdown' | 'crosswalk' | 'terminal') => void;
  showConflictHeatmap: boolean;
  setShowConflictHeatmap: (show: boolean) => void;
  showVehicleTrails: boolean;
  setShowVehicleTrails: (show: boolean) => void;
  showCenterlines: boolean;
  setShowCenterlines: (show: boolean) => void;
  showSweptEnvelopes: boolean;
  setShowSweptEnvelopes: (show: boolean) => void;
  showConflictAreas: boolean;
  setShowConflictAreas: (show: boolean) => void;
  showStopBars: boolean;
  setShowStopBars: (show: boolean) => void;

  // ─── Derived ───────────────────────────────────────────────
  corridor: CorridorConfig;
}

const defaultParams: SimulationParameters = {
  vehicleInflow: {
    [VehicleType.Tricycle]: 120,
    [VehicleType.Jeepney]: 60,
    [VehicleType.Bus]: 30,
    [VehicleType.PrivateCar]: 80,
  },
  dwellTime: 30,
  pedestrianVolume: 8,
  jaywalkingProbability: 0.25,
  location: LocationId.CeresTerminal,
  scenario: ScenarioId.Baseline,
  speedMultiplier: 1,
  busHeadway: 60,
  seed: 12345,
  platoonCycle: 90,
  platoonReleaseDuration: 45,
};

let physicsAccumulator = 0;

export const useSimulationStore = create<SimulationStore>((set, get) => {
  const initialState = initSimulation(defaultParams);
  const baseCorridor = CORRIDORS[defaultParams.location];
  const scenario = SCENARIOS[defaultParams.scenario];
  const corridor = applyScenarioToCorridor(baseCorridor, scenario);

  return {
    params: defaultParams,
    simState: initialState,
    isRunning: false,
    baselineRecord: null,
    baselineMetrics: null,
    corridor,
    cameraPreset: 'isometric',

    isDefenseMode: false,
    toggleDefenseMode: () => set((s) => ({ isDefenseMode: !s.isDefenseMode })),
    setDefenseMode: (isDefenseMode) => set({ isDefenseMode }),

    isDebugMode: false,
    toggleDebugMode: () => set((s) => ({ isDebugMode: !s.isDebugMode })),
    setDebugMode: (isDebugMode) => set({ isDebugMode }),
    selectedVehicleId: null,
    setSelectedVehicleId: (selectedVehicleId) => set({ selectedVehicleId }),

    showConflictHeatmap: true,
    showVehicleTrails: true,
    showCenterlines: true,
    showSweptEnvelopes: true,
    showConflictAreas: true,
    showStopBars: true,

    setCameraPreset: (cameraPreset) => set({ cameraPreset }),
    setShowConflictHeatmap: (showConflictHeatmap) => set({ showConflictHeatmap }),
    setShowVehicleTrails: (showVehicleTrails) => set({ showVehicleTrails }),
    setShowCenterlines: (showCenterlines) => set({ showCenterlines }),
    setShowSweptEnvelopes: (showSweptEnvelopes) => set({ showSweptEnvelopes }),
    setShowConflictAreas: (showConflictAreas) => set({ showConflictAreas }),
    setShowStopBars: (showStopBars) => set({ showStopBars }),

    setVehicleInflow: (type, value) => {
      set((s) => ({
        params: {
          ...s.params,
          vehicleInflow: { ...s.params.vehicleInflow, [type]: value },
        },
      }));
    },

    setDwellTime: (value) => {
      set((s) => ({ params: { ...s.params, dwellTime: value } }));
    },

    setPedestrianVolume: (value) => {
      set((s) => ({ params: { ...s.params, pedestrianVolume: value } }));
    },

    setJaywalkingProbability: (value) => {
      set((s) => ({ params: { ...s.params, jaywalkingProbability: value } }));
    },

    setSpeedMultiplier: (value) => {
      set((s) => ({ params: { ...s.params, speedMultiplier: value } }));
    },

    setBusHeadway: (value) => {
      set((s) => ({ params: { ...s.params, busHeadway: value } }));
    },

    setSeed: (seed) => {
      const { params } = get();
      const newParams = { ...params, seed };
      physicsAccumulator = 0;
      const newState = initSimulation(newParams);
      set({ params: newParams, simState: newState });
    },

    setPlatoonCycle: (value) => {
      set((s) => ({ params: { ...s.params, platoonCycle: value } }));
    },

    setPlatoonReleaseDuration: (value) => {
      set((s) => ({ params: { ...s.params, platoonReleaseDuration: value } }));
    },

    setLocation: (location) => {
      const { params } = get();
      physicsAccumulator = 0;
      const newParams = { ...params, location };
      const newState = initSimulation(newParams);
      const baseCorridor = CORRIDORS[location];
      const scenario = SCENARIOS[params.scenario];
      const corridor = applyScenarioToCorridor(baseCorridor, scenario);

      set({
        params: newParams,
        simState: newState,
        corridor,
        selectedVehicleId: null,
      });
    },

    setScenario: (scenario) => {
      const { params } = get();
      physicsAccumulator = 0;
      const newParams = { ...params, scenario };
      const newState = initSimulation(newParams);
      const baseCorridor = CORRIDORS[params.location];
      const scenarioConfig = SCENARIOS[scenario];
      const corridor = applyScenarioToCorridor(baseCorridor, scenarioConfig);

      set({
        params: newParams,
        simState: newState,
        corridor,
        selectedVehicleId: null,
      });
    },

    applyTrafficPreset: (preset) => {
      const presets = {
        am_peak: {
          vehicleInflow: {
            [VehicleType.Tricycle]: 180,
            [VehicleType.Jeepney]: 95,
            [VehicleType.Bus]: 45,
            [VehicleType.PrivateCar]: 140,
          },
          busHeadway: 45,
          pedestrianVolume: 18,
          jaywalkingProbability: 0.30,
        },
        off_peak: {
          vehicleInflow: {
            [VehicleType.Tricycle]: 85,
            [VehicleType.Jeepney]: 35,
            [VehicleType.Bus]: 15,
            [VehicleType.PrivateCar]: 50,
          },
          busHeadway: 90,
          pedestrianVolume: 6,
          jaywalkingProbability: 0.15,
        },
        pm_peak: {
          vehicleInflow: {
            [VehicleType.Tricycle]: 220,
            [VehicleType.Jeepney]: 110,
            [VehicleType.Bus]: 50,
            [VehicleType.PrivateCar]: 160,
          },
          busHeadway: 40,
          pedestrianVolume: 24,
          jaywalkingProbability: 0.35,
        },
      };
      const selected = presets[preset];
      if (selected) {
        set((s) => ({
          params: { ...s.params, ...selected },
        }));
      }
    },

    startSimulation: () => set({ isRunning: true }),
    pauseSimulation: () => set({ isRunning: false }),

    resetSimulation: () => {
      physicsAccumulator = 0;
      const { params } = get();
      const newState = initSimulation(params);
      set({ simState: newState, isRunning: false, selectedVehicleId: null });
    },

    tick: (frameDelta) => {
      const { simState, params, isRunning } = get();
      if (!isRunning) return;

      // Accumulate physics time scaled by speedMultiplier
      physicsAccumulator += Math.min(frameDelta, 0.08) * params.speedMultiplier;

      let currentState = simState;
      let substeps = 0;
      const MAX_SUBSTEPS = 25; // Prevents spiral of death under heavy load

      while (physicsAccumulator >= FIXED_PHYSICS_DT && substeps < MAX_SUBSTEPS) {
        currentState = stepSimulation(currentState, params, FIXED_PHYSICS_DT);
        physicsAccumulator -= FIXED_PHYSICS_DT;
        substeps++;
      }

      // If lagging behind heavily, clamp accumulator so time isn't lost wildly
      if (physicsAccumulator > FIXED_PHYSICS_DT * 3) {
        physicsAccumulator = 0;
      }

      set({ simState: currentState });
    },

    captureBaseline: () => {
      const { simState, params } = get();
      const record: BaselineRecord = {
        metrics: { ...simState.metrics },
        params: { ...params },
        simTime: simState.simTime,
        capturedAt: new Date().toLocaleTimeString(),
      };
      set({
        baselineRecord: record,
        baselineMetrics: { ...simState.metrics },
      });
    },

    clearBaseline: () => {
      set({ baselineRecord: null, baselineMetrics: null });
    },
  };
});

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__useSimulationStore = useSimulationStore;
}
