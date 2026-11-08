import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { initialsFor } from "@/lib/accountIdentity";
import { MANAGE_URL, planLabel, renewalLine } from "@/lib/subscription";
import { useDevPreview } from "@/stores/devPreview";
import { selectEntitled, useEntitlement } from "@/stores/entitlement";
import { selectFullName, selectTestWindow, useSession } from "@/stores/sessionStore";
import { enterFrom } from "@/ui/motion";
import { PaywallSheet } from "@/ui/PaywallSheet";
import { colors } from "@/ui/theme";
import { FACES } from "@/ui/type";

/**
 * The design was drawn at a fixed size, and iOS will happily render it 130%
 * larger if the phone's text size is turned up — which is how a screen that
 * matches the mockup on one device looks blown up on another. Display type is
 * capped; body copy is left free to scale, because that is what the setting is
 * actually for.
 */
const DISPLAY_SCALE = 1.1;

/**
 * The account screen, and the way out of the account.
 *
 * It leads with the person rather than with a list of switches: there is
 * exactly one setting here, and what a learner actually needs before tapping
 * the red button is confirmation of *which* account they are about to leave.
 * Hence the monogram and the address at the top, and the version below it in
 * the same shadowed Card the rest of the app is built from.
 *
 * Nothing here navigates on sign-out. The root layout already redirects to
 * sign-in the moment `session` goes null, and a router call racing that effect
 * is how you get two navigations for one tap.
 */
