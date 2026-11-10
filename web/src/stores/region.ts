import { create } from "zustand";

/**
 * Set when the API answers 451 REGION_UNAVAILABLE: Vibe isn't offered in
 * the visitor's country (admin → Settings → Region). The app then shows
 * only the "not available in your region" screen.
 */
interface RegionState {
  blocked: boolean;
  message: string;
  block: (message?: string) => void;
}

export const REGION_MESSAGE = "Vibe isn't available in your region.";

export const useRegion = create<RegionState>()((set) => ({
  blocked: false,
  message: REGION_MESSAGE,
  block: (message) => set({ blocked: true, message: message || REGION_MESSAGE }),
}));
