import {
  Easing, FadeInDown, FadeInLeft, FadeInRight, FadeOutLeft, FadeOutRight,
  ZoomIn, withSequence, withTiming,
} from "react-native-reanimated";

/**
 * One motion language for the whole app.
 *
 * Entrances used to be springs — `.springify().damping(16)` pasted into three
 * separate components, plus a `damping: 6` on the favourite star that
 * overshot to 1.25 and rang through four bounces. Meanwhile the route
 * drawing, the emblem bloom, the row sweep and the skeleton pulse were all
 * plain timing curves. The app was speaking two motion languages and only one
 * of them wobbled.
 *
 * Everything here is timing on a decelerating cubic — the same curve
 * RouteThumbnail already draws with. Nothing overshoots, so nothing settles,
 * so nothing jiggles.
 *
 * These live in one module on purpose: three copies of a curve is how the old
 * ones drifted apart, and a screen that reaches for its own numbers reopens
 * exactly that.
 */

/** Fast enough never to delay a tap, slow enough to be seen. */
export const ENTER_MS = 280;
/** Between consecutive items in a list. */
export const ENTER_STAGGER_MS = 45;
/** How far an entering item travels. Short, because it does not bounce back. */
export const ENTER_TRAVEL = 10;

export const DECELERATE = Easing.out(Easing.cubic);

/** Standard timing config for imperative `withTiming` calls. */
export const timing = (duration: number) => ({ duration, easing: DECELERATE });

/**
 * The entrance for an item at `index` in a list — cards, rows, mode blocks.
 *
 * Reanimated's builders default to `ReduceMotion.System`, so this is already
 * skipped for anyone with the OS setting on; there is nothing to check here.
 */
export function enterFrom(index = 0) {
  return FadeInDown
    .duration(ENTER_MS)
    .easing(DECELERATE)
    .delay(index * ENTER_STAGGER_MS)
    .withInitialValues({ transform: [{ translateY: ENTER_TRAVEL }] });
}

/** The same entrance on an explicit delay, for a sequence that is not a list. */
export function enterAfter(delayMs: number) {
  return FadeInDown
    .duration(ENTER_MS)
    .easing(DECELERATE)
    .delay(delayMs)
    .withInitialValues({ transform: [{ translateY: ENTER_TRAVEL }] });
}

/** A thing arriving in its own right, rather than as part of a list. */
export function popIn(delayMs = 0) {
  return ZoomIn.duration(320).easing(DECELERATE).delay(delayMs);
}

/**
 * A one-shot acknowledgement on a toggle: grow, then straight back. No
 * overshoot on the return, so tapping twice quickly reads as two taps rather
 * than as a glitch.
 */
export function pulse(peak = 1.12) {
  return withSequence(withTiming(peak, timing(120)), withTiming(1, timing(160)));
}

/**
 * A card leaves faster than the next one arrives — the gap is what stops the
 * two reading as one smear. Same decelerating cubic; still nothing that
 * overshoots.
 */
export const STEP_EXIT_MS = 180;

/** Slightly further than a list item travels, because a whole card is moving. */
export const STEP_TRAVEL = 14;

/** The next card in a sequence: in from the trailing edge. */
export function stepForward() {
  return FadeInRight
    .duration(ENTER_MS)
    .easing(DECELERATE)
    .withInitialValues({ transform: [{ translateX: STEP_TRAVEL }] });
}

/**
 * The previous card: in from the leading edge.
 *
 * The mirror is the whole point. If both directions entered from the same
 * side, the flow would feel one-way whichever button was pressed, and Back
 * would read as another step forward.
 */
export function stepBack() {
  return FadeInLeft
    .duration(ENTER_MS)
    .easing(DECELERATE)
    .withInitialValues({ transform: [{ translateX: -STEP_TRAVEL }] });
}

/** The card being replaced, leaving in the direction of travel. */
export function stepExit(back = false) {
  return (back ? FadeOutRight : FadeOutLeft).duration(STEP_EXIT_MS).easing(DECELERATE);
}
