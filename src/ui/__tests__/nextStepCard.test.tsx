import { fireEvent, render, screen } from "@testing-library/react-native";
import type { NextStep } from "@/lib/homeView";
import { NextStepCard } from "../NextStepCard";

const show = (step: NextStep, onAction = jest.fn()) => {
  render(<NextStepCard step={step} onAction={onAction} />);
  return onAction;
};

test("a new account is asked for a first test, and sent where one starts", () => {
  const onAction = show({ kind: "first" });
  expect(screen.getByText("Your first mock test")).toBeTruthy();
  fireEvent.press(screen.getByText("Find a test centre near me"));
  expect(onAction).toHaveBeenCalled();
});

test("one test is asked for a second, and names what that test cost", () => {
  show({ kind: "baseline", tags: ["Speeding", "Use of mirrors"] });
  expect(screen.getByText("Take a second mock test")).toBeTruthy();
  expect(screen.getByText("Speeding")).toBeTruthy();
  expect(screen.getByText("Use of mirrors")).toBeTruthy();
  // Unranked. One test cannot rank anything.
  expect(screen.queryByTestId("fault-bars")).toBeNull();
});

test("a clean record says so rather than inventing a weakness", () => {
  show({ kind: "clean" });
  expect(screen.getByText("Nothing is costing you yet")).toBeTruthy();
  expect(screen.queryByTestId("fault-bars")).toBeNull();
});

test("a tie names both faults and asks for the tiebreaker", () => {
  show({ kind: "tied", tags: ["Junction observations", "Use of mirrors"] });
  expect(screen.getByText("Two faults are level")).toBeTruthy();
  expect(screen.getByText(/Junction observations and Use of mirrors/)).toBeTruthy();
});

test("a clear leader is named, and the sentence beneath counts tests", () => {
  show({
    kind: "fault", tag: "Junction observations", count: 4, of: 5,
    runners: [{ tag: "Use of mirrors", count: 3 }],
  });
  expect(screen.getByTestId("diagnosis")).toHaveTextContent("Junction observations");
  expect(screen.getByText(/Marked in 4 of your 5 mock tests/)).toBeTruthy();
  expect(screen.getByTestId("fault-bars")).toBeTruthy();
});

// The count is of tests containing the fault, because aggregate dedupes tags
// per test. Saying "4 faults" would be a different and untrue claim.
test("the sentence never claims a number of faults", () => {
  show({
    kind: "fault", tag: "Junction observations", count: 4, of: 5,
    runners: [],
  });
  expect(screen.queryByText(/4 faults/)).toBeNull();
});
