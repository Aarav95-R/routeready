import type { ProgressEntry } from "@/types/db";

// Everything the home screen says about you, derived from the rows
// `listMyProgress` returns and nothing else. Kept out of the screen so the
// sentence under your name can be tested without mounting a chart.

const NUMBERS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** Past nine, words read worse than the numeral does — as in routeSummary. */
function spell(n: number): string {
  return n < 10 ? NUMBERS[n] : String(n);
}

/** Morning until noon, afternoon until five, evening after that. */
export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * "Sumeet Raheja" -> "Sumeet". Only the first word is ever greeted: a person
 * who types their full name is not asking to be addressed by all of it.
 */
export function firstName(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] ?? "";
}

export type Attempt = { score: number; at: number | null };

export type ScoreSummary = {
  /** Oldest first — the order the sparkline plots. */
  attempts: Attempt[];
  count: number;
  latest: number | null;
  best: number | null;
  /** Latest minus the one before it. Null until there are two. */
  delta: number | null;
  lastAt: number | null;
};

/**
 * Only mock tests carry a score, so practice drives fall out here and never
 * reach the chart. Rows whose `completed_at` has not come back from the server
 * yet keep their position at the end rather than being dropped: an attempt
 * taken offline is still an attempt.
 */
export function scoreSummary(rows: ProgressEntry[]): ScoreSummary {
  const scored = rows.filter((r) => typeof r.mock_test_score === "number");
  const attempts: Attempt[] = scored
    .map((r) => {
      const t = Date.parse(r.completed_at ?? "");
      return { score: r.mock_test_score as number, at: Number.isFinite(t) ? t : null };
    })
    .sort((a, b) => {
      if (a.at === null) return b.at === null ? 0 : 1;
      if (b.at === null) return -1;
      return a.at - b.at;
    });

  const count = attempts.length;
  if (count === 0) {
    return { attempts, count, latest: null, best: null, delta: null, lastAt: null };
  }

  const latest = attempts[count - 1].score;
  return {
    attempts,
    count,
    latest,
    best: Math.max(...attempts.map((a) => a.score)),
    delta: count > 1 ? latest - attempts[count - 2].score : null,
    lastAt: attempts[count - 1].at,
  };
}

const FORTNIGHT_MS = 14 * 24 * 60 * 60 * 1000;

/** Trailing attempts scoring above the mean of every attempt. */
function streakAboveAverage(attempts: Attempt[]): number {
  const mean = attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length;
  let run = 0;
  for (let i = attempts.length - 1; i >= 0 && attempts[i].score > mean; i--) run++;
  return run;
}

/**
 * The one line under your name. It is the only part of the screen that changes
 * tone with how you are actually doing, so the order matters: a fortnight away
 * is worth saying before anything about scores, and a dip is stated rather
 * than scolded.
 */
export function finding(s: ScoreSummary, now: Date): string {
  if (s.count === 0) return "Let's find out where you're starting from.";

  if (s.lastAt !== null && now.getTime() - s.lastAt >= FORTNIGHT_MS) {
    return "It's been a fortnight since your last mock test.";
  }
  if (s.count === 1) return "Your first mock test is on the board.";
  if (s.latest === s.best) return "That's your best yet.";

  const streak = streakAboveAverage(s.attempts);
  if (streak >= 3) return `${spell(streak)} tests in a row above your average.`;

  const delta = s.delta ?? 0;
  if (delta > 0) return `Up ${delta} on your last.`;
  if (delta < 0) return `${-delta} down on your last — it happens.`;
  return "Level with your last.";
}

export type FaultCount = { tag: string; count: number };

/**
 * Which fault kinds keep recurring, most frequent first. Ties break
 * alphabetically so the panel does not reshuffle between identical loads.
 *
 * `mistakes` holds one entry per fault, tagged by kind — so this counts how
 * often a kind appears across tests, which is all the column can support.
 */
export function faultCounts(rows: ProgressEntry[], limit = 3): FaultCount[] {
  const tally = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.mistakes ?? []) tally.set(tag, (tally.get(tag) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/**
 * The one thing worth doing next, and the evidence for it.
 *
 * Five shapes rather than one, because the honest answer changes with how much
 * there is to go on. `finding()` above does the smaller version of this job in
 * a single sentence; this is the version the lead card is built from.
 */
export type NextStep =
  | { kind: "first" }
  | { kind: "baseline"; tags: string[] }
  | { kind: "clean" }
  | { kind: "tied"; tags: string[] }
  | { kind: "fault"; tag: string; count: number; of: number; runners: FaultCount[] };

/**
 * `faults` is whatever `faultCounts` returned — already sorted descending with
 * ties broken alphabetically, so the runner-up is simply `faults[1]`.
 *
 * The order of these branches is the rule. A fault may lead only when there
 * are at least two tests *and* it strictly beats the runner-up. The two-test
 * floor is not decoration: `aggregate` dedupes `tags` per test, so a single
 * test tagged only "Speeding" produces one count of 1, which strictly beats a
 * runner-up that does not exist. Without the floor, one test would diagnose a
 * habit.
 */
export function nextStep(summary: ScoreSummary, faults: FaultCount[]): NextStep {
  if (summary.count === 0) return { kind: "first" };
  if (summary.count === 1) return { kind: "baseline", tags: faults.map((f) => f.tag) };
  if (faults.length === 0) return { kind: "clean" };

  const lead = faults[0];
  if (lead.count > (faults[1]?.count ?? 0)) {
    return {
      kind: "fault",
      tag: lead.tag,
      count: lead.count,
      of: summary.count,
      runners: faults.slice(1),
    };
  }
  return { kind: "tied", tags: faults.filter((f) => f.count === lead.count).map((f) => f.tag) };
}

/** The mean of every scored attempt. Null when there are none to average. */
export function averageScore(summary: ScoreSummary): number | null {
  if (summary.count === 0) return null;
  return Math.round(summary.attempts.reduce((sum, a) => sum + a.score, 0) / summary.count);
}

/**
 * "41 min" — how long a drive took, on a history row.
 *
 * Not `formatElapsed` from resultView: that returns "41:00" and takes
 * milliseconds, because it is the running clock during a mock test. A clock
 * beside a date reads as a time of day. Floored at one minute so a drive
 * abandoned after twenty seconds does not report "0 min".
 */
export function durationWords(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/**
 * The drives the history list shows: scored, most recent first, capped.
 *
 * Generic over the row rather than taking `ProgressEntryWithRoute`, because
 * the only fields it reads are the two every progress row has — which keeps
 * this list-shaping rule here, beside the others, instead of in the component
 * that draws it.
 *
 * A row still queued offline has no `completed_at` and sorts to the front: it
 * is the most recent thing that happened, and `scoreSummary` already treats it
 * that way at the other end of its oldest-first ordering.
 */
export function recentDrives<
  T extends { mock_test_score: number | null; completed_at?: string },
>(rows: T[], limit = 3): T[] {
  const when = (row: T) => {
    const t = Date.parse(row.completed_at ?? "");
    return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
  };
  return rows
    .filter((row) => typeof row.mock_test_score === "number")
    .sort((a, b) => when(b) - when(a))
    .slice(0, limit);
}
