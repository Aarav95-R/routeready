import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { colors } from "../theme";
import { ChoiceRow, QuestionCard } from "../QuestionCard";

const flatten = (style: unknown) =>
  Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style ?? {};

const choice = (props: Partial<React.ComponentProps<typeof ChoiceRow>> = {}) =>
  render(<ChoiceRow label="Roundabouts" selected={false} onPress={jest.fn()} {...props} />);

describe("QuestionCard", () => {
  test("it asks, says why, and then gets out of the way", () => {
    render(
      <QuestionCard title="What trips you up?" subtitle="Pick up to two.">
        <Text>Roundabouts</Text>
      </QuestionCard>,
    );
    expect(screen.getByText("What trips you up?")).toBeTruthy();
    expect(screen.getByText("Pick up to two.")).toBeTruthy();
    expect(screen.getByText("Roundabouts")).toBeTruthy();
  });

  // The heading is what a screen reader should land on when the card arrives.
  test("the question is a heading", () => {
    render(<QuestionCard title="When's your test?" subtitle="Roughly is fine." />);
    expect(screen.getByRole("header", { name: "When's your test?" })).toBeTruthy();
  });
});

describe("ChoiceRow", () => {
  /**
   * A multi-select that reports itself as a radio tells a screen reader user
   * their previous choice was replaced when it was not. The two roles are
   * announced differently and behave differently, so the component has to know
   * which it is rather than defaulting to "button".
   */
  test("one answer is a radio; two allowed is a checkbox", () => {
    choice();
    expect(screen.getByRole("radio", { name: "Roundabouts" })).toBeTruthy();

    choice({ multi: true });
    expect(screen.getByRole("checkbox", { name: "Roundabouts" })).toBeTruthy();
  });

  test("being chosen is announced, not only drawn", () => {
    choice({ selected: true });
    expect(screen.getByRole("radio").props.accessibilityState).toMatchObject({ checked: true });
  });

  test("the sub-label is announced with the label, not after it", () => {
    choice({ sub: "Mini, multi-lane and spiral" });
    expect(screen.getByRole("radio", { name: "Roundabouts. Mini, multi-lane and spiral" })).toBeTruthy();
  });

  /**
   * Green is the road; clay is you. A chosen answer is about the person, so it
   * is clay — which is also what keeps the sign-up flow from using the colour
   * that means "go" on every other screen.
   */
  test("a chosen answer is drawn in clay, not in the accent", () => {
    choice({ selected: true });
    const style = flatten(screen.getByRole("radio").props.style);
    expect(style.backgroundColor).toBe(colors.clayTint);
    expect(style.borderColor).toBe(colors.clay);
    expect(style.backgroundColor).not.toBe(colors.accent);
  });

  test("an unchosen answer is a plain cell", () => {
    choice();
    expect(flatten(screen.getByRole("radio").props.style).backgroundColor).toBe(colors.cell);
    expect(screen.queryByTestId("choice-tick")).toBeNull();
  });

  test("a chosen answer carries a tick, so colour is not the only signal", () => {
    choice({ selected: true });
    expect(screen.getByTestId("choice-tick")).toBeTruthy();
  });

  test("tapping it answers the question", () => {
    const onPress = jest.fn();
    choice({ onPress });
    fireEvent.press(screen.getByRole("radio"));
    expect(onPress).toHaveBeenCalled();
  });

  // 44pt is the platform's minimum target, and these are the only controls on
  // three of the five cards.
  test("it is big enough to hit", () => {
    choice();
    expect(flatten(screen.getByRole("radio").props.style).minHeight).toBeGreaterThanOrEqual(44);
  });
});
