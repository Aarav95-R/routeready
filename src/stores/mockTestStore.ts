import { create } from "zustand";
import { isInZone } from "@/lib/geo";
import { aggregate, detectObservationFaults, detectSpeedingFaults, GpsSample, MockResult } from "@/lib/scoring/engine";
import type { Route } from "@/types/db";

type MockPhase = "idle" | "running" | "finished";

type MockState = {
  phase: MockPhase;
  route: Route | null;
  startedAt: number;
  samples: GpsSample[];
  activeZoneIdx: number | null;
  activeTapped: boolean;
  zoneOutcomes: { zoneIdx: number; tapped: boolean }[];
  result: MockResult | null;
  start: (route: Route, now?: number) => void;
  onSample: (s: GpsSample) => void;
  tapMirrors: () => void;
  finish: (now?: number) => MockResult;
  reset: () => void;
};

const initial = {
  phase: "idle" as MockPhase, route: null, startedAt: 0, samples: [],
  activeZoneIdx: null, activeTapped: false, zoneOutcomes: [], result: null,
};

export const useMockTest = create<MockState>((set, get) => ({
  ...initial,
  start: (route, now = Date.now()) => set({ ...initial, phase: "running", route, startedAt: now }),
  onSample: (s) => {
    const { route, samples, activeZoneIdx, activeTapped, zoneOutcomes } = get();
    if (!route || get().phase !== "running") return;
    const zones = route.observation_zones;
    const inside = zones.findIndex((z) => isInZone({ lat: s.lat, lng: s.lng }, z));
    let next: Partial<MockState> = { samples: [...samples, s] };
    if (inside !== -1 && activeZoneIdx === null && !zoneOutcomes.some((o) => o.zoneIdx === inside)) {
      next = { ...next, activeZoneIdx: inside, activeTapped: false };
    } else if (inside === -1 && activeZoneIdx !== null) {
      next = {
        ...next,
        zoneOutcomes: [...zoneOutcomes, { zoneIdx: activeZoneIdx, tapped: activeTapped }],
        activeZoneIdx: null, activeTapped: false,
      };
    }
    set(next);
  },
  tapMirrors: () => {
    if (get().activeZoneIdx !== null) set({ activeTapped: true });
  },
  finish: (now = Date.now()) => {
    const { route, samples, startedAt, activeZoneIdx, activeTapped, zoneOutcomes } = get();
    const outcomes = activeZoneIdx !== null
      ? [...zoneOutcomes, { zoneIdx: activeZoneIdx, tapped: activeTapped }]
      : zoneOutcomes;
    const coords = (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ lat, lng }));
    const faults = [
      ...detectSpeedingFaults(samples, coords, route?.speed_profile ?? []),
      ...detectObservationFaults(outcomes.map((o) => ({ zone: route!.observation_zones[o.zoneIdx], tapped: o.tapped }))),
    ];
    const result = aggregate(faults, Math.round((now - startedAt) / 1000));
    set({ phase: "finished", result, zoneOutcomes: outcomes, activeZoneIdx: null });
    return result;
  },
  reset: () => set({ ...initial }),
}));
