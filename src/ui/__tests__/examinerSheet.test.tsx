import { fireEvent, render, screen } from "@testing-library/react-native";
import { ExaminerMarkList, ExaminerScoreHeader } from "../ExaminerSheet";
import { EXAMINER_CATEGORIES, type MarkCounts } from "@/lib/examiner";
import { MAX_MINORS } from "@/lib/scoring/engine";

const header = {
  minors: 0, remaining: MAX_MINORS, stopped: false,
  canUndo: false, onUndo: jest.fn(),
};

const list = {
  counts: {} as Record<string, MarkCounts>,
  minors: 0, majors: 0, credits: 0,
  clock: "12:04",
  onMark: jest.fn(),
};

const counts = (over: Partial<MarkCounts>): MarkCounts =>
  ({ minor: 0, major: 0, credit: 0, ...over });

// ── The pinned score ──────────────────────────────────────────────────────

test("the score reports headroom, not a raw tally", () => {
  render(<ExaminerScoreHeader {...header} minors={3} remaining={12} />);
  expect(screen.getByTestId("headroom")).toHaveTextContent("12 driving faults left");
});

test("the meter draws one tick per allowed driving fault", () => {
  render(<ExaminerScoreHeader {...header} />);
  expect(screen.getByTestId("fault-meter").props.accessibilityValue).toEqual({
    min: 0, max: MAX_MINORS, now: 0,
  });
});

test("the headroom never reads below zero, and the meter never overfills", () => {
  render(<ExaminerScoreHeader {...header} minors={20} remaining={0} />);
  expect(screen.getByTestId("headroom")).toHaveTextContent("No driving faults left");
  expect(screen.getByTestId("fault-meter").props.accessibilityValue.now).toBe(MAX_MINORS);
});

// A mark made without looking still has to be confirmed to anyone using
// VoiceOver, and the headroom sentence is the confirmation.
test("the headroom announces itself", () => {
  render(<ExaminerScoreHeader {...header} />);
  expect(screen.getByTestId("headroom").props.accessibilityLiveRegion).toBe("polite");
});

test("undo is offered only once something has been marked", () => {
  const onUndo = jest.fn();
  const { rerender } = render(<ExaminerScoreHeader {...header} />);
  expect(screen.queryByTestId("undo")).toBeNull();

  rerender(<ExaminerScoreHeader {...header} canUndo onUndo={onUndo} />);
  fireEvent.press(screen.getByTestId("undo"));
  expect(onUndo).toHaveBeenCalledTimes(1);
});

// ── The list ──────────────────────────────────────────────────────────────
//
// The whole point of going back to a listed sheet: nothing is hidden behind a
// drill-down, so every fault an examiner can give is on the one surface.

test("every category is listed, with a minus, a plus and a serious on its row", () => {
  render(<ExaminerMarkList {...list} />);
  for (const c of EXAMINER_CATEGORIES) {
    expect(screen.getByTestId(`category-${c.id}`)).toBeTruthy();
    expect(screen.getByTestId(`mark-${c.id}-minor`)).toBeTruthy();
    expect(screen.getByTestId(`mark-${c.id}-credit`)).toBeTruthy();
    expect(screen.getByTestId(`mark-${c.id}-major`)).toBeTruthy();
  }
});

test("minus records a driving fault", () => {
  const onMark = jest.fn();
  render(<ExaminerMarkList {...list} onMark={onMark} />);
  fireEvent.press(screen.getByTestId("mark-mirrors-minor"));
  expect(onMark).toHaveBeenCalledWith("mirrors", "minor");
});

test("plus gives a credit", () => {
  const onMark = jest.fn();
  render(<ExaminerMarkList {...list} onMark={onMark} />);
  fireEvent.press(screen.getByTestId("mark-mirrors-credit"));
  expect(onMark).toHaveBeenCalledWith("mirrors", "credit");
});

test("the serious button records a serious fault", () => {
  const onMark = jest.fn();
  render(<ExaminerMarkList {...list} onMark={onMark} />);
  fireEvent.press(screen.getByTestId("mark-mirrors-major"));
  expect(onMark).toHaveBeenCalledWith("mirrors", "major");
});

