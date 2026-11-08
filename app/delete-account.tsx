import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSession } from "@/stores/sessionStore";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { FACES } from "@/ui/type";

/** As on the account screen: display type is capped, body copy scales freely. */
const DISPLAY_SCALE = 1.1;

/**
 * What goes, named one line at a time.
 *
 * A list rather than a warning paragraph because a person can check a list
 * against what they think they have, and skims a paragraph. The alert cannot
 * do this job either — it is four lines, read in a hurry, at the moment the
 * decision has already been made.
 *
 * The first row's detail is filled in with the account's own address, which is
 * the one fact worth being certain of on a shared phone before a red button.
 */
const LOSSES: readonly { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }[] = [
  { icon: "mail-outline", title: "Your email and name", detail: "" },
  { icon: "clipboard-outline", title: "Every mock test", detail: "Your scores and the faults behind them" },
  { icon: "star-outline", title: "Your favourite routes", detail: "And the centre you picked at sign-up" },
];

/**
 * The way out of the account, permanently.
 *
 * Its own screen rather than an alert raised from Settings, because the
 * consequences need reading and an alert is not a place anybody reads. The
 * alert still appears — it is the second of the two deliberate taps — but by
 * then everything it confirms has already been on screen.
 *
 * Nothing here navigates on success. The root layout redirects the moment
 * `session` goes null, and a router call racing that effect is how you get two
 * navigations for one tap. Same reason the sign-out button navigates nowhere.
 *
 * On failure this screen is the thing that must not move: the account still
 * exists, nothing has been removed, and the banner's first job is to end any
 * doubt about whether it half-worked.
 */
export default function DeleteAccount() {
  const router = useRouter();
  const email = useSession((s) => s.session?.user?.email ?? "");
  const deleteAccount = useSession((s) => s.deleteAccount);

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setWorking(true);
    const message = await deleteAccount();
    // Only on the failure path. On success the account is gone and this
    // component is about to be unmounted by the redirect; setting state on it
    // would be a write to a screen that no longer exists.
    if (message) {
      setError(message);
      setWorking(false);
    }
  };

  const confirm = () => {
    if (working) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Delete account?",
      "This is permanent. Your tests, faults and favourites go with it.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => { void run(); } },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-field" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          className="mt-1 flex-row items-center gap-1.5 self-start py-2.5 pl-4 pr-5"
        >
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
          <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18px] font-medium text-accent">Account</Text>
        </Pressable>

        <Text
          maxFontSizeMultiplier={DISPLAY_SCALE}
          className="px-5 pb-5 pt-1.5 text-[38px] font-semibold tracking-tight text-primary"
          style={{ fontFamily: FACES["600"] }}
        >
          Delete account
        </Text>

        <Text className="px-5 pb-3 text-[16px] text-label-secondary">This removes, permanently:</Text>

        <Animated.View
          entering={enterFrom(0)}
          className="mx-5 overflow-hidden rounded-[19px] bg-card"
          style={{ shadowColor: "#221F1C", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }}
        >
          {LOSSES.map((loss, i) => (
            <View
              key={loss.title}
              className={`flex-row items-start gap-3 px-5 py-[15px] ${i > 0 ? "border-t border-separator" : ""}`}
            >
              <Ionicons name={loss.icon} size={19} color={colors.danger} style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className="text-[16px] font-semibold text-primary">{loss.title}</Text>
                <Text className="mt-0.5 text-[14px] text-label-tertiary" numberOfLines={2}>
                  {/* The account's own address, on the row about the account. */}
                  {i === 0 ? email : loss.detail}
                </Text>
              </View>
            </View>
          ))}
        </Animated.View>

        <Text className="px-5 pt-5 text-[16px] leading-[22px] text-label-secondary">
          <Text className="font-semibold text-primary">You can&apos;t undo this.</Text>{" "}
          Signing up again with the same email starts from nothing.
        </Text>

        {/* Apple owns the subscription, not this app, and it renews whether or
            not the account it was bought for still exists. Somebody who
            deletes expecting the billing to stop finds out a month later by
            being charged — so this is on the screen, beside the thing it
            qualifies, rather than in the confirmation alert nobody reads. */}
        <Text className="px-5 pt-3 text-[16px] leading-[22px] text-label-secondary">
          Deleting your account does not cancel your subscription. Cancel it in
          the App Store.
        </Text>

        {/* Above the button rather than below it: this is the thing that has to
            be read before the next tap, not a receipt for the last one. */}
        {error && (
          <View className="mx-5 mt-6 rounded-[13px] border border-[#F3C8C8] bg-danger-tint px-4 py-3">
            <Text className="text-[14px] leading-[19px] text-[#8F2020]">{error}</Text>
          </View>
        )}

        {/* Solid, where Sign out is outlined. Sign out is a door; this is an
            alarm, and the two must not read as interchangeable. */}
        <Animated.View entering={enterFrom(1)}>
          <Pressable
            testID="delete-account-button"
            onPress={confirm}
            disabled={working}
            accessibilityRole="button"
            accessibilityState={{ disabled: working, busy: working }}
            className={`mx-5 mt-6 items-center rounded-[19px] py-[19px] ${working ? "bg-[#E6C9C6]" : "bg-danger active:opacity-80"}`}
          >
            <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[19px] font-semibold text-white">
              {working ? "Deleting…" : "Delete my account"}
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
