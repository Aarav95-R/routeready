import { Children, isValidElement, type ReactNode } from "react";
import { Pressable, Text, View, type ViewProps } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/ui/theme";
import { body, footnote, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * The grouped inset list — the structural spine of every re-dressed screen.
 *
 * Specified once, here, because it is the component that carries the platform's
 * feel: 16pt margins, a 10pt radius, 44pt rows, and a hairline inset from the
 * leading edge. That inset is the clearest single tell between a native list
 * and a table drawn in HTML, and it is the reason this is a component rather
 * than a className repeated on six screens.
 *
 * A group draws the separators between its own children rather than each cell
 * drawing its own, which is what keeps the last row of a group clean without
 * every caller having to know its own index.
 */

const SIDE = 16;

export function GroupHeader({ children }: { children: ReactNode }) {
  return (
    <Text
      maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
      style={{
        ...footnote,
        color: colors.labelTertiary,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        paddingHorizontal: SIDE + 20,
        paddingTop: 18,
        paddingBottom: 7,
      }}
    >
      {children}
    </Text>
  );
}

function Separator() {
  return (
    <View
      testID="separator"
      style={{ height: 1, marginLeft: SIDE, backgroundColor: colors.separator }}
    />
  );
}

export function Group({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View
      style={[
        { marginHorizontal: SIDE, backgroundColor: colors.cell, borderRadius: 10, overflow: "hidden" },
        style,
      ]}
      {...rest}
    >
      {rows.map((row, i) => (
        // Index keys are correct here: these are static rows in source order,
        // not a reorderable list.
        <View key={i}>
          {i > 0 && <Separator />}
          {row}
        </View>
      ))}
    </View>
  );
}

export function Cell({
  label, value, valueStrong = false, chevron = false, onPress, children, testID,
}: {
  label?: string;
  value?: string;
  valueStrong?: boolean;
  chevron?: boolean;
  onPress?: () => void;
  children?: ReactNode;
  testID?: string;
}) {
  const inner = children ?? (
    <>
      <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...body, color: colors.label }}>
        {label}
      </Text>
      <View style={{ flex: 1 }} />
      {value !== undefined && (
        <Text
          maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
          style={{
            ...body,
            fontVariant: ["tabular-nums"],
            color: valueStrong ? colors.label : colors.labelTertiary,
            fontWeight: valueStrong ? "600" : body.fontWeight,
          }}
        >
          {value}
        </Text>
      )}
    </>
  );

  const content = (
    <>
      {inner}
      {chevron && (
        // testID sits on the wrapper, not on Ionicons: the icon renders a bare
        // <Text /> with no props forwarded until its font loads, so a testID on
        // it is absent at first paint. DriveModeRow works around this the same
        // way.
        <View testID="chevron" style={{ marginLeft: 6, opacity: 0.7 }}>
          <Ionicons name="chevron-forward" size={16} color={colors.labelTertiary} />
        </View>
      )}
    </>
  );

  const style = {
    minHeight: 44,
    paddingHorizontal: SIDE,
    paddingVertical: 12,
    flexDirection: "row" as const,
    alignItems: "center" as const,
  };

  if (onPress) {
    return (
      <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={style}>
        {content}
      </Pressable>
    );
  }
  return <View testID={testID} style={style}>{content}</View>;
}