export default function Settings() {
  const router = useRouter();
  const session = useSession((s) => s.session);
  const signOut = useSession((s) => s.signOut);

  const savedName = useSession(selectFullName);
  const setName = useSession((s) => s.setName);

  const previewFirstRun = useDevPreview((s) => s.firstRun);
  const setPreviewFirstRun = useDevPreview((s) => s.setFirstRun);

  const email = session?.user?.email ?? "";
  const initials = initialsFor(savedName, email);
  const version = Constants.expoConfig?.version ?? "";

  // Held locally while it is being typed, so the field does not fight the
  // store on every keystroke. It is committed once, on the way out.
  const [draftName, setDraftName] = useState(savedName);
  const [nameError, setNameError] = useState<string | null>(null);

  const commitName = async () => {
    if (draftName.trim() === savedName) return;
    setNameError(null);
    const err = await setName(draftName);
    // The store is the only source of truth here: a failed write must leave the
    // field showing what is actually saved, not what was typed.
    if (err) { setNameError(err); setDraftName(savedName); }
  };

  /**
   * Signing out is never instant: the store tells the server first and waits
   * up to its grace period for an answer. That wait used to be invisible —
   * `void signOut()` threw the promise away, so the button sat unchanged for
   * as long as it took, which against a slow Auth service is a button people
   * tap again and again. It is held now instead, and says so.
   *
   * Never cleared on the happy path, because there is nothing left to clear
   * it on: the root layout redirects off `session` the moment it goes null
   * and takes this screen with it. The `finally` is for the other path — a
   * teardown that throws leaves the person still here, and still needing a
   * button that works.
   */
  const [signingOut, setSigningOut] = useState(false);

  /**
   * The subscription half of this screen.
   *
   * Read from the store rather than asked of RevenueCat here: `init()` and
   * `identify()` in the root layout have already settled it, and a Settings
   * screen that opens its own network request shows a spinner for something
   * the app already knows.
   */
  const entitled = useEntitlement(selectEntitled);
  const product = useEntitlement((s) => s.product);
  const renewsAt = useEntitlement((s) => s.renewsAt);
  const restore = useEntitlement((s) => s.restore);
  const testWindow = useSession(selectTestWindow);

  const [paywall, setPaywall] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  /**
   * Offered whether or not there is a subscription on this account.
   *
   * App Review requires it findable either way, and the requirement is the
   * right one: somebody who has reinstalled has no subscription *on this
   * device*, which is the entire case restore exists for. Hiding it from the
   * not-subscribed state would hide it from exactly the person who needs it.
   */
  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    setRestoreMessage(null);
    const message = await restore();
    setRestoring(false);
    // Null means it worked, and the row above has already changed to say so.
    if (message) setRestoreMessage(message);
  };

  const confirmSignOut = () => {
    if (signingOut) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Sign out?",
      "Your saved routes and progress stay on your account. You'll need your email to sign back in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            setSigningOut(true);
            void signOut().finally(() => setSigningOut(false));
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      {/* Scrolls because it now can overflow: at this type scale, a long email
          on a small phone with the text size turned up runs past the fold, and
          Sign out is the one control on here that must always be reachable. */}
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          className="mt-1 flex-row items-center gap-1.5 self-start py-2.5 pl-4 pr-5"
        >
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
          <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18px] font-medium text-accent">Centres</Text>
        </Pressable>

        <Text
          maxFontSizeMultiplier={DISPLAY_SCALE}
          className="px-5 pb-6 pt-1.5 text-[38px] font-semibold tracking-tight text-primary"
          style={{ fontFamily: FACES["600"] }}
        >
          Account
        </Text>

        <Animated.View entering={enterFrom(0)} className="flex-row items-center gap-4 px-5 pb-7">
          <View className="h-[71px] w-[71px] items-center justify-center rounded-full bg-accent">
            {/* Digits and punctuation make a nonsense monogram, so an address
                with no name in it gets the generic mark instead. */}
            {initials
              ? <Text testID="account-monogram" maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[25px] font-semibold text-white">{initials}</Text>
              : <Ionicons testID="account-icon" name="person" size={34} color="#FFFFFF" />}
          </View>
          <View className="flex-1">
            <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[19px] font-semibold tracking-tight text-primary" numberOfLines={1}>{email}</Text>
            <Text className="mt-1 text-[16px] text-slate-500">Signed in with email</Text>
          </View>
        </Animated.View>

        {/* Above the account details on purpose: this is the only thing on
            this screen with money attached, and the one row somebody arrives
            here to find. */}
        <Animated.View entering={enterFrom(1)} className="mx-5 mb-3 rounded-[19px] bg-card px-5" style={{ shadowColor: "#221F1C", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }}>
          {entitled ? (
            <>
              <View className="flex-row items-center py-[17px]">
                <View className="flex-1">
                  <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18px] text-primary">
                    {planLabel(product) ?? "Subscribed"}
                  </Text>
                  {renewalLine(renewsAt) && (
                    <Text className="mt-1 text-[15px] text-slate-500">{renewalLine(renewsAt)}</Text>
                  )}
                </View>
                <View className="rounded-full bg-[#E8F3EC] px-3 py-1">
                  <Text className="text-[14px] font-semibold text-accent">Active</Text>
                </View>
              </View>
              <View className="h-px bg-slate-200" />
              {/* Linking rather than an in-app browser: this URL hands off to
                  the App Store app, which is the only place a subscription can
                  actually be cancelled. In a web view it is a dead end. */}
              <Pressable
                onPress={() => { void Linking.openURL(MANAGE_URL); }}
                accessibilityRole="button"
                className="flex-row items-center py-[17px] active:opacity-70"
              >
                <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18px] text-primary">Manage subscription</Text>
                <Ionicons name="open-outline" size={17} color={colors.ink3} style={{ marginLeft: "auto" }} />
              </Pressable>
            </>
          ) : (
            <Pressable
              testID="unlock-routes"
              onPress={() => setPaywall(true)}
              accessibilityRole="button"
              className="flex-row items-center py-[17px] active:opacity-70"
            >
              <View className="flex-1">
                <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18px] text-primary">Unlock all routes</Text>
                <Text className="mt-1 text-[15px] text-slate-500">Every route, at every test centre.</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.ink3} />
            </Pressable>
          )}
          <View className="h-px bg-slate-200" />
          <Pressable
            testID="restore-purchases"
            onPress={() => { void handleRestore(); }}
            disabled={restoring}
            accessibilityRole="button"
            accessibilityState={{ disabled: restoring, busy: restoring }}
            className={`flex-row items-center py-[17px] ${restoring ? "" : "active:opacity-70"}`}
          >
            <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18px] text-primary">Restore purchases</Text>
            {restoring && <ActivityIndicator color={colors.ink3} style={{ marginLeft: "auto" }} />}
          </Pressable>
        </Animated.View>

        {restoreMessage && (
          <Text className="mx-5 mb-3 -mt-1 text-[15px] font-semibold text-danger">{restoreMessage}</Text>
        )}

        <Animated.View entering={enterFrom(1)} className="mx-5 rounded-[19px] bg-card px-5" style={{ shadowColor: "#221F1C", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }}>
          {/* Editable in place. Accounts made before sign-up asked for a name
              have no other way to get one, and this is the screen they are
              already on when they wonder why the app will not say it. */}
          <View className="flex-row items-center py-[17px]">
            <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18px] text-primary">Name</Text>
            <TextInput
              testID="name-field"
              accessibilityLabel="Name"
              maxFontSizeMultiplier={DISPLAY_SCALE}
              className="ml-auto min-w-[170px] text-right text-[17px] text-slate-500"
              placeholder="Add your name"
              placeholderTextColor={colors.ink3}
              autoCapitalize="words"
              returnKeyType="done"
              value={draftName}
              onChangeText={setDraftName}
              onBlur={commitName}
              onSubmitEditing={commitName}
            />
          </View>
          <View className="h-px bg-slate-200" />
          <View className="flex-row items-center py-[17px]">
            <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18px] text-primary">Version</Text>
            <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="ml-auto text-[17px] text-slate-500">{version}</Text>
          </View>
        </Animated.View>

        {nameError && (
          <Text className="mx-5 mt-3 text-[15px] font-semibold text-danger">{nameError}</Text>
        )}

        {/* Development only — `__DEV__` is compiled away, and this block with
            it, so nothing here ships. The first-run home screen is otherwise
            unreachable from any account that has driven anything, which is
            every account anyone building this app is signed in to. */}
        {__DEV__ && (
          <Pressable
            testID="preview-first-run"
            accessibilityRole="switch"
            accessibilityState={{ checked: previewFirstRun }}
            onPress={() => setPreviewFirstRun(!previewFirstRun)}
            className="mx-5 mt-8 flex-row items-center rounded-[19px] border border-dashed border-slate-300 px-5 py-[17px] active:opacity-70"
          >
            <View className="flex-1">
              <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18px] text-primary">
                Preview the first-run home
              </Text>
              <Text className="mt-1 text-[15px] text-slate-500">
                Draws Home as a brand-new account sees it. Development builds only.
              </Text>
            </View>
            <Ionicons
              name={previewFirstRun ? "toggle" : "toggle-outline"}
              size={34}
              color={previewFirstRun ? colors.accent : colors.ink3}
            />
          </Pressable>
        )}

        {/* Outlined rather than filled: a solid red bar is the loudest thing on
            any screen it is on, and this is a door, not an alarm. */}
        <Animated.View entering={enterFrom(2)}>
          <Pressable
            testID="sign-out-button"
            onPress={confirmSignOut}
            disabled={signingOut}
            accessibilityRole="button"
            accessibilityState={{ disabled: signingOut, busy: signingOut }}
            className={`mx-5 mt-8 flex-row items-center justify-center gap-2.5 rounded-[19px] border border-[#F3C8C8] bg-[#FEF3F2] py-[19px] ${signingOut ? "" : "active:opacity-70"}`}
          >
            {/* Same spinner idiom as the auth screens' primary action: a
                control that only greys out reads as one that failed. */}
            {signingOut && <ActivityIndicator color={colors.danger} />}
            <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[19px] font-semibold text-danger">
              {signingOut ? "Signing out…" : "Sign out"}
            </Text>
          </Pressable>
        </Animated.View>
        {/* Its own group, below Sign out rather than beside it. Sign out is a
            door you can walk back through; this is not, and a shared card
            would draw them as a pair of equals. The consequences live on the
            screen this pushes to — an alert is not a place anybody reads. */}
        <Animated.View entering={enterFrom(3)}>
          <Pressable
            onPress={() => router.push("/delete-account")}
            accessibilityRole="button"
            className="mx-5 mt-3 flex-row items-center rounded-[19px] bg-card px-5 py-[17px] active:opacity-70"
            style={{ shadowColor: "#221F1C", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }}
          >
            <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18px] font-medium text-danger">
              Delete account
            </Text>
            <Ionicons name="chevron-forward" size={17} color="#E3A9A9" style={{ marginLeft: "auto" }} />
          </Pressable>
        </Animated.View>

      </ScrollView>

      {/* Mounted only while it is open, unlike the centre screen which keeps
          one instance alive across route taps. There is one entry point here
          and no reason to hold a sheet — and an always-mounted sheet puts a
          second "Restore purchases" and a second plan name into the tree,
          which is confusing for anything reading the screen, assistive
          technology included.

          No centre to name and nothing counted: paywallHeadline handles that
          by describing the offer rather than counting toward it. */}
      {paywall && (
        <PaywallSheet
          visible
          centreName=""
          lockedCount={0}
          testWindow={testWindow}
          onDismiss={() => setPaywall(false)}
        />
      )}
    </SafeAreaView>
  );
}
