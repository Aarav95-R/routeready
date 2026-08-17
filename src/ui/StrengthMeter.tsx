import { Text, View } from "react-native";
import type { Level, Strength } from "@/lib/passwordStrength";
import { colors } from "@/ui/theme";
import { caption, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * Four segments and a label, driven entirely by a `Strength`.
 *
 * Presentational: it scores nothing and decides nothing. What it draws is a
 * pure function of its prop, which is why the scoring rules are tested in
 * `passwordStrength.test.ts` without rendering anything and the drawing is
 * tested here without scoring anything.
 *
 * The colours are the palette's own and carry no new meaning — danger while
 * the password is too short to be accepted, amber while it is accepted but
 * thin, the accent once it is genuinely good.
 *
 * It does not animate. The strength changes on nearly every keystroke, and a
 * bar that crossfades and re-scales that often is the busiest thing on the
 * screen — the exemption Reduce Motion would have to be given for it is the
 * tell. The state is shown; it simply arrives without travelling.
 */

const TONE: Record<Level, string> = {
  empty: colors.fill,
  short: colors.danger,
  weak: colors.warning,
  fair: colors.warning,
  good: colors.accent,
  strong: colors.accent,
};

export function StrengthMeter({ strength }: { strength: Strength }) {
  if (strength.level === "empty") return null;
  const tone = TONE[strength.level];

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 6 }}>
      <View
        // One announcement, not five. The label below already says the level,
        // and four unlabelled bars either side of it is noise.
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: "row", gap: 5 }}
      >
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            testID={`strength-segment-${i}`}
            style={{
              flex: 1, height: 4, borderRadius: 2,
              backgroundColor: i < strength.segments ? tone : colors.fill,
            }}
          />
        ))}
      </View>
      <Text
        accessibilityLiveRegion="polite"
        maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
        style={{ ...caption, color: strength.level === "short" ? colors.labelSecondary : tone }}
      >
        {strength.message}
      </Text>
    </View>
  );
}
