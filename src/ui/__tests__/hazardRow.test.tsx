import { render, screen } from "@testing-library/react-native";
import type { Hazard } from "@/types/db";
import { HazardRow } from "../HazardRow";
import { colors } from "../theme";

const hazard = (over: Partial<Hazard> = {}): Hazard => ({
  id: "h1", route_id: "r1", lat: 51.605, lng: -0.24,
  type: "roundabout", description: "Four exits, second is easy to miss.",
  severity: "high", ...over,
});

test("says what the hazard is and what to watch for", () => {
  render(<HazardRow hazard={hazard()} number={1} />);
  expect(screen.getByText("roundabout")).toBeTruthy();
  expect(screen.getByText("Four exits, second is easy to miss.")).toBeTruthy();
});

// The number is what ties the row to its mark on the route drawing above.
test("carries the number it was given, not its position in any list", () => {
  render(<HazardRow hazard={hazard()} number={3} />);
  expect(screen.getByText("3")).toBeTruthy();
});

test.each([
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
] as const)("%s severity is labelled and chipped", (severity, label) => {
  render(<HazardRow hazard={hazard({ severity })} number={1} />);
  expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByTestId(`severity-${severity}`)).toBeTruthy();
});

// The detail page this list came from drew medium in the app's accent green —
// the colour that means "go" everywhere else. Nothing on this scale may be green.
test("no severity is drawn in the accent green", () => {
  for (const severity of ["low", "medium", "high"] as const) {
    const { unmount } = render(<HazardRow hazard={hazard({ severity })} number={1} />);
    const chip = screen.getByTestId(`severity-${severity}`);
    const flat = JSON.stringify(chip.props.style ?? {});
    expect(flat).not.toContain(colors.accent.slice(1));
    expect(flat).not.toContain(colors.accentPressed.slice(1));
    unmount();
  }
});

// The mock test block above this list is a filled amber wash. A filled amber
// chip below it reads as a smaller sibling of that block rather than as a
// severity, so medium is outlined: the border carries the amber, the ground
// stays clear.
test("medium is outlined, not filled, so it cannot be mistaken for the mock test block", () => {
  render(<HazardRow hazard={hazard({ severity: "medium" })} number={1} />);
  const chip = screen.getByTestId("severity-medium");
  const flat = JSON.stringify(chip.props.style ?? {});
  expect(flat).toContain("transparent");
  expect(flat).toContain("217,119,6");
});

test("high stays filled — nothing else on the screen is red", () => {
  render(<HazardRow hazard={hazard({ severity: "high" })} number={1} />);
  const flat = JSON.stringify(screen.getByTestId("severity-high").props.style ?? {});
  expect(flat).not.toContain("transparent");
  expect(flat).toContain("220,38,38");
});
