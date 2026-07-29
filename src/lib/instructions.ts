import { bearingDeg, haversineM, LatLng, turnAngleDeg } from "./geo";

export type Instruction = { idx: number; point: LatLng; text: string };
export const TRIGGER_DISTANCE_M = 183; // ≈ 200 yards

export function deriveInstructions(coords: LatLng[]): Instruction[] {
  const out: Instruction[] = [];
  for (let i = 1; i < coords.length - 1; i++) {
    const angle = turnAngleDeg(bearingDeg(coords[i - 1], coords[i]), bearingDeg(coords[i], coords[i + 1]));
    const abs = Math.abs(angle);
    if (abs < 45) continue;
    const text =
      abs >= 120
        ? "In 200 yards, at the roundabout, take the next exit"
        : `In 200 yards, turn ${angle > 0 ? "right" : "left"}`;
    out.push({ idx: i, point: coords[i], text });
  }
  out.push({ idx: coords.length - 1, point: coords[coords.length - 1], text: "You have reached the end of the route" });
  return out;
}

export function nextInstruction(pos: LatLng, instructions: Instruction[], spokenIdxs: Set<number>): Instruction | null {
  for (const ins of instructions) {
    if (spokenIdxs.has(ins.idx)) continue;
    if (haversineM(pos, ins.point) <= TRIGGER_DISTANCE_M) return ins;
  }
  return null;
}
