import { fireEvent, render, screen } from "@testing-library/react-native";
import { ExaminerBar, ExaminerCategoryList, ExaminerWarningPill } from "../ExaminerSheet";
import { EXAMINER_CATEGORIES } from "@/lib/examiner";

const bar = {
  minors: 0, majors: 0, credits: 0, lastMark: null,
  onUndo: jest.fn(),
};

const list = {
  minorCounts: {} as Record<string, number>,
  onMark: jest.fn(),
};

test("the collapsed bar shows the running tally", () => {
  render(<ExaminerBar {...bar} minors={3} majors={1} credits={4} />);
  expect(screen.getByTestId("tally-minors")).toHaveTextContent("3 min");
  expect(screen.getByTestId("tally-majors")).toHaveTextContent("1 maj");
  expect(screen.getByTestId("tally-credits")).toHaveTextContent("+4");
});

test("every category gets a minor, a major and a credit button", () => {
  render(<ExaminerCategoryList {...list} />);
  for (const c of EXAMINER_CATEGORIES) {
    expect(screen.getByTestId(`mark-${c.id}-minor`)).toBeTruthy();
    expect(screen.getByTestId(`mark-${c.id}-major`)).toBeTruthy();
    expect(screen.getByTestId(`mark-${c.id}-credit`)).toBeTruthy();
  }
});

// Spec §2: no category is inherently minor or major — the incident decides —
// so the row has to show where the line falls for both levels, before the mark
// is made rather than on the result screen after it.
test("every row shows both the minor and the major example", () => {
  render(<ExaminerCategoryList {...list} />);
  for (const c of EXAMINER_CATEGORIES) {
    expect(screen.getByTestId(`example-minor-${c.id}`)).toHaveTextContent(c.minorExample);
    expect(screen.getByTestId(`example-major-${c.id}`)).toHaveTextContent(c.majorExample);
  }
});

test("the two examples on a row are different text", () => {
  render(<ExaminerCategoryList {...list} />);
  // Guards against a copy-paste that renders minorExample twice — the pair
  // would still be present but the panel would say nothing about the major.
  for (const c of EXAMINER_CATEGORIES) {
    expect(screen.getByTestId(`example-major-${c.id}`)).not.toHaveTextContent(c.minorExample);
  }
});

test("pressing a button reports the category and level", () => {
  const onMark = jest.fn();
  render(<ExaminerCategoryList {...list} onMark={onMark} />);
  fireEvent.press(screen.getByTestId("mark-mirrors-major"));
  expect(onMark).toHaveBeenCalledWith("mirrors", "major");
});

test("undo is offered only once something has been marked", () => {
  const onUndo = jest.fn();
  const { rerender } = render(<ExaminerBar {...bar} />);
  expect(screen.queryByTestId("undo")).toBeNull();

  rerender(<ExaminerBar {...bar} lastMark={{ label: "Use of mirrors", level: "minor" }} onUndo={onUndo} />);
  fireEvent.press(screen.getByTestId("undo"));
  expect(onUndo).toHaveBeenCalledTimes(1);
});

test("a repeated minor is called out on its row", () => {
  render(<ExaminerCategoryList {...list} minorCounts={{ mirrors: 3 }} />);
  expect(screen.getByTestId("warning-mirrors")).toBeTruthy();
});

test("the warning pill shows the habitual category", () => {
  render(<ExaminerWarningPill warning={{ category: "mirrors", label: "Use of mirrors", count: 3 }} />);
  expect(screen.getByTestId("warning-bar")).toHaveTextContent("Use of mirrors");
});
