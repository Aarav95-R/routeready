import { create } from "zustand";

/**
 * A development-only switch for the screens you cannot reach from your own
 * account.
 *
 * The first-run home screen draws only for an account that has never driven
 * anything, which is nobody who is building the app: one seeded mock test and
 * it is gone for good. So it went unseen on a device while it was being
 * designed, and the only ways back were signing up with a throwaway address or
 * deleting rows out of the database.
 *
 * Nothing here is persisted and nothing here is reachable in a release build —
 * `app/settings.tsx` renders the control behind `__DEV__`, so the bundler
 * drops it. It stands in for the *data* rather than for the flag on the
 * screen: Home reads it as "pretend the record came back empty", so every
 * panel underneath is the real component with real empty inputs rather than a
 * second code path that can drift from the first.
 */
type DevPreviewState = {
  firstRun: boolean;
  setFirstRun: (on: boolean) => void;
};

export const useDevPreview = create<DevPreviewState>((set) => ({
  firstRun: false,
  setFirstRun: (on) => set({ firstRun: on }),
}));
