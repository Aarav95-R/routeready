import { Text, View } from "react-native";
import type { Hazard } from "@/types/db";
import { colors } from "@/ui/theme";

/**
 * Severity as a chip, on a scale that never uses green.
 *
 * The route detail page this list came from coloured medium in the app's
 * accent — the same green that means guidance, go, and road still to drive.
 * A moderate risk drawn in the "safe" colour is the one mistake a hazard list
 * cannot make, so medium takes amber (already the hazard colour on every map)
 * and high takes the danger red already on the Stop button.
 *
 * Medium is outlined rather than filled, and that is not decoration. The mock
 * test block further up this same screen is a filled amber wash, so a filled
 * amber chip below it reads as a smaller sibling of that block instead of as
 * a severity. Filled amber is a surface; outlined amber is a mark. High can
 * stay filled because nothing else on the screen is red.
 */
const SEV: Record<Hazard["severity"], { label: string; bg: string; border: string; fg: string }> = {
  low: { label: "Low", bg: colors.surface, border: colors.line, fg: colors.ink3 },
  medium: { label: "Medium", bg: "transparent", border: "rgba(217,119,6,0.45)", fg: "#B45309" },
  high: { label: "High", bg: "rgba(220,38,38,0.10)", border: "rgba(220,38,38,0.30)", fg: "#B91C1C" },
};

/**
 * One hazard, numbered to match its mark on the route drawing above.
 *
 * The number is not decoration: it is the order the hazards are met in on the
 * drive, and it is the only thing tying a row to a place. The old page had
 * markers on a map and rows in a list with nothing joining them.
 */
export function HazardRow({ hazard, number }: { hazard: Hazard; number: number }) {
  const sev = SEV[hazard.severity];

  return (
    <View
      accessibilityLabel={`Hazard ${number}, ${hazard.type}, ${sev.label} severity`}
      className="flex-row items-start gap-2.5 rounded-[14px] border border-slate-200 bg-card px-3 py-2.5"
    >
      <View className="mt-0.5 h-[19px] w-[19px] items-center justify-center rounded-full bg-warning">
        <Text className="text-[9.5px] font-bold text-white">{number}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-[13px] font-semibold capitalize text-primary">{hazard.type}</Text>
        <Text className="mt-0.5 text-[11px] leading-[15px] text-slate-600">{hazard.description}</Text>
      </View>
      <View testID={`severity-${hazard.severity}`} className="mt-0.5 rounded-md border px-1.5 py-0.5" style={{ backgroundColor: sev.bg, borderColor: sev.border }}>
        <Text className="text-[9px] font-bold uppercase tracking-wider" style={{ color: sev.fg }}>{sev.label}</Text>
      </View>
    </View>
  );
}
