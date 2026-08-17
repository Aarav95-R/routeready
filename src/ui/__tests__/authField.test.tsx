import { fireEvent, render, screen } from "@testing-library/react-native";
import { AuthField } from "../AuthField";

const field = (props: Partial<React.ComponentProps<typeof AuthField>> = {}) =>
  render(<AuthField placeholder="Email address" kind="email" value="" onChangeText={jest.fn()} {...props} />);

/**
 * These attributes are the point of this component.
 *
 * Neither auth screen set `textContentType` or `autoComplete` on any field, so
 * iOS offered no Keychain fill on sign-in and no generated strong password on
 * sign-up. It is two attributes, and it changes how the screen feels more than
 * any amount of restyling does.
 */
test("an email field is set up for Keychain fill", () => {
  field();
  const input = screen.getByLabelText("Email address");
  expect(input.props.textContentType).toBe("emailAddress");
  expect(input.props.autoComplete).toBe("email");
  expect(input.props.keyboardType).toBe("email-address");
  expect(input.props.autoCapitalize).toBe("none");
  expect(input.props.autoCorrect).toBe(false);
});

test("a new-password field asks iOS to offer a generated one", () => {
  field({ placeholder: "Password", kind: "newPassword" });
  const input = screen.getByLabelText("Password");
  expect(input.props.textContentType).toBe("newPassword");
  expect(input.props.autoComplete).toBe("new-password");
});

test("an existing-password field asks for the saved one instead", () => {
  field({ placeholder: "Password", kind: "password" });
  expect(screen.getByLabelText("Password").props.textContentType).toBe("password");
});

test("a name field capitalises words", () => {
  field({ placeholder: "First name", kind: "name" });
  const input = screen.getByLabelText("First name");
  expect(input.props.autoCapitalize).toBe("words");
  expect(input.props.autoComplete).toBe("given-name");
});

describe("the reveal", () => {
  test("a password starts hidden and can be shown", () => {
    field({ placeholder: "Password", kind: "password" });
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);

    fireEvent.press(screen.getByLabelText("Show password"));
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);

    fireEvent.press(screen.getByLabelText("Hide password"));
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
  });

  // Nothing to reveal, and a control that does nothing is worse than no
  // control at all.
  test("there is no reveal on a field that was never hidden", () => {
    field();
    expect(screen.queryByLabelText("Show password")).toBeNull();
  });
});

/**
 * Return used to dismiss the keyboard rather than move to the next field. On
 * a four-field sign-up that was four dismissals.
 */
test("return moves to the next field unless told otherwise", () => {
  field();
  expect(screen.getByLabelText("Email address").props.returnKeyType).toBe("next");

  field({ placeholder: "Confirm password", kind: "newPassword", returnKeyType: "done" });
  expect(screen.getByLabelText("Confirm password").props.returnKeyType).toBe("done");
});

test("typing reaches the caller", () => {
  const onChangeText = jest.fn();
  field({ onChangeText });
  fireEvent.changeText(screen.getByLabelText("Email address"), "sam@example.com");
  expect(onChangeText).toHaveBeenCalledWith("sam@example.com");
});
