import { type ReactNode, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { colors } from "@/ui/theme";
import { caption, subheadline } from "@/ui/type";

/**
 * One place on the map where the drive says something, and one thing said at a
 * time.
 *
 * The mock test screen used to float three of these independently: the
 * off-route banner, the observation-zone toast and the habitual-fault pill.
 * Each was absolutely positioned, each had to be told the others' heights, and
 * the screen carried three hand-tuned constants — OFF_ROUTE_BANNER_H 96,
 * ZONE_TOAST_TOP_GAP 62, PILL_TOP_GAP 98 — to keep them off each other. Adding
 * a fourth message meant re-deriving every gap below it by hand, and all three
 * could be on screen at once, asking for attention while somebody was turning
 * left.
 *
 * Now there is one slot at one position. The caller passes messages already
 * ranked; the slot shows the first that has not expired and marks the rest with
 * a tick, so nothing is silently dropped. Because only one message can occupy
 * the slot, nothing below it has to stack — the constants go with them.
 */
export type DriveMessage = {
  /**
   * Stable per *occurrence*, not per kind: `mark:4` and `habitual:mirrors:3`
   * rather than `mark` and `habitual`. A message that expires is remembered by
   * id, so a reused id would never show again.
   */
  id: string;
  tone: "route" | "zone" | "warn" | "serious" | "info";
  text: string;
  eyebrow?: string;
  /** Hides itself after this long. Omitted for anything that stands until it stops being true. */
  ttlMs?: number;
  /**
   * Renders in place of the default line. The off-route message uses this to
   * keep its full turn-by-turn banner: collapsing it to one line would have
   * cost the driver the actual instruction for rejoining.
   */
  render?: () => ReactNode;
};

const TONE: Record<DriveMessage["tone"], { bg: string; fg: string; rail: string }> = {
  // Amber, matching the off-route banner it replaces.
  route: { bg: "#FEF3C7", fg: "#7C2D12", rail: "#B45309" },
  // Green, and the only green here: it is telling the driver to press the
  // green Mirrors button, so it means the same thing that button does.
  zone: { bg: colors.accentTint, fg: colors.accentInk, rail: colors.accent },
  warn: { bg: "#FEF3C7", fg: "#7C2D12", rail: "#B45309" },
  serious: { bg: "#FEE2E2", fg: "#B91C1C", rail: "#B91C1C" },
  info: { bg: colors.cell, fg: colors.labelSecondary, rail: colors.separator },
};

export function DriveMessageSlot({ messages, top }: { messages: DriveMessage[]; top: number }) {
  const [expired, setExpired] = useState<Record<string, true>>({});
  const visible = messages.find((m) => !expired[m.id]) ?? null;
  const id = visible?.id;
  const ttl = visible?.ttlMs;

  // Keyed on the id alone, not on the message object: the compass re-renders
  // this screen about fifteen times a second, and a new object identity each
  // time would restart the timer on every one of them — a message with a
  // three-second life would then never expire.
  useEffect(() => {
    if (id === undefined || ttl === undefined) return;
    const t = setTimeout(() => setExpired((e) => ({ ...e, [id]: true })), ttl);
    return () => clearTimeout(t);
  }, [id, ttl]);

  if (!visible) return null;

  const queued = messages.filter((m) => !expired[m.id]).length;
  const tone = TONE[visible.tone];

  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 14, right: 14, top, gap: 6 }}>
      {visible.render ? visible.render() : (
        <View
          testID="drive-message"
          accessibilityRole="alert"
          style={{
            backgroundColor: tone.bg, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10,
            flexDirection: "row", alignItems: "center", gap: 10,
            shadowColor: "#221F1C", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 2 },
          }}
        >
          <View style={{ width: 6, alignSelf: "stretch", minHeight: 30, borderRadius: 3, backgroundColor: tone.rail }} />
          <View style={{ flex: 1 }}>
            {visible.eyebrow !== undefined && (
              <Text style={{ ...caption, fontWeight: "600", color: tone.rail, textTransform: "uppercase", letterSpacing: 0.7 }}>
                {visible.eyebrow}
              </Text>
            )}
            <Text style={{ ...subheadline, fontWeight: "600", color: tone.fg }}>{visible.text}</Text>
          </View>
        </View>
      )}

      {/* What is waiting behind the one on show. Without this a queued message
          is indistinguishable from one that was never raised. */}
      {queued > 1 && (
        <View testID="drive-message-queue" style={{ flexDirection: "row", gap: 6 }}>
          {Array.from({ length: queued }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i === 0 ? tone.rail : `${tone.rail}40` }} />
          ))}
        </View>
      )}
    </View>
  );
}

/** Kept beside the component so a caller cannot invent a fourth ranking. */
export const MESSAGE_TTL = {
  /** Advisory. The tile's own count carries it afterwards, permanently. */
  habitual: 8000,
  /** The passenger already felt this through the haptic. */
  confirmation: 3000,
  /** Said once when it lands; the red meter carries it for the rest of the drive. */
  serious: 8000,
} as const;
