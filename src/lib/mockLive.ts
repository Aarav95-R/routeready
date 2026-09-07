import { marksToFaults, type Mark } from "./examiner";
import { MAX_MINORS } from "./scoring/engine";

/**
 * What the drive would score if it ended now.
 *
 * The mock test screen used to report `3 min  0 maj  +1` — what had been
 * counted, never what it meant. DVSA's rule is `majors === 0 && minors <= 15`
 * and `aggregate()` applies exactly that, so the number worth showing at the
 * wheel is the headroom: how many driving faults are left.
 *
 * This used to add two things the phone had guessed at — missed observation
 * zones and speeding runs — because the result counted them too. It no longer
 * does, and neither does this: the meter now reports the mark sheet exactly,
 * which is the only thing that decides the verdict.
 */
export type LiveTally = {
  minors: number;
  majors: number;
  credits: number;
  /** Driving faults still allowed. Zero means the next one fails the test. */
  remaining: number;
  /** A serious fault has landed. The verdict is settled whatever else happens. */
  stopped: boolean;
};

export function liveTally(marks: Mark[]): LiveTally {
  // marksToFaults drops credits and unknown categories, which is the same
  // filtering finish() applies — so the live count and the final one agree.
  const marked = marksToFaults(marks);
  const minors = marked.filter((f) => f.severity === "minor").length;
  const majors = marked.filter((f) => f.severity === "major").length;

  return {
    minors,
    majors,
    credits: marks.filter((m) => m.level === "credit").length,
    remaining: Math.max(0, MAX_MINORS - minors),
    stopped: majors > 0,
  };
}

/**
 * How the headroom reads on the meter. Amber once two thirds of the allowance
 * is gone, because that is the point at which a driver still has room but has
 * stopped having much of it.
 */
export const METER_WARN_AT = 10;
