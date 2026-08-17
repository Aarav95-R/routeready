import { Pressable, Text, View } from "react-native";

export function SegmentedControl({
  options, selectedIndex, onChange,
}: { options: string[]; selectedIndex: number; onChange: (i: number) => void }) {
  return (
    <View className="flex-row rounded-[9px] bg-slate-200/70 p-[2px]">
      {options.map((label, i) => (
        <Pressable
          key={label}
          onPress={() => onChange(i)}
          hitSlop={{ top: 8, bottom: 8 }}
          className={`min-h-[32px] flex-1 items-center justify-center rounded-[7px] ${i === selectedIndex ? "bg-card" : ""}`}
          style={i === selectedIndex ? { shadowColor: "#221F1C", shadowOpacity: 0.14, shadowRadius: 2.5, shadowOffset: { width: 0, height: 1 } } : undefined}
        >
          <Text className={`text-[12px] font-semibold ${i === selectedIndex ? "text-primary" : "text-slate-500"}`}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
