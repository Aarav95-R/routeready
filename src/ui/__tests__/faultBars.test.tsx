import { render, screen } from "@testing-library/react-native";
import { FaultBars } from "../FaultBars";
import { colors } from "../theme";

const faults = [
  { tag: "Junction observations", count: 4 },
  { tag: "Use of mirrors", count: 3 },
];

const fillColour = (tag: string) => {
  const style = screen.getByTestId(`fault-fill-${tag}`).props.style as
    | Record<string, unknown>
    | Record<string, unknown>[];
  const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
  return flat.backgroundColor;
};

// The tally version: every row is the same green, because nothing on it is the
// subject.
test("without a lead every bar carries the accent", () => {
  render(<FaultBars faults={faults} />);
  expect(fillColour("Junction observations")).toBe(colors.accent);
  expect(fillColour("Use of mirrors")).toBe(colors.accent);
});

// With a lead the card has a subject, and the rows below it are context.
test("with a lead only the first bar carries the accent", () => {
  render(<FaultBars faults={faults} lead />);
  expect(fillColour("Junction observations")).toBe(colors.accent);
  expect(fillColour("Use of mirrors")).toBe(colors.faultRunner);
});

// Colour is never the only encoding — someone who cannot tell the two greens
// apart still has the number.
test("every row keeps its count whether it leads or not", () => {
  render(<FaultBars faults={faults} lead />);
  expect(screen.getByText("4")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy();
});
