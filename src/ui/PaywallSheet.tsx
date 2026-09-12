import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop, BottomSheetView, type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import type { TestWindow } from "@/lib/onboarding";
import { defaultPlan, paywallHeadline, paywallReason } from "@/lib/paywallCopy";
import { offers as fetchOffers } from "@/services/purchases";
import type { Plan, PlanOffer } from "@/services/purchases";
import { useEntitlement } from "@/stores/entitlement";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { colors } from "@/ui/theme";
import { body, caption, FACES, footnote, subheadline, title2 } from "@/ui/type";
import { usePressed } from "@/ui/usePressed";

/**
 * Nine more routes, named after the centre the person was already looking at.
 *
 * A door, not a wall: `enablePanDownToClose` and the backdrop both call
 * `onDismiss`, and nothing here delays or hides the close gesture. App Review
 * treats a paywall that traps people as a rejection, and there is no reason
 * for this one to behave differently from any other sheet in the app.
 *
 * Prices are never invented here — `priceString` comes from `offers()`, which
 * is still a stub returning `[]` until Task 10 wires up the store. Until then
 * the CTA renders disabled with "Prices unavailable" rather than a guess.
 */

// A single detent, like centres.tsx's SHEET_SNAP_POINTS: enableDynamicSizing
// defaults to true in v5 and would otherwise insert a content-height detent
// alongside this one, re-sorting the array so `index={0}` stops addressing
// it. See task-7-sheet-notes.md — this project has already shipped that bug
// once with the whole suite green.
const SNAP_POINTS = ["62%"];

const TERMS_URL = "https://routeready.app/terms";
const PRIVACY_URL = "https://routeready.app/privacy";

export function PaywallSheet({
  visible, centreName, lockedCount, testWindow, onDismiss,
}: {
  visible: boolean;
  centreName: string;
  lockedCount: number;
  testWindow: TestWindow | null;
  onDismiss: () => void;
}) {
  const purchase = useEntitlement((s) => s.purchase);
  const restore = useEntitlement((s) => s.restore);

  const [planOffers, setPlanOffers] = useState<PlanOffer[] | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan>(() => defaultPlan(testWindow));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-read the interview's answer and re-fetch prices each time the sheet is
  // asked to open, rather than once on mount — the centre and the test window
  // can both change under an instance the caller keeps mounted.
  useEffect(() => {
    if (!visible) return;
    setSelectedPlan(defaultPlan(testWindow));
    setError(null);
    let cancelled = false;
    fetchOffers()
      .then((o) => { if (!cancelled) setPlanOffers(o); })
      .catch(() => { if (!cancelled) setPlanOffers([]); });
    return () => { cancelled = true; };
  }, [visible, testWindow]);

  const weeklyOffer = planOffers?.find((o) => o.plan === "weekly") ?? null;
  const monthlyOffer = planOffers?.find((o) => o.plan === "monthly") ?? null;
  const selectedOffer = planOffers?.find((o) => o.plan === selectedPlan) ?? null;
  // Only meaningfully "no offers" once offers() has actually resolved to an
  // empty list — while planOffers is still null (in flight) the CTA should
  // not flash "Prices unavailable" for a moment it does not deserve.
  const noOffers = planOffers !== null && planOffers.length === 0;

  const handleBuy = useCallback(async () => {
    if (!selectedOffer || busy) return;
    setBusy(true);
    setError(null);
    const message = await purchase(selectedPlan);
    setBusy(false);
    if (message) { setError(message); return; }
    onDismiss();
  }, [selectedOffer, selectedPlan, busy, purchase, onDismiss]);

  const handleRestore = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const message = await restore();
    setBusy(false);
    if (message) { setError(message); return; }
    onDismiss();
  }, [busy, restore, onDismiss]);

  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...backdropProps}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  const { pressed: ctaPressed, pressProps: ctaPressProps } = usePressed();
  const { pressed: restorePressed, pressProps: restorePressProps } = usePressed();
  const { pressed: termsPressed, pressProps: termsPressProps } = usePressed();
  const { pressed: privacyPressed, pressProps: privacyPressProps } = usePressed();

  const ctaDisabled = noOffers || busy;

  return (
    <BottomSheet
      index={visible ? 0 : -1}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={onDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.separator }}
    >
      <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 28, gap: 16 }}>
        <Text style={{ ...title2, color: colors.label }}>
          {paywallHeadline(centreName, lockedCount)}
        </Text>

        {/* Clay, never a second green: this line carries the personal fact —
            the test date the interview gave — and green stays reserved for
            the route and the CTA below. */}
        <Text style={{ ...subheadline, color: colors.clay }}>
          {paywallReason(testWindow)}
        </Text>

        <SegmentedControl
          options={["Weekly", "Monthly"]}
          accessibilityLabels={["Weekly plan", "Monthly plan"]}
          subLabels={[weeklyOffer?.priceString ?? "—", monthlyOffer?.priceString ?? "—"]}
          selectedIndex={selectedPlan === "weekly" ? 0 : 1}
          onChange={(i) => setSelectedPlan(i === 0 ? "weekly" : "monthly")}
        />

        {error !== null && (
          <Text style={{ ...footnote, color: colors.danger }}>{error}</Text>
        )}

        <Pressable
          testID="paywall-cta"
          accessibilityRole="button"
          accessibilityLabel="Unlock all routes"
          accessibilityState={{ disabled: ctaDisabled }}
          disabled={ctaDisabled}
          onPress={handleBuy}
          {...ctaPressProps}
          style={{
            minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center",
            backgroundColor: ctaDisabled ? colors.fill : colors.accent,
            opacity: ctaPressed && !ctaDisabled ? 0.85 : 1,
          }}
        >
          <Text
            style={{
              ...body, fontWeight: "700", fontFamily: FACES["700"],
              color: ctaDisabled ? colors.labelTertiary : "#FFFFFF",
            }}
          >
            {noOffers ? "Prices unavailable" : "Unlock all routes"}
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 20 }}>
          <Pressable
            accessibilityRole="button"
            onPress={handleRestore}
            {...restorePressProps}
            style={{ opacity: restorePressed ? 0.6 : 1 }}
          >
            <Text style={{ ...caption, fontFamily: FACES["600"], color: colors.labelSecondary }}>
              Restore purchases
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => { void Linking.openURL(TERMS_URL); }}
            {...termsPressProps}
            style={{ opacity: termsPressed ? 0.6 : 1 }}
          >
            <Text style={{ ...caption, fontFamily: FACES["600"], color: colors.labelSecondary }}>Terms</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => { void Linking.openURL(PRIVACY_URL); }}
            {...privacyPressProps}
            style={{ opacity: privacyPressed ? 0.6 : 1 }}
          >
            <Text style={{ ...caption, fontFamily: FACES["600"], color: colors.labelSecondary }}>Privacy</Text>
          </Pressable>
        </View>

        <Text style={{ ...caption, color: colors.labelTertiary, textAlign: "center" }}>
          Renews automatically until cancelled. Manage in Settings.
        </Text>
      </BottomSheetView>
    </BottomSheet>
  );
}
