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
  /**
   * "go" is the normal green drive; "off" is the amber off-route state.
   *
   * Same geometry and same position in both, because a driver mid-turn should
   * not have to re-find the banner — only its colour and its eyebrow change.
   */
  tone?: "go" | "off";
  /**
   * Replaces the formatted distance, e.g. "Rejoining ahead". Off route there
   * is no meaningful distance to the next manoeuvre yet: the return leg is
   * still being fetched, and a number that turns out to be wrong is worse than
   * a word that is right.
   */
  distanceLabel?: string | null;
};

/**
 * The turn-by-turn banner. Shared by the practice and mock test screens, which
 * both drive an approach leg to the start line and have to narrate it the same
 * way. Positioning belongs to the caller.
 */
export function ManeuverBanner({
  eyebrow = null, fallback = false, fallbackText = "Head toward the start point",
  step, next, arriveLabel, distanceM, tone = "go", distanceLabel = null,
}: ManeuverBannerProps) {
  // Amber is the app's hazard colour, and it already means "look here" on the
  // observation zones. Off route is exactly that: not an error, but the one
  // place on the screen the driver has to attend to.
  const off = tone === "off";
  const stripBg = off ? "#7C4A06" : "#064E3B";
  const stripFg = off ? "#FCD9A0" : "#6EE7B7";
  return (
    <View className="overflow-hidden rounded-2xl bg-primary" style={{ shadowColor: "#221F1C", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }}>
      {eyebrow && (
        <View className="flex-row items-center gap-1.5 px-4 py-1.5" style={{ backgroundColor: stripBg }}>
          <Ionicons name={off ? "warning-outline" : "flag-outline"} size={12} color={stripFg} />
          <Text className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: stripFg }}>{eyebrow}</Text>
        </View>
      )}
      <View className="flex-row items-center gap-3 px-4 py-3.5">
        <View className={`h-12 w-12 items-center justify-center rounded-xl ${fallback ? "bg-slate-600" : off ? "bg-warning" : "bg-accent"}`}>
          <Ionicons name={fallback ? "navigate" : maneuverIcon(step)} size={26} color="#fff" />
        </View>
        <View className="flex-1">
          {(distanceLabel !== null || distanceM !== null) && (
            <Text className="text-[13px] font-semibold" style={{ color: stripFg }}>
              {distanceLabel ?? formatDistance(distanceM!)}
            </Text>
          )}
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
