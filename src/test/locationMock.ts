// Stand-in for expo-location. The watchers hand their callbacks back to the
// test so a drive can be played through a screen fix by fix, rather than the
// test waiting on a device that is not there.

export const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 };

type PositionCb = (loc: { coords: Coords; timestamp: number }) => void;
type HeadingCb = (h: { trueHeading: number; magHeading: number; accuracy: number }) => void;
type PositionErrorCb = (message: string) => void;
type Coords = {
  latitude: number; longitude: number; altitude: number | null; accuracy: number | null;
  altitudeAccuracy: number | null; heading: number | null; speed: number | null;
};

export const watchers: { position: PositionCb | null; heading: HeadingCb | null } = {
  position: null,
  heading: null,
};

export let positionError: PositionErrorCb | null = null;
let nextTimestamp = Date.now();

const coords = (
  lat: number,
  lng: number,
  speedMps = 0,
  heading: number | null = null,
  accuracyM = 5,
): Coords => ({
  latitude: lat, longitude: lng, altitude: null, accuracy: accuracyM,
  altitudeAccuracy: null, heading, speed: speedMps,
});

export type EmitFixOptions = {
  speedMps?: number;
  timestamp?: number;
  accuracyM?: number;
  heading?: number | null;
};

/** Deliver one fix to whatever screen is currently watching. */
export const emitFix = (
  lat: number,
  lng: number,
  options: EmitFixOptions | number = {},
  legacyTimestamp?: number,
) => {
  const normalized = typeof options === "number" ? { speedMps: options, timestamp: legacyTimestamp } : options;
  const timestamp = normalized.timestamp ?? (nextTimestamp += 1_500);
  watchers.position?.({
    coords: coords(lat, lng, normalized.speedMps ?? 0, normalized.heading ?? null, normalized.accuracyM ?? 5),
    timestamp,
  });
};

export const failPositionWatch = (message: string) => positionError?.(message);

export const requestForegroundPermissionsAsync = jest.fn(async () => ({ status: "granted" }));
export const getForegroundPermissionsAsync = jest.fn(async () => ({ status: "granted" }));
export const getLastKnownPositionAsync = jest.fn(async () => null as null | { coords: Coords });
export const getCurrentPositionAsync = jest.fn(async () => ({ coords: coords(0, 0), timestamp: 0 }));

export const watchHeadingAsync = jest.fn(async (cb: HeadingCb) => {
  watchers.heading = cb;
  return { remove: () => { watchers.heading = null; } };
});
export const watchPositionAsync = jest.fn(async (_opts: unknown, cb: PositionCb, onError?: PositionErrorCb) => {
  watchers.position = cb;
  positionError = onError ?? null;
  return { remove: () => { watchers.position = null; positionError = null; } };
});

/** Call from beforeEach: clears watchers and any per-test return values. */
export const resetLocationMock = () => {
  watchers.position = null;
  watchers.heading = null;
  positionError = null;
  nextTimestamp = Date.now();
  requestForegroundPermissionsAsync.mockResolvedValue({ status: "granted" });
  getForegroundPermissionsAsync.mockResolvedValue({ status: "granted" });
  getLastKnownPositionAsync.mockResolvedValue(null);
  getCurrentPositionAsync.mockResolvedValue({ coords: coords(0, 0), timestamp: 0 });
};

export const setCurrentPosition = (lat: number, lng: number) =>
  getCurrentPositionAsync.mockImplementation(async () => ({ coords: coords(lat, lng), timestamp: Date.now() }));

export const setLastKnownPosition = (lat: number, lng: number) =>
  getLastKnownPositionAsync.mockResolvedValue({ coords: coords(lat, lng) });
