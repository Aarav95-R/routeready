import "../global.css";
import { useEffect } from "react";
import * as Linking from "expo-linking";
import { Stack, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { View } from "react-native";
import Mapbox from "@rnmapbox/maps";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/stores/sessionStore";
import { useNetwork } from "@/stores/networkStore";
import { colors } from "@/ui/theme";

// Runtime token for displaying the Mapbox map.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? null);

export default function RootLayout() {
  // Exactly the three weights FACES names in src/ui/type.ts. A style whose
  // file is not loaded here falls back to the system face silently.
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold,
  });
  const { session, initialized, init } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => { init(); useNetwork.getState().init(); }, [init]);

  // Magic-link deep link: routeready://auth-callback#access_token=…&refresh_token=…
  useEffect(() => {
    const handle = async ({ url }: { url: string }) => {
      const params = new URLSearchParams(url.split("#")[1] ?? "");
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
    };
    const sub = Linking.addEventListener("url", handle);
    Linking.getInitialURL().then((url) => {
      if (url) handle({ url });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!initialized) return;
    const inAuth = segments[0] === "(auth)";
    if (!session && !inAuth) router.replace("/(auth)/sign-in");
    if (session && inAuth) router.replace("/(tabs)");
  }, [session, initialized, segments, router]);

  if (!fontsLoaded || !initialized) return <View className="flex-1 bg-surface" />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* The ground behind every route, including mid-transition. A literal
          here is what would flash the old colour on each push. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.field } }} />
    </GestureHandlerRootView>
  );
}
