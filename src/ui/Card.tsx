import { View, ViewProps } from "react-native";

export function Card({ className = "", style, ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-xl bg-card p-4 ${className}`}
      style={[{ shadowColor: "#0F172A", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }, style]}
      {...rest}
    />
  );
}