// The count sits between the two buttons so the feedback is under the finger.
test("the row's count is the driving faults given on it", () => {
  render(<ExaminerMarkList {...list} counts={{ mirrors: counts({ minor: 3, credit: 1 }) }} />);
  expect(screen.getByTestId("count-mirrors")).toHaveTextContent("3");
  expect(screen.getByTestId("count-junctions")).toHaveTextContent("0");
});

test("a serious fault is called out on its row", () => {
  render(<ExaminerMarkList {...list} counts={{ junctions: counts({ major: 1 }) }} />);
  expect(screen.getByTestId("serious-junctions")).toHaveTextContent("Serious fault");
});

test("a credit is called out on its row", () => {
  render(<ExaminerMarkList {...list} counts={{ moveOff: counts({ credit: 2 }) }} />);
  expect(screen.getByTestId("credit-moveOff")).toHaveTextContent("2 done well");
});

// ── The examples ──────────────────────────────────────────────────────────
//
// Two 12 pt example lines per row are why only three of twenty-three rows fit
// on screen before. They are still here, one tap behind the name.

test("the examples are hidden until the name is tapped", () => {
  render(<ExaminerMarkList {...list} />);
  expect(screen.queryByTestId("example-minor-mirrors")).toBeNull();

  fireEvent.press(screen.getByTestId("category-mirrors"));

  const mirrors = EXAMINER_CATEGORIES.find((c) => c.id === "mirrors")!;
  expect(screen.getByTestId("example-minor-mirrors")).toHaveTextContent(mirrors.minorExample);
  expect(screen.getByTestId("example-major-mirrors")).toHaveTextContent(mirrors.majorExample);
});

test("tapping the name again closes it", () => {
  render(<ExaminerMarkList {...list} />);
  fireEvent.press(screen.getByTestId("category-mirrors"));
  fireEvent.press(screen.getByTestId("category-mirrors"));
  expect(screen.queryByTestId("example-minor-mirrors")).toBeNull();
});

// Two examples already push the next heading down; twenty-three open at once
// would make the sheet unusable as a list.
test("only one row's examples are open at a time", () => {
  render(<ExaminerMarkList {...list} />);
  fireEvent.press(screen.getByTestId("category-mirrors"));
  fireEvent.press(screen.getByTestId("category-junctions"));

  expect(screen.queryByTestId("example-minor-mirrors")).toBeNull();
  expect(screen.getByTestId("example-minor-junctions")).toBeTruthy();
});

// Every category carries both, and no category is inherently one or the other
// — the incident decides, which is why the row shows where the line falls.
test("every category has a distinct driving-fault and serious example", () => {
  render(<ExaminerMarkList {...list} />);
  for (const c of EXAMINER_CATEGORIES) {
    fireEvent.press(screen.getByTestId(`category-${c.id}`));
    expect(screen.getByTestId(`example-minor-${c.id}`)).toHaveTextContent(c.minorExample);
    expect(screen.getByTestId(`example-major-${c.id}`)).toHaveTextContent(c.majorExample);
    expect(screen.getByTestId(`example-major-${c.id}`)).not.toHaveTextContent(c.minorExample);
  }
});

// ── Reading it out loud ───────────────────────────────────────────────────

test("a button says what pressing it does, not which level it is", () => {
  render(<ExaminerMarkList {...list} />);
  expect(screen.getByTestId("mark-mirrors-minor").props.accessibilityLabel)
    .toBe("Add a driving fault to Use of mirrors");
  expect(screen.getByTestId("mark-mirrors-credit").props.accessibilityLabel)
    .toBe("Give a credit for Use of mirrors");
  expect(screen.getByTestId("mark-mirrors-major").props.accessibilityLabel)
    .toBe("Record a serious fault for Use of mirrors");
});

test("a marked row reads its count", () => {
  render(<ExaminerMarkList {...list} counts={{ mirrors: counts({ minor: 3 }) }} />);
  expect(screen.getByTestId("category-mirrors").props.accessibilityLabel)
    .toBe("Use of mirrors, 3 driving faults");
});

test("the running detail names every level", () => {
  render(<ExaminerMarkList {...list} minors={3} majors={1} credits={2} />);
  expect(screen.getByTestId("live-detail")).toHaveTextContent("3 driving faults · 1 serious · +2 credit");
});

test("no serious faults is said, not left out", () => {
  render(<ExaminerMarkList {...list} minors={1} />);
  expect(screen.getByTestId("live-detail")).toHaveTextContent("1 driving fault · no serious");
});
