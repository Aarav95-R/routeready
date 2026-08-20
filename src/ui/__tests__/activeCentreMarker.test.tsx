import { render, screen } from "@testing-library/react-native";
import type { CentreIdentity } from "@/lib/centreIdentity";
import type { Centre } from "@/types/db";
import { ActiveCentreMarker } from "../ActiveCentreMarker";

const centre: Centre = {
  id: "c1", name: "Barnet", address: "Longmore Avenue",
  lat: 51.6368, lng: -0.166, pass_rate: 49,
  test_types: ["manual", "auto"], region: "Greater London",
};

const identity: CentreIdentity = { hue: "#A16207", tint: "#FFFBEB", initials: "B", seed: 3 };

const setup = (over: Partial<React.ComponentProps<typeof ActiveCentreMarker>> = {}) =>
  render(<ActiveCentreMarker centre={centre} identity={identity} distanceM={5794} {...over} />);

test("the callout carries the three facts the row underneath already shows", () => {
  setup();
  expect(screen.getByTestId("active-marker-name")).toHaveTextContent("Barnet");
  expect(screen.getByTestId("active-marker-rate")).toHaveTextContent("49% pass rate");
  expect(screen.getByTestId("active-marker-distance")).toHaveTextContent("3.6 mi away");
});

test("the pin carries the centre's monogram in its own hue", () => {
  setup();
  expect(screen.getByTestId("active-marker-initials")).toHaveTextContent("B");
  expect(screen.getByTestId("active-marker-rate")).toHaveStyle({ color: "#A16207" });
});

test("with no fix there is no distance line rather than an empty one", () => {
  setup({ distanceM: null });
  expect(screen.queryByTestId("active-marker-distance")).toBeNull();
  expect(screen.getByTestId("active-marker-name")).toHaveTextContent("Barnet");
});

test("a centre with no published rate says so rather than showing zero", () => {
  setup({ centre: { ...centre, pass_rate: null } });
  expect(screen.getByTestId("active-marker-rate")).toHaveTextContent("Pass rate unknown");
});
