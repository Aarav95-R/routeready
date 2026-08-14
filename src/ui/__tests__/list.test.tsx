import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Cell, Group, GroupHeader } from "../List";
import { colors } from "../theme";
import { footnote } from "../type";

const flat = (style: unknown) =>
  Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : (style as object);

test("a group is an inset white container on the field", () => {
  render(<Group testID="g"><Cell label="Best" value="88" /></Group>);
  const s = flat(screen.getByTestId("g").props.style);
  expect(s.backgroundColor).toBe(colors.cell);
  expect(s.borderRadius).toBe(10);
  expect(s.marginHorizontal).toBe(16);
});

test("a cell states its label and its value", () => {
  render(<Group><Cell label="Average" value="72" /></Group>);
  expect(screen.getByText("Average")).toBeTruthy();
  expect(screen.getByText("72")).toBeTruthy();
});

// 44pt is the platform's minimum touch target and the reason a list of these
// reads calm rather than cramped.
test("a cell is never shorter than the platform minimum", () => {
  render(<Group><Cell testID="c" label="Best" value="88" /></Group>);
  expect(flat(screen.getByTestId("c").props.style).minHeight).toBe(44);
});

// The inset separator is the single clearest tell between a native list and a
// table drawn in HTML. It must never be full-bleed, and the last row must not
// carry one.
test("separators sit between rows only, inset from the leading edge", () => {
  render(
    <Group>
      <Cell label="Best" value="88" />
      <Cell label="Average" value="72" />
      <Cell label="Mock tests" value="5" />
    </Group>
  );
  const rules = screen.getAllByTestId("separator");
  expect(rules).toHaveLength(2);
  expect(flat(rules[0].props.style).marginLeft).toBe(16);
});

test("a single-row group draws no separator at all", () => {
  render(<Group><Cell label="Best" value="88" /></Group>);
  expect(screen.queryByTestId("separator")).toBeNull();
});

test("a group header is footnote type in the tertiary role", () => {
  render(<GroupHeader>Record</GroupHeader>);
  const s = flat(screen.getByText("Record").props.style);
  expect(s.fontSize).toBe(footnote.fontSize);
  expect(s.color).toBe(colors.labelTertiary);
});

test("a cell carrying children renders them instead of a label row", () => {
  render(<Group><Cell><Text>bespoke</Text></Cell></Group>);
  expect(screen.getByText("bespoke")).toBeTruthy();
});

test("a pressable cell reports its press and shows a chevron", () => {
  const onPress = jest.fn();
  render(<Group><Cell testID="c" label="12 Aug" value="88" chevron onPress={onPress} /></Group>);
  expect(screen.getByTestId("chevron")).toBeTruthy();
  fireEvent.press(screen.getByTestId("c"));
  expect(onPress).toHaveBeenCalled();
});
