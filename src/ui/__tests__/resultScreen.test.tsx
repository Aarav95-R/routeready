import { render, screen } from "@testing-library/react-native";

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "route-1" }),
  useRouter: () => ({ dismissTo: jest.fn() }),
}));

type SavedEntry = { deviations?: Deviation[]; mistakes: string[]; mock_test_score: number | null };
const mockSaveProgress = jest.fn<Promise<void>, [SavedEntry]>(() => Promise.resolve());
jest.mock("@/services/progressRepo", () => ({ saveProgress: (e: SavedEntry) => mockSaveProgress(e) }));

import { useMockTest } from "@/stores/mockTestStore";
import type { Deviation } from "@/types/db";
import Result from "../../../app/route/[id]/result";

const deviation = (over: Partial<Deviation> = {}): Deviation => ({
  atIdx: 40, skippedM: 380, seconds: 47, ...over,
});

/** A finished run with no faults, so only the deviation row is under test. */
function finishedRun(deviations: Deviation[]) {
  useMockTest.getState().reset();
  useMockTest.setState({
    deviations,
    result: {
      passed: true, score: 92, minors: 0, majors: 0,
      durationSeconds: 2400, faults: [], tags: [],
    } as never,
  });
}

beforeEach(() => mockSaveProgress.mockClear());

test("a clean drive with no departures says nothing about the route", () => {
  finishedRun([]);
  render(<Result />);
  expect(screen.queryByText(/Went off route/)).toBeNull();
});

test("one departure is counted in words, not digits", () => {
  finishedRun([deviation()]);
  render(<Result />);
  expect(screen.getByText("Went off route once")).toBeTruthy();
});

test("several departures are counted, and the skipped distance is summed", () => {
  finishedRun([deviation({ skippedM: 380 }), deviation({ skippedM: 240 })]);
  render(<Result />);
  expect(screen.getByText("Went off route 2 times")).toBeTruthy();
  expect(screen.getByText(/620 m of the route not driven/)).toBeTruthy();
});

test("the row says plainly that it is not a fault", () => {
  finishedRun([deviation()]);
  render(<Result />);
  expect(screen.getByText(/not a fault/)).toBeTruthy();
});

test("departures are saved with the run, and never as mistakes", () => {
  const d = [deviation()];
  finishedRun(d);
  render(<Result />);
  expect(mockSaveProgress).toHaveBeenCalledTimes(1);
  const entry = mockSaveProgress.mock.calls[0][0];
  expect(entry.deviations).toEqual(d);
  // The whole point of the column: a departure cannot reach the marking sheet.
  expect(entry.mistakes).toEqual([]);
  expect(entry.mock_test_score).toBe(92);
});
