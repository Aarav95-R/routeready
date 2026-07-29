import { useState } from "react";
import { Link } from "expo-router";
import { KeyboardAvoidingView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button } from "@/ui/Button";
import { useSession } from "@/stores/sessionStore";

export default function SignUp() {
  const { signUp } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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
          <Text className="text-[13px] text-slate-500">Create your account</Text>
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
        <TextInput
          className="rounded-lg border border-slate-200 bg-card px-3 py-3 text-[14px]"
          placeholder="Confirm password" secureTextEntry value={confirm} onChangeText={setConfirm}
        />
        {error && <Text className="text-[12px] font-semibold text-danger">{error}</Text>}
        {notice && <Text className="text-[12px] font-semibold text-accent">{notice}</Text>}
        <Button title={busy ? "Creating account…" : "Create account"} disabled={busy} onPress={async () => {
          setError(null); setNotice(null);
          if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
          if (password !== confirm) { setError("Passwords don't match"); return; }
          setBusy(true);
          const err = await signUp(email.trim(), password);
          if (err) setError(err);
          else setNotice("Account created — check your email to confirm, then sign in.");
          setBusy(false);
        }} />
        <Text className="text-center text-[12px] text-slate-500">
          Already have an account? <Link href="/(auth)/sign-in" className="font-semibold text-accent">Sign in</Link>
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
