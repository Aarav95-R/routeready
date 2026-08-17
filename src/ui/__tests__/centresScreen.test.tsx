import { render, screen } from "@testing-library/react-native";

// Kept outside __tests__ so jest does not collect it as a suite of its own.
jest.mock("@rnmapbox/maps", () => require("../../test/rnmapboxMock"));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: "denied" }),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock("@/services/centresRepo", () => ({
  listCentres: jest.fn().mockResolvedValue({ data: [], stale: false }),
}));

import Centres from "../../../app/(tabs)/centres";

beforeEach(() => mockPush.mockClear());

// On fake timers, as in centresMap.test.tsx: the skeletons this screen opens on
// are reanimated mappers, and letting one run under jest's mocked
// requestAnimationFrame walks the react-native module's deprecated getters
// until DevMenu throws.
//
// Settings used to hang off this screen's pill row. It moved to Home, and the
// map got its pills back — so the assertion here is that the gear is *gone*,
// leaving exactly one door to the account.
test("the map carries no account controls of its own", () => {
  jest.useFakeTimers();
  render(<Centres />);

  expect(screen.getByTestId("recentre")).toBeTruthy();
  expect(screen.queryByLabelText("Settings")).toBeNull();
  jest.useRealTimers();
});
