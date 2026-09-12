import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { canDrive } from "@/lib/gating";
import { getRoute } from "@/services/routesRepo";
import { listProgressByCentre } from "@/services/progressRepo";
import { attemptLine, difficultyWord, shortRouteName } from "@/lib/routeSummary";
import { useEntitlement } from "@/stores/entitlement";
import { selectTestWindow, useSession } from "@/stores/sessionStore";
import type { Hazard, ProgressEntry, Route } from "@/types/db";
import { DifficultyPips } from "@/ui/DifficultyPips";
import { DriveModeRow } from "@/ui/DriveModeRow";
import { HazardRow } from "@/ui/HazardRow";
import { PaywallSheet } from "@/ui/PaywallSheet";
import { RouteThumbnail } from "@/ui/RouteThumbnail";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";
import { FACES } from "@/ui/type";
import { usePressed } from "@/ui/usePressed";

// Every centre is seeded with ten routes, one of them `is_free` — see
// docs/superpowers/specs/2026-09-12-paywall-design.md. This screen only ever
// has the one route in hand (a deep link, a stale cache, or a route
// favourited before a lapse lands here without the centre list around it),
// so the count on the sheet is this fixed, documented shape rather than a
// second fetch of the centre's other nine rows just to say "nine".
const ROUTES_PER_CENTRE_LOCKED = 9;

// The route drawn large, with the label block below it rather than over it:
// thumbPath fits the line into the box it is given, so anything laid on top of
// that box covers part of the drive. The two stack inside one panel instead,
// and the sheet lifts over the panel's foot.
const HERO_H = 168;
const SHEET_LIFT = 16;

/**
 * Everything a route is, before it is driven: the shape of it, what the drive
 * is like in numbers, the two ways to take it, and every hazard on it.
 *
 * This screen absorbed app/route/[id] — the old detail page mounted a second
 * map library to draw a line and some markers, and offered the same two
 * buttons this screen offers as rows. What it had that this did not is the
 * hazard list, which arrives here numbered: pin 3 on the drawing is row 3 in
 * the list, in the order they are met on the drive.
 *
 * Nothing begins here — no location permission, no GPS watch, no mock-test
 * store. The screen only routes; practice.tsx and mock.tsx keep owning all of
 * that, and both open on the preview card this hands off to.
 */
