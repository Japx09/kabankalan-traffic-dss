import { create } from 'zustand';
import {
  SimulationParameters,
  SimulationMetrics,
  VehicleType,
  LocationId,
  ScenarioId,
  CorridorConfig,
} from '@/simulation/types';
import { initSimulation, stepSimulation, SimulationState } from '@/simulation/engine';
import { CORRIDORS, SCENARIOS, applyScenarioToCorridor } from '@/simulation/corridors';

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
  applyTrafficPreset: (preset: 'am_peak' | 'off_peak' | 'pm_peak') => void;

  // ─── Defense Presentation Mode ─────────────────────────────
  isDefenseMode: boolean;
  toggleDefenseMode: () => void;
  setDefenseMode: (value: boolean) => void;

  // ─── Simulation State ──────────────────────────────────────
  simState: SimulationState;
  isRunning: boolean;
  startSimulation: () => void;
  pauseSimulation: () => void;
  resetSimulation: () => void;
  tick: (dt: number) => void;

  // ─── Baseline Tracking ─────────────────────────────────────
  baselineMetrics: SimulationMetrics | null;
  captureBaseline: () => void;

  // ─── GIS & Viewport State ─────────────────────────────────
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
};

export const useSimulationStore = create<SimulationStore>((set, get) => {
  const initialState = initSimulation(defaultParams);
  const baseCorridor = CORRIDORS[defaultParams.location];
  const scenario = SCENARIOS[defaultParams.scenario];
  const corridor = applyScenarioToCorridor(baseCorridor, scenario);

  return {
    params: defaultParams,
    simState: initialState,
    isRunning: false,
    baselineMetrics: null,
    corridor,
    cameraPreset: 'isometric',
    showConflictHeatmap: true,
    showVehicleTrails: true,
    showCenterlines: true,
    showSweptEnvelopes: true,

    setCameraPreset: (cameraPreset) => set({ cameraPreset }),
    setShowConflictHeatmap: (showConflictHeatmap) => set({ showConflictHeatmap }),
    setShowVehicleTrails: (showVehicleTrails) => set({ showVehicleTrails }),
    setShowCenterlines: (showCenterlines) => set({ showCenterlines }),
    setShowSweptEnvelopes: (showSweptEnvelopes) => set({ showSweptEnvelopes }),

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

    setLocation: (location) => {
      const { params } = get();
      const newParams = { ...params, location };
      const newState = initSimulation(newParams);
      const baseCorridor = CORRIDORS[location];
      const scenario = SCENARIOS[params.scenario];
      const corridor = applyScenarioToCorridor(baseCorridor, scenario);

      set({
        params: newParams,
        simState: newState,
        corridor,
        baselineMetrics: null,
      });
    },

    setScenario: (scenario) => {
      const { params } = get();
      const newParams = { ...params, scenario };
      const newState = initSimulation(newParams);
      const baseCorridor = CORRIDORS[params.location];
      const scenarioConfig = SCENARIOS[scenario];
      const corridor = applyScenarioToCorridor(baseCorridor, scenarioConfig);

      set({
        params: newParams,
        simState: newState,
        corridor,
      });
    },

    setSpeedMultiplier: (value) => {
      set((s) => ({ params: { ...s.params, speedMultiplier: value } }));
    },

    setBusHeadway: (value) => {
      set((s) => ({ params: { ...s.params, busHeadway: value } }));
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

    isDefenseMode: false,
    toggleDefenseMode: () => set((s) => ({ isDefenseMode: !s.isDefenseMode })),
    setDefenseMode: (isDefenseMode) => set({ isDefenseMode }),

    startSimulation: () => set({ isRunning: true }),
    pauseSimulation: () => set({ isRunning: false }),

    resetSimulation: () => {
      const { params } = get();
      const newState = initSimulation(params);
      set({ simState: newState, isRunning: false });
    },

    tick: (dt) => {
      const { simState, params, isRunning } = get();
      if (!isRunning) return;

      const newState = stepSimulation(simState, params, dt);
      set({ simState: newState });
    },

    captureBaseline: () => {
      const { simState } = get();
      set({ baselineMetrics: { ...simState.metrics } });
    },
  };
});

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__useSimulationStore = useSimulationStore;
}
