import { render, screen } from "@testing-library/react-native";
import { EXAMINER_CATEGORIES } from "@/lib/examiner";
import { HowItWorks, MarkingSheet } from "../FirstRun";

test("the three steps are numbered in the order they happen", () => {
  render(<HowItWorks />);
  expect(screen.getByText("Pick a centre")).toBeTruthy();
  expect(screen.getByText("Drive the route")).toBeTruthy();
  expect(screen.getByText("See what to work on")).toBeTruthy();
  expect(screen.getByTestId("step-1")).toHaveTextContent("1");
  expect(screen.getByTestId("step-3")).toHaveTextContent("3");
});

// The sheet is the DVSA's wording or it is worthless for comparison — the same
// argument EXAMINER_CATEGORIES is written down under.
test("the sheet names the examiner's own categories, not reworded ones", () => {
  render(<MarkingSheet />);
  const byId = new Map(EXAMINER_CATEGORIES.map((c) => [c.id, c.label]));
  expect(screen.getByText(byId.get("moveOff")!)).toBeTruthy();
  expect(screen.getByText(byId.get("junctions")!)).toBeTruthy();
});

// Four rows of twenty-three. Saying so is the difference between a preview and
// a claim that this is the whole test.
test("the sheet says how much of it is not being shown", () => {
  render(<MarkingSheet />);
  const hidden = EXAMINER_CATEGORIES.length - 4;
  expect(screen.getByText(new RegExp(`${hidden} more`))).toBeTruthy();
});

// Erith ships four routes, not ten - four of its bearings cross the Thames
// and no loop of test length exists on any of them. A promise the app makes
// on its very first screen has to be true of every centre behind it.
test("the introduction does not promise ten routes at every centre", () => {
  render(<HowItWorks />);

  expect(screen.queryByText(/Ten test-style routes/)).toBeNull();
});
