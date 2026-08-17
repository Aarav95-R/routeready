import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/ui/theme";

// Home leads, and it took the Progress placeholder's slot rather than adding a
// fifth tab — what that tab was reserved for is what Home now shows.
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: "#94A3B8",
      tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
    }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="centres" options={{ title: "Centres", tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="manoeuvres" options={{ title: "Manoeuvres", tabBarIcon: ({ color, size }) => <Ionicons name="car-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="quiz" options={{ title: "Quiz", tabBarIcon: ({ color, size }) => <Ionicons name="help-circle-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
