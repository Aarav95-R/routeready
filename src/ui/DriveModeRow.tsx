import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";

/**
 * "practice" is a lesson, "test" is an exam, and the row has to say which
 * before it is read. Two white cards with small tinted squares asked a learner
 * to read first; a full wash tells them apart at arm's length, which is the
 * whole job of the screen these sit on.
 *
 * The hues are the app's own — accent guides, warning marks — so no new
 * meaning enters the palette. Everything below is a wash or an outline of one
 * of those two, and the type on each block is darkened from the same hue so it
 * belongs to its ground rather than sitting on it.
 */
export type DriveMode = "practice" | "test";

const TONE: Record<DriveMode, {
  icon: "navigate" | "stopwatch-outline";
  bg: string; border: string; tile: string; stroke: string; body: string; chevron: string;
}> = {
  practice: {
    icon: "navigate",
    // The alphas are the accent and accentPressed at 16% and 42%. They are
    // written out because a colour token cannot carry an alpha.
    bg: "#E8F2ED", border: "#CBE3D8", tile: "rgba(26,135,94,0.16)",
    stroke: colors.accentPressed, body: "#3D5B4F", chevron: "rgba(20,107,74,0.42)",
  },
  test: {
    icon: "stopwatch-outline",
    bg: "#FAF0E3", border: "#EED9BC", tile: "rgba(217,119,6,0.16)",
    stroke: "#B45309", body: "#6B5233", chevron: "rgba(180,83,9,0.42)",
  },
};

/**
 * One way to drive a route, offered as a block rather than a button.
 *
 * A pair of equal green pills would say "these are the same thing twice". A
 * full-width block with a chevron is the iOS idiom for "this leads somewhere",
 * and it leaves room to say what the mode actually does — which is the whole
 * reason the chooser screen exists.
 *
 * No shadow: a wash on a warm ground separates on its own, and a drop shadow
 * under a tint is what makes an interface look plastic.
 *
 * Presentational only: it neither reads progress nor navigates. The screen
 * owns both, so this can be rendered before the route has loaded.
 */
export function DriveModeRow({
  mode, title, description, history = null, index = 0, onPress,
}: {
  mode: DriveMode;
  title: string;
  description: string;
  /** Past results, shown only when this route has any. */
  history?: string | null;
  index?: number;
  onPress: () => void;
}) {
  const tone = TONE[mode];

  return (
    <Animated.View entering={enterFrom(index)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={description}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
        className="flex-row items-start gap-3 rounded-[20px] border p-[15px] active:scale-[0.98]"
        style={{ backgroundColor: tone.bg, borderColor: tone.border }}
      >
        <View testID={`mode-icon-${mode}`} className="h-[38px] w-[38px] items-center justify-center rounded-xl" style={{ backgroundColor: tone.tile }}>
          <Ionicons name={tone.icon} size={20} color={tone.stroke} />
        </View>
        <View className="flex-1">
          <Text className="text-[15.5px] font-semibold tracking-tight text-primary">{title}</Text>
          <Text className="mt-[3px] text-[12px] leading-[17px]" style={{ color: tone.body }}>{description}</Text>
          {history && <Text className="mt-2 text-[11.5px] font-semibold" style={{ color: tone.stroke }}>{history}</Text>}
        </View>
        {/* A cool grey chevron is the one place the old palette would still
            show through a wash, so each takes its own block's deep tone. */}
        <View className="self-center">
          <Ionicons name="chevron-forward" size={16} color={tone.chevron} />
        </View>
      </Pressable>
    </Animated.View>
  );
}
