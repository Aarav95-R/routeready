import { render, screen } from "@testing-library/react-native";
import { scoreSummary } from "@/lib/homeView";
import type { ProgressEntryWithRoute } from "@/types/db";
import { RecordCard } from "../RecordCard";

const at = (
  iso: string, score: number | null, route: ProgressEntryWithRoute["routes"] = {
    name: "Route 3", centre_id: "c1", centres: { name: "Mill Hill (London)" },
  }
): ProgressEntryWithRoute => ({
  user_id: "u1", route_id: "r1", completed_at: iso,
  mock_test_score: score, mistakes: [], duration_seconds: 2460, routes: route,
});

const show = (rows: ProgressEntryWithRoute[], failed = false) =>
  render(<RecordCard summary={scoreSummary(rows)} rows={rows} width={310} failed={failed} />);

test("the latest score leads, against the scale it is out of", () => {
  show([at("2026-08-01T10:00:00Z", 80), at("2026-08-12T10:00:00Z", 88)]);
  expect(screen.getByTestId("latest-score")).toHaveTextContent("88");
  expect(screen.getByText("/100")).toBeTruthy();
});

test("the change on the last test is a mark, not a sentence", () => {
  show([at("2026-08-01T10:00:00Z", 80), at("2026-08-12T10:00:00Z", 88)]);
  expect(screen.getByTestId("delta")).toHaveTextContent("▲ 8");
  expect(screen.queryByText(/on your last/)).toBeNull();
});

// A lone point is centred by sparkPoints, which is correct behaviour and an
// incorrect picture.
test("one score draws no line, and says so", () => {
  show([at("2026-08-12T10:00:00Z", 55)]);
  expect(screen.queryByTestId("spark")).toBeNull();
  expect(screen.getByText(/One score draws no line/)).toBeTruthy();
  expect(screen.queryByTestId("stat-row")).toBeNull();
});

test("two scores draw the line, and name both its ends", () => {
  show([at("2026-07-14T10:00:00Z", 55), at("2026-08-12T10:00:00Z", 88)]);
  expect(screen.getByTestId("spark")).toBeTruthy();
  expect(screen.getByText(/^55 on /)).toBeTruthy();
  expect(screen.getByText(/^88 on /)).toBeTruthy();
});

test("the stat row carries best and average, and not the count", () => {
  show([
    at("2026-07-14T10:00:00Z", 55), at("2026-08-01T10:00:00Z", 70),
    at("2026-08-12T10:00:00Z", 88),
  ]);
  expect(screen.getByTestId("stat-best")).toHaveTextContent("88");
  expect(screen.getByTestId("stat-average")).toHaveTextContent("71");
  // The header already said it. Twice in one card is once too many.
  expect(screen.getByText("3 mock tests")).toBeTruthy();
  expect(screen.queryByTestId("stat-tests")).toBeNull();
});

test("history rows name the drive and how long it took", () => {
  show([at("2026-08-12T10:00:00Z", 88)]);
  expect(screen.getByText("Route 3 · Mill Hill (London)")).toBeTruthy();
  expect(screen.getByText("41 min")).toBeTruthy();
});

// A route deleted after the test was taken must not blank the row.
test("a row whose route is gone still shows its score", () => {
  show([at("2026-08-12T10:00:00Z", 88, null)]);
  expect(screen.getByTestId("history-score-0")).toHaveTextContent("88");
  expect(screen.queryByText(/·/)).toBeNull();
});

test("only the three most recent drives are listed", () => {
  show([
    at("2026-07-01T10:00:00Z", 40), at("2026-07-14T10:00:00Z", 55),
    at("2026-08-01T10:00:00Z", 70), at("2026-08-12T10:00:00Z", 88),
  ]);
  expect(screen.getByTestId("history-score-0")).toHaveTextContent("88");
  expect(screen.getByTestId("history-score-2")).toHaveTextContent("55");
  expect(screen.queryByTestId("history-score-3")).toBeNull();
});

test("no tests at all says what the card will become", () => {
  show([]);
  expect(screen.getByText(/Your first score lands here/)).toBeTruthy();
  expect(screen.queryByTestId("latest-score")).toBeNull();
});

// No cache and no network — a different sentence from a genuinely new account.
test("a failed load says why it is empty", () => {
  show([], true);
  expect(screen.getByText(/back online/)).toBeTruthy();
});

// A test taken on the train is queued locally with no server timestamp. It is
// still the most recent thing that happened and must not render as a fault of
// the date parser.
test("a drive not yet synced says so instead of showing a broken date", () => {
  render(
    <RecordCard
      summary={scoreSummary([
        { user_id: "u1", route_id: "r1", mock_test_score: 88, mistakes: [], duration_seconds: 2460 },
      ])}
      rows={[
        {
          user_id: "u1", route_id: "r1", mock_test_score: 88, mistakes: [],
          duration_seconds: 2460, routes: null,
        },
      ]}
      width={310}
      failed={false}
    />
  );
  expect(screen.getByText("Not yet synced")).toBeTruthy();
  expect(screen.queryByText(/Invalid Date/)).toBeNull();
});

// Green means good everywhere else in this app; a dip is stated, not scolded.
test("a score that fell is marked without being coloured as a win", () => {
  show([at("2026-08-01T10:00:00Z", 88), at("2026-08-12T10:00:00Z", 80)]);
  const delta = screen.getByTestId("delta");
  expect(delta).toHaveTextContent("▼ 8");
  expect(delta.props.className).not.toContain("text-accent-pressed");
  expect(delta.props.className).toContain("bg-slate-100");
});
