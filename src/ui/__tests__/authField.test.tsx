import { createRef } from "react";
import { TextInput } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AuthField } from "../AuthField";

// iOS offers Keychain autofill and a generated strong password off these two
// attributes alone. Without them the screen looks finished and behaves like a
// web form from 2011, which is the single biggest tell in the whole flow.
test("an email field advertises itself to autofill", () => {
  render(<AuthField testID="f" placeholder="Email address" kind="email" value="" onChangeText={() => {}} />);
  const f = screen.getByTestId("f");
  expect(f.props.autoComplete).toBe("email");
  expect(f.props.textContentType).toBe("emailAddress");
  expect(f.props.keyboardType).toBe("email-address");
  expect(f.props.autoCapitalize).toBe("none");
});

// `password` asks the Keychain to fill an existing one; `newPassword` asks it
// to offer a generated one. Using the first on sign-up is why an app never
// gets offered a strong password.
test("an existing password and a new one ask autofill for different things", () => {
  const { rerender } = render(
    <AuthField testID="f" placeholder="Password" kind="password" value="" onChangeText={() => {}} />
  );
  expect(screen.getByTestId("f").props.textContentType).toBe("password");
  rerender(<AuthField testID="f" placeholder="Password" kind="newPassword" value="" onChangeText={() => {}} />);
  expect(screen.getByTestId("f").props.textContentType).toBe("newPassword");
});

test("a password is hidden until you ask to see it", () => {
  render(<AuthField testID="f" placeholder="Password" kind="password" value="secret" onChangeText={() => {}} />);
  expect(screen.getByTestId("f").props.secureTextEntry).toBe(true);
  fireEvent.press(screen.getByLabelText("Show password"));
  expect(screen.getByTestId("f").props.secureTextEntry).toBe(false);
  expect(screen.getByLabelText("Hide password")).toBeTruthy();
});

test("a non-password field has nothing to reveal", () => {
  render(<AuthField testID="f" placeholder="Email address" kind="email" value="" onChangeText={() => {}} />);
  expect(screen.queryByLabelText("Show password")).toBeNull();
});

// Return should move you on. On a four-field form, not chaining is four
// dismissals of the keyboard.
test("return runs the handler the caller gave it", () => {
  const onSubmitEditing = jest.fn();
  render(
    <AuthField testID="f" placeholder="Email address" kind="email" value=""
      onChangeText={() => {}} returnKeyType="next" onSubmitEditing={onSubmitEditing} />
  );
  expect(screen.getByTestId("f").props.returnKeyType).toBe("next");
  fireEvent(screen.getByTestId("f"), "submitEditing");
  expect(onSubmitEditing).toHaveBeenCalled();
});

test("the caller can hold a ref to focus it", () => {
  const ref = createRef<TextInput>();
  render(<AuthField testID="f" inputRef={ref} placeholder="Password" kind="password" value="" onChangeText={() => {}} />);
  expect(ref.current).not.toBeNull();
});
