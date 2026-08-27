import { Alert } from "react-native";

/**
 * Where a drive that is abandoned lands, and what it asks first.
 *
 * Home, not the screen underneath. The stack below a drive is the route's own
 * start page, and under that the centre it belongs to — a driver who has just
 * pulled over and quit is not choosing how to drive that same route again.
 * dismissTo unwinds the whole stack rather than replacing the top of it, so
 * the Android back gesture off Home cannot walk back into a drive whose GPS
 * watch has already been torn down.
 */
export const HOME_HREF = "/(tabs)" as const;

/**
 * Only the mock test asks before it goes.
 *
 * A practice drive records nothing, so a mistap costs a driver the tap it
 * takes to start again. A test in progress carries every fault marked since
 * the start line, and none of it survives the exit — that is worth a second
 * of a driver's attention, even at the wheel.
 */
export function confirmExitMockTest(onExit: () => void): void {
  Alert.alert(
    "Exit the mock test?",
    "The test ends here, and nothing you have been marked on is saved.",
    [
      { text: "Keep driving", style: "cancel" },
      { text: "Exit test", style: "destructive", onPress: onExit },
    ],
  );
}
