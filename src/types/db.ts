export type SpeedProfileSegment = { startIdx: number; endIdx: number; limitMph: 20 | 30 | 40 | 60 | 70 };
export type ObservationZone = { lat: number; lng: number; radiusM: number; kind: "roundabout" | "junction" | "pedestrian" };
export type GeoLineString = { type: "LineString"; coordinates: [number, number][] }; // [lng, lat]
export type GeoPolygon = { type: "Polygon"; coordinates: [number, number][][] }; // [lng, lat]

// A single turn-by-turn navigation step (precomputed from OSRM at seed time).
export type NavStep = {
  lat: number; lng: number;   // where the maneuver happens
  instruction: string;         // e.g. "Turn right onto Watford Way"
  road: string;                // road name after the maneuver ("" if unknown)
  type: string;                // OSRM maneuver type (turn, roundabout, arrive, …)
  modifier: string;            // OSRM modifier (left, right, slight left, …; "" if none)
  distanceM: number;           // length of this step, maneuver → next maneuver
};

export type Centre = {
  id: string; name: string; address: string; lat: number; lng: number;
  pass_rate: number | null; pass_rate_history: number[]; test_types: string[]; region: string | null;
};
export type Route = {
  id: string; centre_id: string; name: string; geometry: GeoLineString;
  estimated_minutes: number | null; distance_km: number | null; difficulty: 1 | 2 | 3 | 4 | 5;
  speed_profile: SpeedProfileSegment[]; observation_zones: ObservationZone[]; steps: NavStep[];
};
export type Hazard = {
  id: string; route_id: string; lat: number; lng: number;
  type: "roundabout" | "zebra" | "narrow" | "junction"; description: string;
  severity: "low" | "medium" | "high";
};
export type ProgressEntry = {
  id?: string; user_id: string; route_id: string; completed_at?: string;
  mock_test_score: number | null; mistakes: string[]; duration_seconds: number;
};
