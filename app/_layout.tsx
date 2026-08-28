import "../global.css";
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { View } from "react-native";
import Mapbox from "@rnmapbox/maps";
import { nextAuthRoute } from "@/lib/authRoute";
import { useSession } from "@/stores/sessionStore";
import { useNetwork } from "@/stores/networkStore";
import { colors } from "@/ui/theme";
import { ErrorBoundary } from "@/ui/ErrorBoundary";

// Runtime token for displaying the Mapbox map.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? null);

export default function RootLayout() {
  // Exactly the three weights FACES names in src/ui/type.ts. A style whose
  // file is not loaded here falls back to the system face silently.
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold,
  });
  const { session, recovering, initialized, init } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => { init(); useNetwork.getState().init(); }, [init]);

  useEffect(() => {
    if (!initialized) return;
    const next = nextAuthRoute({ session, recovering, segments });
    if (next) router.replace(next);
  }, [session, recovering, initialized, segments, router]);

  if (!fontsLoaded || !initialized) return <View className="flex-1 bg-surface" />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Outside the Stack rather than inside it. A throw while a screen is
          mounting takes the navigator with it, so a boundary nested under the
          navigator would be unmounted by the very error it exists to catch. */}
      <ErrorBoundary>
        {/* The ground behind every route, including mid-transition. A literal
            here is what would flash the old colour on each push. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.field } }} />
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
