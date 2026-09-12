import { Pressable, Text, View } from "react-native";
import { FACES } from "@/ui/type";

export function SegmentedControl({
  options, selectedIndex, onChange, accessibilityLabels, subLabels,
}: {
  options: string[];
  selectedIndex: number;
  onChange: (i: number) => void;
  /**
   * A per-segment accessibility label, for when the visible text alone is not
   * enough to identify the control — the paywall's segments need "Weekly
   * plan" rather than the bare "Weekly" that VoiceOver would otherwise read.
   * Falls back to the visible label when omitted, so every existing caller is
   * unaffected.
   */
  accessibilityLabels?: string[];
  /** A second line under the label — the paywall's per-plan price. */
  subLabels?: string[];
}) {
  return (
    <View className="flex-row rounded-[9px] bg-slate-200/70 p-[2px]">
      {options.map((label, i) => {
        const selected = i === selectedIndex;
        return (
          <Pressable
            key={label}
            onPress={() => onChange(i)}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabels?.[i] ?? label}
            accessibilityState={{ selected }}
            className={`min-h-[32px] flex-1 items-center justify-center gap-0.5 rounded-[7px] py-1 ${selected ? "bg-card" : ""}`}
            style={selected ? { shadowColor: "#221F1C", shadowOpacity: 0.14, shadowRadius: 2.5, shadowOffset: { width: 0, height: 1 } } : undefined}
          >
            <Text
              className={`text-[12px] ${selected ? "text-primary" : "text-slate-500"}`}
              style={{ fontFamily: FACES["600"] }}
            >
              {label}
            </Text>
            {subLabels?.[i] != null && (
              <Text
                className={`text-[11px] ${selected ? "text-primary" : "text-slate-500"}`}
                style={{ fontFamily: FACES["400"] }}
              >
                {subLabels[i]}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
