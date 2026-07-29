import { View } from "react-native";

export function DifficultyPips({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <View className="flex-row gap-[3px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          testID={i <= level ? "pip-filled" : "pip"}
          className={`h-[5px] w-3 rounded-full ${i <= level ? "bg-accent" : "bg-slate-200"}`}
        />
      ))}
    </View>
  );
}
