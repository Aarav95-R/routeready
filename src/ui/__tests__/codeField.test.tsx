import { fireEvent, render, screen } from "@testing-library/react-native";
import { CODE_LENGTH } from "@/lib/otpCode";
import { colors } from "@/ui/theme";
import { CodeField } from "../CodeField";

const field = () => screen.getByLabelText("Verification code");

test("it shows one box per digit of the code", () => {
  render(<CodeField value="" onChangeText={jest.fn()} />);
  expect(screen.getByTestId("code-box-0")).toBeTruthy();
  expect(screen.getByTestId("code-box-5")).toBeTruthy();
  expect(screen.queryByTestId("code-box-6")).toBeNull();
});

test("each digit typed lands in its own box", () => {
  render(<CodeField value="418" onChangeText={jest.fn()} />);
  expect(screen.getByTestId("code-box-0")).toHaveTextContent("4");
  expect(screen.getByTestId("code-box-2")).toHaveTextContent("8");
});

/**
 * The single most likely input is a paste from the email, where the code is
 * shown grouped. The field normalises rather than refusing — see otpCode.
 */
test("a pasted grouped code arrives normalised", () => {
  const onChangeText = jest.fn();
  render(<CodeField value="" onChangeText={onChangeText} />);
  fireEvent.changeText(field(), "418 302");
  expect(onChangeText).toHaveBeenCalledWith("418302");
});

test("it never reports more than a full code", () => {
  const onChangeText = jest.fn();
  render(<CodeField value="" onChangeText={onChangeText} />);
  fireEvent.changeText(field(), "4183029999");
  expect(onChangeText).toHaveBeenCalledWith("418302");
});

// The whole field goes red, not one box: the person cannot know which digit
// was wrong, and marking one would be a guess presented as fact.
//
// A partial code keeps the cursor live, so without the invalid branch box 4
// would be accent and the rest separator — two colours. Asserting the set is
// exactly {danger} therefore fails if the invalid branch is ever removed,
// which the previous version of this test did not.
test("a refused code marks every box", () => {
  render(<CodeField value="4183" onChangeText={jest.fn()} invalid />);
  const borders = Array.from({ length: CODE_LENGTH }, (_, i) =>
    screen.getByTestId(`code-box-${i}`).props.style.borderColor);
  expect(new Set(borders)).toEqual(new Set([colors.danger]));
});

/**
 * The visible half of the fix for a slow Auth service: without it, a code
 * being checked and a keystroke being ignored looked identical on screen.
 */
test("a busy field is dimmed", () => {
  render(<CodeField value="418" onChangeText={jest.fn()} busy />);
  expect(screen.getByLabelText("Enter the code").props.style.opacity).toBe(0.5);
});

// A partial code would otherwise highlight the next box in accent — busy
// means there is no "next box" to fill until the answer comes back.
test("a busy field stops highlighting the next box", () => {
  render(<CodeField value="418" onChangeText={jest.fn()} busy />);
  const borders = Array.from({ length: CODE_LENGTH }, (_, i) =>
    screen.getByTestId(`code-box-${i}`).props.style.borderColor);
  expect(new Set(borders)).toEqual(new Set([colors.separator]));
});

test("it asks for the numeric keypad and offers one-time-code autofill", () => {
  render(<CodeField value="" onChangeText={jest.fn()} />);
  expect(field().props.keyboardType).toBe("number-pad");
  expect(field().props.textContentType).toBe("oneTimeCode");
});
