// Stand-in for expo-location. The watchers hand their callbacks back to the
// test so a drive can be played through a screen fix by fix, rather than the
// test waiting on a device that is not there.

export const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 };

type PositionCb = (loc: { coords: Coords; timestamp: number }) => void;
type HeadingCb = (h: { trueHeading: number; magHeading: number; accuracy: number }) => void;
type Coords = {
  latitude: number; longitude: number; altitude: number | null; accuracy: number | null;
  altitudeAccuracy: number | null; heading: number | null; speed: number | null;
};

export const watchers: { position: PositionCb | null; heading: HeadingCb | null } = {
  position: null,
  heading: null,
};

const coords = (lat: number, lng: number, speedMps = 0, heading: number | null = null): Coords => ({
  latitude: lat, longitude: lng, altitude: null, accuracy: 5,
  altitudeAccuracy: null, heading, speed: speedMps,
});

/** Deliver one fix to whatever screen is currently watching. */
export const emitFix = (lat: number, lng: number, speedMps = 0, t = 1_700_000_000_000) =>
  watchers.position?.({ coords: coords(lat, lng, speedMps), timestamp: t });

export const requestForegroundPermissionsAsync = jest.fn(async () => ({ status: "granted" }));
export const getForegroundPermissionsAsync = jest.fn(async () => ({ status: "granted" }));
export const getLastKnownPositionAsync = jest.fn(async () => null as null | { coords: Coords });
export const getCurrentPositionAsync = jest.fn(async () => ({ coords: coords(0, 0), timestamp: 0 }));

export const watchHeadingAsync = jest.fn(async (cb: HeadingCb) => {
  watchers.heading = cb;
  return { remove: () => { watchers.heading = null; } };
});
export const watchPositionAsync = jest.fn(async (_opts: unknown, cb: PositionCb) => {
  watchers.position = cb;
  return { remove: () => { watchers.position = null; } };
});

/** Call from beforeEach: clears watchers and any per-test return values. */
export const resetLocationMock = () => {
  watchers.position = null;
  watchers.heading = null;
  requestForegroundPermissionsAsync.mockResolvedValue({ status: "granted" });
  getForegroundPermissionsAsync.mockResolvedValue({ status: "granted" });
  getLastKnownPositionAsync.mockResolvedValue(null);
  getCurrentPositionAsync.mockResolvedValue({ coords: coords(0, 0), timestamp: 0 });
};

export const setCurrentPosition = (lat: number, lng: number) =>
  getCurrentPositionAsync.mockResolvedValue({ coords: coords(lat, lng), timestamp: 0 });

export const setLastKnownPosition = (lat: number, lng: number) =>
  getLastKnownPositionAsync.mockResolvedValue({ coords: coords(lat, lng) });
