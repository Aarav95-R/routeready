import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { formatDistance } from "@/lib/navigation";
import type { NavStep } from "@/types/db";

export function maneuverIcon(step?: NavStep): keyof typeof Ionicons.glyphMap {
  if (!step) return "navigate";
  if (step.type === "arrive") return "flag";
  if (step.type === "depart") return "navigate";
  if (step.type.includes("roundabout") || step.type === "rotary") return "sync";
  const m = step.modifier;
  if (m.includes("uturn")) return "arrow-undo";
  if (m.includes("left")) return "arrow-back";
  if (m.includes("right")) return "arrow-forward";
  return "arrow-up";
}

export type ManeuverBannerProps = {
  /** Small header above the manoeuvre, e.g. which leg is being driven. */
  eyebrow?: string | null;
  /**
   * No usable step list — a direct-line heading is all there is. The icon goes
   * grey and the distance is the crow-flies one, so the banner cannot be
   * mistaken for turn-by-turn it does not have.
   */
  fallback?: boolean;
  fallbackText?: string;
  step?: NavStep;
  next?: NavStep;
  /** Replaces "then …" when the next step is the arrival at the destination. */
  arriveLabel?: string;
  distanceM: number | null;
};

/**
 * The turn-by-turn banner. Shared by the practice and mock test screens, which
 * both drive an approach leg to the start line and have to narrate it the same
 * way. Positioning belongs to the caller.
 */
export function ManeuverBanner({
  eyebrow = null, fallback = false, fallbackText = "Head toward the start point",
  step, next, arriveLabel, distanceM,
}: ManeuverBannerProps) {
  return (
    <View className="overflow-hidden rounded-2xl bg-primary" style={{ shadowColor: "#0F172A", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }}>
      {eyebrow && (
        <View className="flex-row items-center gap-1.5 px-4 py-1.5" style={{ backgroundColor: "#064E3B" }}>
          <Ionicons name="flag-outline" size={12} color="#6EE7B7" />
          <Text className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">{eyebrow}</Text>
        </View>
      )}
      <View className="flex-row items-center gap-3 px-4 py-3.5">
        <View className={`h-12 w-12 items-center justify-center rounded-xl ${fallback ? "bg-slate-600" : "bg-accent"}`}>
          <Ionicons name={fallback ? "navigate" : maneuverIcon(step)} size={26} color="#fff" />
        </View>
        <View className="flex-1">
          {distanceM !== null && <Text className="text-[13px] font-semibold text-emerald-300">{formatDistance(distanceM)}</Text>}
          <Text className="text-[17px] font-semibold leading-[21px] text-white" numberOfLines={2}>
            {fallback ? fallbackText : step?.instruction ?? "Follow the route"}
          </Text>
        </View>
      </View>
      {!fallback && next && (
        <View className="flex-row items-center gap-2 border-t border-white/10 bg-white/5 px-4 py-2">
          <Ionicons name={maneuverIcon(next)} size={14} color="#94A3B8" />
          <Text className="flex-1 text-[12px] text-slate-300" numberOfLines={1}>
            {arriveLabel && next.type === "arrive" ? arriveLabel : `then ${next.instruction}`}
          </Text>
        </View>
      )}
    </View>
  );
}