export default function ChooseMode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [route, setRoute] = useState<Route | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const testWindow = useSession(selectTestWindow);

  /**
   * Whether this route may be driven, and whether the paywall is open.
   *
   * `allowed` starts `null` — "still deciding" — and stays there until the
   * route arrives, because `canDrive` needs `is_free` off it. It is set
   * exactly once, the moment the route lands, and is never recomputed after:
   * see the read below.
   */
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [paywall, setPaywall] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await getRoute(id).catch(() => null);
      if (!alive || !r) return;
      setRoute(r.data.route);
      setHazards(r.data.hazards);

      /**
       * Read once, when the screen opens, and deliberately never again.
       *
       * This is the screen a drive begins from, and a mock test runs for
       * twenty-odd minutes with the screen awake and location streaming. A
       * renewal that fails on a roundabout must not revoke the route out
       * from under somebody being marked and bin the run.
       *
       * Losing a few pence to a grace case is nothing against that.
       * `useEntitlement.getState()` rather than the `useEntitlement()` hook
       * is what makes this a reading rather than a subscription: it is
       * called once, right here, and nothing in this component re-runs it
       * when the store changes later.
       */
      const drivable = canDrive(r.data.route, useEntitlement.getState().status);
      setAllowed(drivable);
      if (!drivable) setPaywall(true);

      // Cached under the centre, so arriving from the routes list this is
      // already warm. A missing history must never hold up the choice.
      const p = await listProgressByCentre(r.data.route.centre_id, [id]).catch(() => null);
      if (alive && p) setProgress(p.data[id] ?? []);
    })();
    return () => { alive = false; };
  }, [id]);

  // Only mock tests write to user_progress, so this line belongs to that block
  // alone — and is dropped entirely when there is none. An empty state here
  // would only tell a learner off for not having taken a test yet.
  const history = attemptLine(progress);

  const { pressed: unlockPressed, pressProps: unlockPressProps } = usePressed();

  return (
    <SafeAreaView className="flex-1 bg-[#EDEBE4]" edges={["top"]}>
      <View className="flex-1 bg-surface">
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 14 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="bg-[#EDEBE4] pb-4">
            {route
              ? (
                <RouteThumbnail
                  geometry={route.geometry}
                  // Hazards, not observation zones: a numbered mark has to
                  // stand for a row below it, and only hazards have rows.
                  numbered={hazards}
                  width={width}
                  height={HERO_H}
                  drawDelayMs={140}
                />
              )
              : <View style={{ width, height: HERO_H }} />}

            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              className="absolute left-3 top-3 h-9 w-9 items-center justify-center rounded-full bg-card"
              style={{ shadowColor: "#221F1C", shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}
            >
              <Ionicons name="chevron-back" size={18} color={colors.primary} />
            </Pressable>

            <View className="px-4">
              {route ? (
                <>
                  <Text className="text-[21px] font-semibold tracking-tight text-primary" style={{ fontFamily: FACES["600"] }}>
                    {shortRouteName(route.name)}
                  </Text>
                  {/* The figure is what gets read, so it goes first and the
                      label sits quietly under it in sentence case. Spaced
                      capitals over a number is a dashboard convention, and
                      nobody speaks in them. */}
                  <View className="mt-2.5 flex-row gap-5">
                    <View>
                      <Text className="text-[15px] font-semibold text-primary">{route.distance_km?.toFixed(1)} km</Text>
                      <Text className="mt-px text-[11px] font-medium text-slate-500">Distance</Text>
                    </View>
                    <View>
                      <Text className="text-[15px] font-semibold text-primary">{route.estimated_minutes} min</Text>
                      <Text className="mt-px text-[11px] font-medium text-slate-500">Time</Text>
                    </View>
                    <View>
                      <View className="mt-1.5"><DifficultyPips level={route.difficulty} /></View>
                      <Text className="mt-1 text-[11px] font-medium text-slate-500">{difficultyWord(route.difficulty)}</Text>
                    </View>
                  </View>
                </>
              ) : (
                <View className="gap-2.5"><Skeleton h={24} w="75%" /><Skeleton h={30} w="60%" /></View>
              )}
            </View>
          </View>

          {/* Gated on `allowed`, not on `route`: the hero above is safe to show
              the instant the route lands, but the two modes and the hazard
              list are exactly the two things a locked route must never
              flash. `allowed === null` is "still deciding" — the same
              in-between the hazard block below always treated as "nothing
              claimed yet" — and gets the skeleton, not a guess in either
              direction. */}
          <View className="rounded-t-3xl bg-surface px-4 pt-4" style={{ marginTop: -SHEET_LIFT }}>
            {allowed === false ? (
              // In place of the modes and the hazard list, not alongside them:
              // `getRoute` hands back an empty hazard array for a route the
              // policy has refused, and rendering that array here would read
              // as "this route has no hazards" — a lie, and a dangerous one
              // on a driving app. The paywall sheet carries the actual offer;
              // this is only the still frame behind it.
              <View className="items-center gap-3 py-10">
                <View
                  className="h-12 w-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.clayTint }}
                >
                  <Ionicons name="lock-closed" size={20} color={colors.clay} />
                </View>
                <Text
                  className="text-center text-[14px] font-semibold"
                  style={{ color: colors.clay, fontFamily: FACES["600"] }}
                >
                  Unlock to drive this route
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="See plans"
                  onPress={() => setPaywall(true)}
                  {...unlockPressProps}
                  className="rounded-full px-5 py-2.5"
                  style={{ backgroundColor: colors.accent, opacity: unlockPressed ? 0.85 : 1 }}
                >
                  <Text className="text-[13px] text-white" style={{ fontFamily: FACES["700"] }}>See plans</Text>
                </Pressable>
              </View>
            ) : allowed === true ? (
              <>
                <Text className="mb-2.5 px-0.5 text-[13px] font-semibold text-slate-600">How do you want to drive it today?</Text>

                <View className="gap-2.5">
                  <DriveModeRow
                    mode="practice"
                    index={0}
                    title="Practice drive"
                    description="Guided all the way, with the tricky bits called out. Nothing is marked."
                    onPress={() => router.push(`/route/${id}/practice`)}
                  />
                  <DriveModeRow
                    mode="test"
                    index={1}
                    title="Mock test"
                    description="Timed and marked like the real thing, with a result at the end."
                    history={history}
                    onPress={() => router.push(`/route/${id}/mock`)}
                  />
                </View>

                <Text className="py-3.5 text-center text-[11px] leading-4 text-slate-500">
                  {"Not at the start yet? You'll be guided there first."}
                </Text>

                {/* No count beside it: the rows are numbered and countable,
                    and the numeral was only ever there to fill the right-hand
                    end of a capitalised label. */}
                <Text className="px-0.5 pb-2.5 pt-1 text-[14px] font-semibold tracking-tight text-primary">What to watch for</Text>
                {hazards.length === 0 ? (
                  <View className="rounded-[14px] border border-slate-200 bg-card p-3">
                    <Text className="text-center text-[11.5px] text-slate-500">Nothing tricky on this one — a good route to build confidence on.</Text>
                  </View>
                ) : (
                  <View className="gap-2">
                    {hazards.map((h, i) => <HazardRow key={h.id} hazard={h} number={i + 1} />)}
                  </View>
                )}
              </>
            ) : (
              <View className="gap-2.5">
                <Skeleton h={64} />
                <Skeleton h={64} />
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      <PaywallSheet
        visible={paywall}
        centreName=""
        lockedCount={ROUTES_PER_CENTRE_LOCKED}
        testWindow={testWindow}
        onDismiss={() => {
          setPaywall(false);
          // Nothing on this screen is usable while locked — the modes and
          // the hazard list stay gone whether the sheet is open or not — so
          // dismissing it is dismissing the screen.
          router.back();
        }}
      />
    </SafeAreaView>
  );
}
