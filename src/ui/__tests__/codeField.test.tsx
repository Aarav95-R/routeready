import { fireEvent, render, screen } from "@testing-library/react-native";
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
test("a refused code marks every box", () => {
  render(<CodeField value="418302" onChangeText={jest.fn()} invalid />);
  const borders = Array.from({ length: 6 }, (_, i) =>
    screen.getByTestId(`code-box-${i}`).props.style.borderColor);
  expect(new Set(borders).size).toBe(1);
});

test("it asks for the numeric keypad and offers one-time-code autofill", () => {
  render(<CodeField value="" onChangeText={jest.fn()} />);
  expect(field().props.keyboardType).toBe("number-pad");
  expect(field().props.textContentType).toBe("oneTimeCode");
});
