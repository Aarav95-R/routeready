import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import Svg, { Path } from "react-native-svg";
import { appleAvailable, googleConfigured } from "@/lib/socialAuth";
import type { SocialProvider } from "@/stores/sessionStore";
import { colors } from "@/ui/theme";
import { headline, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * Continue with Apple, continue with Google.
 *
 * **Why these two are not rows in a `Group`.** Every other secondary action
 * on an auth screen is a flush row inside the grouped inset list, and these
 * are not, because neither button's appearance is ours to choose. Apple
 * specifies its button down to the corner radius and reviews apps against it,
 * and Google specifies its own; a flush row with a hairline above it is
 * neither. So they sit as two standalone buttons at exactly `AuthAction`'s
 * geometry — same 16pt margins, same 50pt height, same 13pt radius — which is
 * the closest the app's idiom can get while still being the buttons the
 * providers require.
 *
 * Apple's is the **native** button rather than a drawing of one. A custom
 * Apple button is permitted, but only within a spec covering the mark, the
 * title, the metrics and the type — and this app sets its own face on every
 * other piece of text, which is exactly the sort of deviation that gets found
 * in review. The native control cannot be wrong, and it costs nothing here.
 *
 * Neither introduces a colour. Apple's is black and Google's is white on a
 * hairline, so the accent stays the road's and clay stays the person's.
 */

/** The official four-colour G. Google's mark is theirs; it is not restyled. */
function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

const HEIGHT = 50;
const RADIUS = 13;

export function SocialAuthButtons({
  onPress, busy,
}: {
  onPress: (provider: SocialProvider) => void;
  /** Which sheet is open, or null. Both buttons refuse while either is. */
  busy: SocialProvider | null;
}) {
  const [apple, setApple] = useState(false);

  /**
   * Asked once, on mount, because the answer cannot change while the screen
   * is up. `live` is the usual guard: this screen is leavable — "Create an
   * account" is one tap away — and the check can outlive it.
   */
  useEffect(() => {
    let live = true;
    appleAvailable().then((ok) => { if (live) setApple(ok); });
    return () => { live = false; };
  }, []);

  // One sheet at a time. Two open exchanges would race for the same session,
  // and the slower would set its own over the faster one's.
  const idle = busy === null;
  // Read once per render rather than held in state: it is inlined at build
  // time, so it cannot change while the app is running.
  const google = googleConfigured();

  return (
    <View style={{ gap: 10 }}>
      {apple && (
        <View style={{ marginHorizontal: 16, height: HEIGHT, opacity: idle ? 1 : 0.35 }}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={RADIUS}
            style={{ width: "100%", height: HEIGHT }}
            // The native button has no disabled state, so the guard is here.
            // Dropping the tap is what "one sheet at a time" means; the
            // dimming above is what says so.
            onPress={() => { if (idle) onPress("apple"); }}
          />
        </View>
      )}

      {google && (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        accessibilityState={{ disabled: !idle, busy: busy === "google" }}
        disabled={!idle}
        onPress={() => onPress("google")}
        style={{
          marginHorizontal: 16,
          minHeight: HEIGHT,
          borderRadius: RADIUS,
          // White rather than `colors.cell`: this is Google's light button,
          // and the ground it specifies is white.
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: colors.separator,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          opacity: idle ? 1 : 0.35,
        }}
      >
        {busy === "google" ? (
          <View testID="google-spinner">
            <ActivityIndicator color={colors.labelSecondary} />
          </View>
        ) : (
          <GoogleMark />
        )}
        <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: colors.label }}>
          Continue with Google
        </Text>
      </Pressable>
      )}
    </View>
  );
}
