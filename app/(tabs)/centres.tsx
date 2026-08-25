import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleProp, Text, TextInput, useWindowDimensions, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { assignIdentities } from "@/lib/centreIdentity";
import {
  activeCentreId, buildSections, byDistance,
  type CentreFilter, type ChosenCentre, type CentreSort, type ViewCentre,
} from "@/lib/centresView";
import type { LatLng } from "@/lib/geo";
import { listCentres } from "@/services/centresRepo";
import { useNetwork } from "@/stores/networkStore";
import type { Centre } from "@/types/db";
import { CENTRE_ROW_H, CentreRow } from "@/ui/CentreRow";
import { CentresMap, type CentresMapHandle } from "@/ui/CentresMap";
import { OfflineBanner } from "@/ui/OfflineBanner";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";

const SORTS: { key: CentreSort; label: string }[] = [
  { key: "nearest", label: "Nearest" },
  { key: "pass", label: "Pass rate" },
];
const FILTERS: { key: CentreFilter; label: string }[] = [
  { key: "manual", label: "Manual" },
  { key: "auto", label: "Auto" },
];

type Row = { kind: "header"; title: string } | { kind: "centre"; item: ViewCentre; index: number };

// gorhom's scrollables omit `onScroll` (and `scrollEventThrottle`, which they
// hardcode to 16) from their published prop types, but the component does
// destructure `onScroll` out of `rest` and call it through `runOnJS` with a
// `{ nativeEvent }` payload — see createBottomSheetScrollableComponent in the
// installed package. The prop works; only the types disown it. Declare the
// shape this screen actually uses once, here, rather than casting at the call
// site or leaving the handler's parameter implicitly `any`.
const ScrollableRows = BottomSheetFlatList as unknown as React.ComponentType<{
  data: Row[];
  keyExtractor: (row: Row) => string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  renderItem: (info: { item: Row }) => React.ReactElement | null;
}>;

// Fixed and named, like CENTRE_ROW_H, so the header's rendered height is a
// known number the scroll-to-camera binding can add up rather than something
// it would otherwise have to measure after layout.
const SECTION_HEADER_H = 32;

// Exactly one detent — the map is half the point of this screen and must not
// be scrollable away. See the comment on <BottomSheet> for why a second one
// breaks scrolling rather than merely adding a position.
const SHEET_FRACTION = 0.52;
const SHEET_SNAP_POINTS = [`${SHEET_FRACTION * 100}%`];

