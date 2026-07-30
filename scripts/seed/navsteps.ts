// The nav-step formatting lives in src/lib so the app runtime (route-to-start
// directions) and the seed pipeline share one source of truth.
export { buildNavSteps, formatInstruction } from "../../src/lib/navsteps";
export type { OsrmManeuver, OsrmStep } from "../../src/lib/navsteps";
