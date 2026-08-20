import { readFileSync } from "fs";
import { join } from "path";
import { sceneFor, SEEDED_NAMES } from "../manoeuvreScenes";
import { blurbFor, slugFor } from "../manoeuvreView";

/**
 * The seam between the copy and the geometry, asserted against the copy
 * itself.
 *
 * A manoeuvre's words come from the database and its poses come from the
 * bundle, joined on a name. Nothing at runtime can notice that a copy edit
 * added a seventh step or respelled a name — the diagram would just quietly
 * stop moving, or stop appearing. This is the only place that notices.
 */
const SEED = readFileSync(join(__dirname, "../../../supabase/seed.sql"), "utf8");

function seededSteps(name: string): number | null {
  const row = SEED.split("\n").find(
    (l) => l.includes("into manoeuvres") && l.includes(`'${name}'`)
  );
  return row === undefined ? null : (row.match(/"title":/g) ?? []).length;
}

test("the seed spells every name this build draws", () => {
  for (const name of SEEDED_NAMES) expect(seededSteps(name)).not.toBeNull();
});

test("each seeded manoeuvre has exactly one pose per step", () => {
  for (const name of SEEDED_NAMES) {
    expect({ name, poses: sceneFor(name)!.poses.length })
      .toEqual({ name, poses: seededSteps(name) });
  }
});

test("each seeded manoeuvre has a slug and a blurb", () => {
  for (const name of SEEDED_NAMES) {
    expect(slugFor(name)).not.toBeNull();
    expect(blurbFor(name)).not.toBe("");
  }
});
