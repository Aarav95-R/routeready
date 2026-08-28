import { ActivityIndicator, View } from "react-native";
import { colors } from "@/ui/theme";

/**
 * `routeready://auth-callback` — where every emailed link (signup
 * confirmation, magic link, password recovery) actually lands.
 *
 * It renders almost nothing on purpose. The tokens in the URL fragment are
 * read and applied by the `Linking` listener in `app/_layout.tsx`, not by
 * this screen; this file exists only so expo-router's own linking has a real
 * route to match. Without it, opening the link cold-starts the app straight
 * into expo-router's built-in "Unmatched Route" 404 — there is no
 * `app/(auth)/auth-callback.tsx` sibling to fall back to, since the URL has
 * no group prefix. The root layout's redirect effect (`nextAuthRoute`) sends
 * the person on within a render or two, the instant `session` or
 * `recovering` updates; this spinner is what's visible in between.
 */
export default function AuthCallback() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.field }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
