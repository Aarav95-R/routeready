import { useState } from "react";

/**
 * A pressed flag, because Pressable's own one cannot be used here.
 *
 * The idiomatic way to tint a pressed control is Pressable's style callback:
 *
 *     style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
 *
 * This app cannot use it. NativeWind 4.2.6 is installed with
 * `jsxImportSource: "nativewind"` (babel.config.js), which wraps every
 * component so it can resolve `className` — and it never invokes the function
 * form of `style`. A Pressable given one renders with **no style at all**: no
 * background, no padding, no flexDirection. It fails silently, and no test
 * catches it because React Native Testing Library does not resolve layout.
 *
 * So the flag is tracked here and applied as a plain object instead. Spread the
 * result into a single style object rather than an array, so there is one
 * shape for NativeWind to resolve:
 *
 *     const { pressed, pressProps } = usePressed();
 *     <Pressable {...pressProps} style={{ ...base, opacity: pressed ? 0.8 : 1 }} />
 */
export function usePressed() {
  const [pressed, setPressed] = useState(false);
  return {
    pressed,
    pressProps: {
      onPressIn: () => setPressed(true),
      onPressOut: () => setPressed(false),
    },
  };
}
