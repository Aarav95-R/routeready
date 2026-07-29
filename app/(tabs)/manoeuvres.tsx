import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Manoeuvres() {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center">
        <Text className="text-[15px] font-semibold text-slate-400">Coming in Phase 2</Text>
      </View>
    </SafeAreaView>
  );
}
