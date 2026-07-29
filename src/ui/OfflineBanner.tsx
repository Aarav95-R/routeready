import { Text, View } from "react-native";

export function OfflineBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View className="mx-4 mb-2 rounded-lg bg-warning/10 px-3 py-2">
      <Text className="text-[12px] font-semibold text-warning">Offline — showing saved data</Text>
    </View>
  );
}
