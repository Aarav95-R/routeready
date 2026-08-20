import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { ErrorBoundary } from "../ErrorBoundary";

// React logs the caught error to the console on its way past the boundary,
// which is correct behaviour and pure noise in a suite that causes four of
// them on purpose. Silenced per-file rather than globally so a throw in any
// other suite still shows up.
let consoleError: jest.SpyInstance;
beforeAll(() => { consoleError = jest.spyOn(console, "error").mockImplementation(() => {}); });
afterAll(() => { consoleError.mockRestore(); });

function Boom({ throws }: { throws: boolean }): React.ReactElement {
  if (throws) throw new Error("the map failed to load");
  return <Text>the real screen</Text>;
}

test("a child that renders passes straight through", () => {
  render(
    <ErrorBoundary>
      <Text>the real screen</Text>
    </ErrorBoundary>
  );

  expect(screen.getByText("the real screen")).toBeTruthy();
  expect(screen.queryByTestId("error-boundary")).toBeNull();
});

test("a throw is caught and shown rather than blanking the app", () => {
  render(
    <ErrorBoundary>
      <Boom throws />
    </ErrorBoundary>
  );

  expect(screen.getByTestId("error-boundary")).toBeTruthy();
  expect(screen.getByText("Something broke")).toBeTruthy();
});

// The one thing the person on the other side of this screen actually needs to
// know, and the reason the copy says it in as many words.
test("the screen promises the account is untouched", () => {
  render(
    <ErrorBoundary>
      <Boom throws />
    </ErrorBoundary>
  );

  expect(screen.getByText(/untouched/)).toBeTruthy();
});

test("the message travels with the screen, so a person can read it back", () => {
  render(
    <ErrorBoundary>
      <Boom throws />
    </ErrorBoundary>
  );

  expect(screen.getByText("the map failed to load")).toBeTruthy();
});

// The injection point a crash reporter hangs off. Asserted here because the
// wiring in app/_layout.tsx is a one-liner that is easy to drop.
test("the error is handed to the reporter with its component stack", () => {
  const onError = jest.fn();

  render(
    <ErrorBoundary onError={onError}>
      <Boom throws />
    </ErrorBoundary>
  );

  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  expect(onError.mock.calls[0][0].message).toBe("the map failed to load");
  expect(onError.mock.calls[0][1]).toHaveProperty("componentStack");
});

// Resetting remounts the children. A child that has stopped throwing comes
// back; one that still throws is caught again rather than escaping.
test("Back to the app remounts the children", () => {
  const { rerender } = render(
    <ErrorBoundary>
      <Boom throws />
    </ErrorBoundary>
  );
  expect(screen.getByTestId("error-boundary")).toBeTruthy();

  rerender(
    <ErrorBoundary>
      <Boom throws={false} />
    </ErrorBoundary>
  );
  fireEvent.press(screen.getByText("Back to the app"));

  expect(screen.getByText("the real screen")).toBeTruthy();
  expect(screen.queryByTestId("error-boundary")).toBeNull();
});
