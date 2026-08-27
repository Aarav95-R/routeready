import { create } from "zustand";
import { isInZone } from "@/lib/geo";
import type { LatLng } from "@/lib/geo";
import { aggregate, detectObservationFaults, detectSpeedingFaults, GpsSample, MockResult } from "@/lib/scoring/engine";
import { creditCount, habitualWarnings, marksToFaults, type Mark, type MarkLevel } from "@/lib/examiner";
import type { Deviation, Route } from "@/types/db";

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
  marks: Mark[];
  /**
   * Off-route departures during this run. Lives in the store rather than in
   * mock.tsx because the screen navigates away to the result before anything
   * is saved, and a ref goes with it.
   */
  deviations: Deviation[];
  start: (route: Route, now?: number) => void;
  onSample: (s: GpsSample) => void;
  tapMirrors: () => void;
  addMark: (category: string, level: MarkLevel, at?: LatLng | null, now?: number) => void;
  undoMark: () => void;
  /** Record one departure. Never a mark: leaving the route is not a fault. */
  addDeviation: (d: Deviation) => void;
  warnings: () => { category: string; label: string; count: number }[];
  finish: (now?: number) => MockResult;
  reset: () => void;
};

const initial = {
  phase: "idle" as MockPhase, route: null, startedAt: 0, samples: [],
  activeZoneIdx: null, activeTapped: false, zoneOutcomes: [], result: null,
  marks: [] as Mark[], deviations: [] as Deviation[],
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
  addMark: (category, level, at = null, now = Date.now()) =>
    set({ marks: [...get().marks, { category, level, t: now, at }] }),

  // Mis-taps in a moving car are certain, and a stray major would otherwise
  // fail the test silently.
  undoMark: () => set({ marks: get().marks.slice(0, -1) }),
  addDeviation: (d) => set({ deviations: [...get().deviations, d] }),

  warnings: () => habitualWarnings(get().marks),

  finish: (now = Date.now()) => {
    const { route, samples, startedAt, activeZoneIdx, activeTapped, zoneOutcomes, marks } = get();
    const outcomes = activeZoneIdx !== null
      ? [...zoneOutcomes, { zoneIdx: activeZoneIdx, tapped: activeTapped }]
      : zoneOutcomes;
    const coords = (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ lat, lng }));
    const faults = [
      ...detectSpeedingFaults(samples, coords, route?.speed_profile ?? []),
      ...detectObservationFaults(outcomes.map((o) => ({ zone: route!.observation_zones[o.zoneIdx], tapped: o.tapped }))),
      ...marksToFaults(marks),
    ];
    const aggregateResult = aggregate(faults, Math.round((now - startedAt) / 1000), creditCount(marks));
    const result: MockResult = samples.length > 0
      ? aggregateResult
      : { ...aggregateResult, assessable: false, passed: false, score: 0 };
    set({ phase: "finished", result, zoneOutcomes: outcomes, activeZoneIdx: null });
    return result;
  },
  reset: () => set({ ...initial }),
}));
