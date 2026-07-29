import { useState } from "react";
import { Link } from "expo-router";
import { KeyboardAvoidingView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button } from "@/ui/Button";
import { useSession } from "@/stores/sessionStore";

export default function SignIn() {
  const { signIn, sendMagicLink } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView behavior="padding" className="flex-1 justify-center gap-3 px-4">
        <View className="mb-2 items-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-accent">
            <Ionicons name="car-sport" size={30} color="#fff" />
          </View>
          <Text className="text-[26px] font-semibold tracking-tight text-primary" style={{ fontFamily: "Inter_600SemiBold" }}>RouteReady</Text>
          <Text className="text-[13px] text-slate-500">Practise real DVSA test routes</Text>
        </View>
        <TextInput
          className="rounded-lg border border-slate-200 bg-card px-3 py-3 text-[14px]"
          placeholder="Email address" autoCapitalize="none" keyboardType="email-address"
          value={email} onChangeText={setEmail}
        />
        <TextInput
          className="rounded-lg border border-slate-200 bg-card px-3 py-3 text-[14px]"
          placeholder="Password" secureTextEntry value={password} onChangeText={setPassword}
        />
        {error && <Text className="text-[12px] font-semibold text-danger">{error}</Text>}
        {notice && <Text className="text-[12px] font-semibold text-accent">{notice}</Text>}
        <Button title={busy ? "Signing in…" : "Sign in"} disabled={busy} onPress={async () => {
          setBusy(true); setError(null);
          const err = await signIn(email.trim(), password);
          if (err) setError(err);
          setBusy(false);
        }} />
        <Button variant="ghost" title="Email me a magic link" disabled={busy || !email} onPress={async () => {
          setError(null);
          const err = await sendMagicLink(email.trim());
          err ? setError(err) : setNotice("Check your email for the sign-in link.");
        }} />
        <Text className="text-center text-[12px] text-slate-500">
          New here? <Link href="/(auth)/sign-up" className="font-semibold text-accent">Create an account</Link>
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
