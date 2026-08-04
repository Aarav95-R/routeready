import { fireEvent, render, screen } from "@testing-library/react-native";
import { ExaminerSheet, ExaminerWarningPill } from "../ExaminerSheet";
import { EXAMINER_CATEGORIES } from "@/lib/examiner";

const base = {
  minors: 0, majors: 0, credits: 0, lastMark: null,
  minorCounts: {},
  onMark: jest.fn(), onUndo: jest.fn(),
};

test("the collapsed bar shows the running tally", () => {
  render(<ExaminerSheet {...base} minors={3} majors={1} credits={4} />);
  expect(screen.getByTestId("tally-minors")).toHaveTextContent("3 min");
  expect(screen.getByTestId("tally-majors")).toHaveTextContent("1 maj");
  expect(screen.getByTestId("tally-credits")).toHaveTextContent("+4");
});

test("every category gets a minor, a major and a credit button", () => {
  render(<ExaminerSheet {...base} />);
  for (const c of EXAMINER_CATEGORIES) {
    expect(screen.getByTestId(`mark-${c.id}-minor`)).toBeTruthy();
    expect(screen.getByTestId(`mark-${c.id}-major`)).toBeTruthy();
    expect(screen.getByTestId(`mark-${c.id}-credit`)).toBeTruthy();
  }
});

test("pressing a button reports the category and level", () => {
  const onMark = jest.fn();
  render(<ExaminerSheet {...base} onMark={onMark} />);
  fireEvent.press(screen.getByTestId("mark-mirrors-major"));
  expect(onMark).toHaveBeenCalledWith("mirrors", "major");
});

test("undo is offered only once something has been marked", () => {
  const onUndo = jest.fn();
  const { rerender } = render(<ExaminerSheet {...base} />);
  expect(screen.queryByTestId("undo")).toBeNull();

  rerender(<ExaminerSheet {...base} lastMark={{ label: "Use of mirrors", level: "minor" }} onUndo={onUndo} />);
  fireEvent.press(screen.getByTestId("undo"));
  expect(onUndo).toHaveBeenCalledTimes(1);
});

test("a repeated minor is called out on its row", () => {
  render(<ExaminerSheet {...base} minorCounts={{ mirrors: 3 }} />);
  expect(screen.getByTestId("warning-mirrors")).toBeTruthy();
});

test("the warning pill shows the habitual category", () => {
  render(<ExaminerWarningPill warning={{ category: "mirrors", label: "Use of mirrors", count: 3 }} />);
  expect(screen.getByTestId("warning-bar")).toHaveTextContent("Use of mirrors");
});