export default function Centres() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Mapbox requires its logo and attribution to stay visible, and the sheet
  // covers the bottom 52% of this screen, so they are lifted clear of it.
  const { height: windowH } = useWindowDimensions();
  const logoBottom = windowH * SHEET_FRACTION + 8;
  const online = useNetwork((s) => s.online);
  const map = useRef<CentresMapHandle>(null);

  const [centres, setCentres] = useState<Centre[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CentreSort>("nearest");
  const [filter, setFilter] = useState<CentreFilter>("all");

  // Nothing is set before the first await, which is what lets the mount effect
  // below call this without setting state synchronously inside an effect.
  // Clearing a previous error is the *retry's* job, not the load's — see
  // `retry` — because clearing it here would also blank the message the moment
  // the screen mounted, which is a state nobody was ever in.
  const load = useCallback(async () => {
    try {
      const r = await listCentres();
      setCentres(r.data);
      setStale(r.stale);
      setError(null);
    } catch {
      setError("Couldn't load centres.");
    }
  }, []);

  // A tap, not an effect, so clearing the message the button sits under is
  // allowed to happen immediately — the sheet drops back to its skeletons
  // while the second attempt is in flight rather than looking inert.
  const retry = useCallback(() => {
    setError(null);
    load();
  }, [load]);

  // Two independent trips, started together rather than in sequence: the
  // centres come from the network or the cache, the fix comes from the OS, and
  // neither waits on the other. Both sit inside an async boundary so nothing in
  // this effect touches state on the render that scheduled it.
  useEffect(() => {
    void (async () => { await load(); })();
    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({}));
        if (pos) setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // Permission can be granted and the fix still never arrive: location
        // services off at the OS level, or a timeout. Swallowed rather than
        // left as an unhandled rejection, because `me` staying null already
        // says everything the screen needs — and says it the same way a
        // refused permission does.
      }
    })();
  }, [load]);

  // Nearest needs a fix, so the *effective* sort is derived from one rather
  // than patched when a permission result comes back. Every no-fix path —
  // denied, services off, a fix that never lands — therefore reaches the same
  // state: pass rate, with Nearest greyed and unselected. Setting sort on the
  // denial alone left the other paths painting Nearest as the selected pill
  // and greying it as disabled at the same time, while the list quietly sat
  // in pass-rate order.
  const activeSort: CentreSort = me ? sort : "pass";

  // Identity is assigned from the distance-sorted list, never the displayed
  // one, so re-sorting by pass rate repaints nothing.
  const identities = useMemo(() => {
    const all = centres ?? [];
    const ordered = me ? [...all].sort(byDistance(me)) : all;
    return assignIdentities(ordered);
  }, [centres, me]);

  const sections = useMemo(
    () => buildSections({ centres: centres ?? [], me, sort: activeSort, filter, query }),
    [centres, me, activeSort, filter, query]
  );

  // Pins are the pinned entries that survived the filter and the search, not
  // the raw near set: nearSet() is deliberately computed off the unfiltered
  // list (so pin membership and identity colours stay stable), but the map
  // must not keep showing a pin for a row the user just filtered away.
  const pins = useMemo(
    () => sections.flatMap((s) => s.data).filter((v) => v.pinned).map((v) => v.centre),
    [sections]
  );

  // What the camera frames. With a fix that is the pins, so choosing Manual
  // refits to what is left; with no fix there are no pins at all and the map
  // would otherwise open on whatever the base style ships with, so it frames
  // all forty instead.
  const frame = useMemo(() => (me ? pins : centres ?? []), [me, pins, centres]);

  // One flat array, plus a parallel table of each row's cumulative y built
  // from the same fixed constants (CENTRE_ROW_H, SECTION_HEADER_H) that size
  // the rows. Section headers are not 88pt, so this table — not
  // offsetY / CENTRE_ROW_H — is what keeps the scroll binding pointed at the
  // right centre once a header sits above it.
  const { rows, rowOffsets } = useMemo(() => {
    const outRows: Row[] = [];
    const offsets: number[] = [];
    let y = 0;
    let index = 0;
    for (const section of sections) {
      if (sections.length > 1) {
        outRows.push({ kind: "header", title: section.title });
        offsets.push(y);
        y += SECTION_HEADER_H;
      }
      for (const item of section.data) {
        outRows.push({ kind: "centre", item, index: index++ });
        offsets.push(y);
        y += CENTRE_ROW_H;
      }
    }
    return { rows: outRows, rowOffsets: offsets };
  }, [sections]);

  const empty = centres !== null && !error && rows.length === 0;

  // What the sheet was last pointed at, and what the map draws because of it.
  // The choice is state; the active centre is derived from it every render, so
  // a filter or a search that takes the chosen centre away is answered in the
  // same frame rather than repaired by an effect afterwards. `activeCentreId`
  // holds the whole rule and is tested on its own.
  const [chosenId, setChosenId] = useState<ChosenCentre>(undefined);
  const activeId = useMemo(() => activeCentreId(chosenId, pins), [chosenId, pins]);

  const lastMove = useRef(0);
  // The 150ms floor throttles camera moves, not the row the sheet highlights.
  // A move that lands inside the floor is stashed here rather than dropped,
  // so a trailing timer can still send the camera to wherever the user
  // actually stopped, instead of leaving it stuck on an earlier row forever.
  const pendingFocus = useRef<LatLng | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFlush = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
  }, []);

  // Drop a queued move outright. Anything that stops pointing the sheet at a
  // centre has to do this, or the trailing flush below still flies the camera
  // to a centre the sheet no longer shows as active.
  const cancelPendingFocus = useCallback(() => {
    clearFlush();
    pendingFocus.current = null;
  }, [clearFlush]);

  // Nothing left to flush once the screen itself goes away.
  useEffect(() => clearFlush, [clearFlush]);

  /**
   * The sheet and the map are one instrument: scrolling the cards is the same
   * gesture as panning the map.
   *
   * rowOffsets holds each row's cumulative y from the fixed row/header
   * constants, so finding the row at the top of the viewport is a lookup
   * against known numbers, not a measurement. Two guards keep the camera from
   * feeling seasick: it only moves when the row actually changes, and never
   * twice inside 150ms, so a flung list settles before the map chases it.
   */
  const onScroll = useCallback((offsetY: number) => {
    if (!rows.length) return;

    // Walk forward while the *next* row's band would still contain offsetY,
    // so `i` lands on the row currently at the top of the viewport.
    let i = 0;
    while (i < rowOffsets.length - 1 && rowOffsets[i + 1] <= offsetY) i++;
    const row = rows[i];

    // A header itself has no centre to focus, and skipping it here (rather
    // than falling through to the nearest centre) means the map holds still
    // while the header scrolls past instead of jittering onto a guess.
    if (row.kind === "header") return;

    // Rows under "Further afield" have no pin, so there is nothing to fly to
    // and a jump from London to Newcastle mid-scroll would be violent.
    if (!row.item.pinned) { setChosenId(null); cancelPendingFocus(); return; }
    if (row.item.centre.id === activeId) return;

    setChosenId(row.item.centre.id);

    const target: LatLng = { lat: row.item.centre.lat, lng: row.item.centre.lng };
    const now = Date.now();
    const elapsed = now - lastMove.current;

    if (elapsed >= 150) {
      // A real move fires now, superseding whatever was still queued.
      cancelPendingFocus();
      lastMove.current = now;
      map.current?.focus(target);
      return;
    }

    // Inside the floor: stash the target the camera should end up on. Only
    // schedule the trailing flush the first time we enter the window — a
    // later stash while one is already pending just updates the target that
    // timer will use, so a fling settles on the *last* row, not the first.
    pendingFocus.current = target;
    if (!flushTimer.current) {
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        lastMove.current = Date.now();
        if (pendingFocus.current) {
          map.current?.focus(pendingFocus.current);
          pendingFocus.current = null;
        }
      }, 150 - elapsed);
    }
  }, [rows, rowOffsets, activeId, cancelPendingFocus]);

  // A queued camera move outlives the centre it was queued for: filtering or
  // searching one away leaves a trailing flush still pointed at it, and the
  // camera would fly to a centre the sheet no longer shows as active.
  //
  // The highlight itself needs no repair here — `activeCentreId` has already
  // moved it — so this sets no state, which is the whole reason it is allowed
  // to be an effect at all. It fires exactly when the derivation had to
  // override the choice.
  useEffect(() => {
    if (chosenId !== undefined && chosenId !== activeId) cancelPendingFocus();
  }, [chosenId, activeId, cancelPendingFocus]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <CentresMap ref={map} pins={pins} frame={frame} identities={identities} me={me} activeId={activeId} logoBottom={logoBottom} />

      <View style={{ position: "absolute", top: insets.top + 6, left: 16, right: 16, flexDirection: "row", gap: 8 }}>
        <View style={pillStyle}>
          <Ionicons name="location" size={13} color={colors.accent} />
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.primary }}>Test centres</Text>
        </View>
        {!me && (
          <Pressable
            testID="enable-location"
            style={pillStyle}
            onPress={async () => {
              try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== "granted") return;
                const pos = await Location.getCurrentPositionAsync({});
                setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              } catch {
                // Same as on mount: granted is not the same as located, and a
                // rejection here just leaves the pill where it was.
              }
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "500", color: "#8B827A" }}>Turn on location for distances</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable testID="recentre" style={pillStyle} onPress={() => map.current?.fitAll()}>
          <Ionicons name="locate" size={15} color={colors.accent} />
        </Pressable>
      </View>

      {/* The sheet does not move. All three props are load-bearing, and each
          closes a different way gorhom would otherwise raise it over the map:

          - enableContentPanningGesture={false} is the important one.
            useScrollable's first rule is `if (!enableContentPanningGesture)
            return SCROLLABLE_STATUS.UNLOCKED`, so this both unlocks the list
            unconditionally and removes the gesture that drags the sheet from
            its content. Without it, gorhom locks the scrollable unless the
            sheet is at its highest detent, and the first scroll gesture is
            spent hauling the sheet up before a row moves.
          - enableDynamicSizing defaults to TRUE, which inserts a
            content-height detent alongside snapPoints. One snap point alone
            therefore did not give one detent.
          - enableHandlePanningGesture={false} closes the last route: dragging
            the top edge.

          The map is half of this screen. It must not be scrollable away. */}
      <BottomSheet
        index={0}
        snapPoints={SHEET_SNAP_POINTS}
        bottomInset={0}
        enableDynamicSizing={false}
        enableContentPanningGesture={false}
        enableHandlePanningGesture={false}
        handleComponent={null}
      >
        {/* paddingTop replaces the space gorhom's handle used to occupy — the
            handle is gone because the sheet can no longer be dragged, and a
            grabber advertising a gesture that does nothing is a lie. */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#E8E3DC", backgroundColor: "#FFF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Ionicons name="search" size={15} color={colors.ink3} />
            <TextInput
              testID="centre-search"
              style={{ flex: 1, fontSize: 14 }}
              placeholder="Search centres"
              value={query}
              onChangeText={setQuery}
            />
          </View>

          {/* Two axes, not one. Choosing a car type keeps the sort. */}
          <View style={{ flexDirection: "row", backgroundColor: "rgba(226,232,240,0.8)", borderRadius: 9, padding: 2 }}>
            {SORTS.map((s) => (
              <Pressable
                key={s.key}
                testID={`sort-${s.key}`}
                disabled={s.key === "nearest" && !me}
                onPress={() => setSort(s.key)}
                style={[segStyle, activeSort === s.key && segOnStyle]}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: segTextColor(activeSort === s.key, s.key === "nearest" && !me) }}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
            {FILTERS.map((f) => (
              <Pressable
                key={f.key}
                testID={`filter-${f.key}`}
                onPress={() => setFilter(filter === f.key ? "all" : f.key)}
                style={[segStyle, filter === f.key && segOnStyle]}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: segTextColor(filter === f.key, false) }}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <OfflineBanner visible={stale || !online} />

        {/* A sheet whose list has been replaced by an error has nothing to pull
            down, so the retry is a button. */}
        {error && (
          <View testID="centres-error" style={{ padding: 24, alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 13, color: "#8B827A", textAlign: "center" }}>{error}</Text>
            <Pressable
              testID="centres-retry"
              onPress={retry}
              style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.accent }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFFFFF" }}>Try again</Text>
            </Pressable>
          </View>
        )}

        {centres === null && !error && (
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={CENTRE_ROW_H - 12} />)}
          </View>
        )}

        {empty && (
          <View testID="centres-empty" style={{ padding: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: "#8B827A" }}>No centres match “{query}”.</Text>
          </View>
        )}

        {!error && rows.length > 0 && (
          <ScrollableRows
            data={rows}
            keyExtractor={(r) => (r.kind === "header" ? `h:${r.title}` : r.item.centre.id)}
            contentContainerStyle={{ paddingBottom: 120 }}
            onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => onScroll(e.nativeEvent.contentOffset.y)}
            renderItem={({ item: row }) =>
              row.kind === "header" ? (
                <Text style={{ height: SECTION_HEADER_H, paddingHorizontal: 16, paddingTop: 12, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: "#A79D94" }}>
                  {row.title}
                </Text>
              ) : (
                <CentreRow
                  item={row.item}
                  identity={identities.get(row.item.centre.id)!}
                  active={row.item.centre.id === activeId}
                  index={row.index}
                  onPress={() => router.push(`/centre/${row.item.centre.id}`)}
                />
              )
            }
          />
        )}
      </BottomSheet>
    </View>
  );
}

const pillStyle = {
  backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 999,
  paddingHorizontal: 13, paddingVertical: 7,
  flexDirection: "row" as const, alignItems: "center" as const, gap: 6,
  shadowColor: "#221F1C", shadowOpacity: 0.13, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
};
const segStyle = { flex: 1, minHeight: 32, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: 7 };
const segOnStyle = {
  backgroundColor: "#FFFFFF",
  shadowColor: "#221F1C", shadowOpacity: 0.14, shadowRadius: 2.5, shadowOffset: { width: 0, height: 1 },
};
const segTextColor = (on: boolean, disabled: boolean) =>
  disabled ? "#D8D1C8" : on ? colors.primary : "#8B827A";
