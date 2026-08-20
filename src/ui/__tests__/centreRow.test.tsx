import { fireEvent, render, screen } from "@testing-library/react-native";
import type { CentreIdentity } from "@/lib/centreIdentity";
import type { ViewCentre } from "@/lib/centresView";
import type { Centre } from "@/types/db";
import { CENTRE_ROW_H, CentreRow } from "../CentreRow";

const centre: Centre = {
  id: "c1", name: "Mill Hill (London)", address: "71 Watford Way",
  lat: 51.6087, lng: -0.2412, pass_rate: 43.5,
  test_types: ["manual", "auto"], region: "Greater London",
};

const identity: CentreIdentity = { hue: "#BE123C", tint: "#FFF1F2", initials: "MH", seed: 1 };

const setup = (item: Partial<ViewCentre> = {}, over: { active?: boolean; onPress?: () => void } = {}) =>
  render(
    <CentreRow
      item={{ centre, distanceM: 1931, pinned: true, ...item }}
      identity={identity}
      active={over.active ?? false}
      index={0}
      onPress={over.onPress ?? (() => {})}
    />
  );

test("the row is exactly the height the map binding assumes", () => {
  expect(CENTRE_ROW_H).toBe(88);
  setup();
  expect(screen.getByTestId("centre-row")).toHaveStyle({ height: 88 });
});

test("shows distance in miles when there is a fix", () => {
  setup();
  expect(screen.getByTestId("centre-row-name")).toHaveTextContent("Mill Hill (London)");
  expect(screen.getByTestId("centre-row-meta")).toHaveTextContent("1.2 mi away");
});

test("falls back to the region when there is no fix", () => {
  setup({ distanceM: null });
  expect(screen.getByTestId("centre-row-meta")).toHaveTextContent("Greater London");
});

test("a centre with no published rate says so rather than showing zero", () => {
  setup({ centre: { ...centre, pass_rate: null } });
  expect(screen.getByTestId("centre-row-rate")).toHaveTextContent("—");
});

test("the active row takes the centre's tint", () => {
  setup({}, { active: true });
  expect(screen.getByTestId("centre-row")).toHaveStyle({ backgroundColor: "#FFF1F2" });
});

test("pressing the row opens the centre", () => {
  const onPress = jest.fn();
  setup({}, { onPress });
  fireEvent.press(screen.getByTestId("centre-row"));
  expect(onPress).toHaveBeenCalled();
});

test("the active row grows a rail in the centre's full hue", () => {
  // The tint alone is invisible on a white row — every one of the twelve was
  // chosen to sit behind hue-coloured text, not to be a highlight.
  setup({}, { active: true });
  expect(screen.getByTestId("centre-row-rail")).toHaveStyle({ backgroundColor: "#BE123C" });
});

test("an inactive row has no rail", () => {
  setup();
  expect(screen.queryByTestId("centre-row-rail")).toBeNull();
});
