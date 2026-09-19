import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TimeMachinePreferences {
  showRadar: boolean;
  showMetar: boolean;
  showWind: boolean;
  showAup: boolean;
  setShowRadar: (value: boolean) => void;
  setShowMetar: (value: boolean) => void;
  setShowWind: (value: boolean) => void;
  setShowAup: (value: boolean) => void;
}

export const useTimeMachinePreferences = create<TimeMachinePreferences>()(persist((set) => ({
  showRadar: false,
  showMetar: false,
  showWind: false,
  showAup: false,
  setShowRadar: (showRadar) => set({ showRadar }),
  setShowMetar: (showMetar) => set({ showMetar }),
  setShowWind: (showWind) => set({ showWind }),
  setShowAup: (showAup) => set({ showAup }),
}), { name: "airradar-time-machine-preferences" }));
