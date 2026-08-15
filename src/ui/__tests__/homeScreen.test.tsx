import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useFocusEffect: (cb: () => void) => require("react").useEffect(cb, [cb]),
}));
jest.mock("@/services/progressRepo", () => ({ listMyProgress: jest.fn() }));

// eslint-disable-next-line import/first
import { listMyProgress } from "@/services/progressRepo";
// eslint-disable-next-line import/first
import { useSession } from "@/stores/sessionStore";
// eslint-disable-next-line import/first
import type { ProgressEntryWithRoute } from "@/types/db";
// eslint-disable-next-line import/first
import Home from "../../../app/(tabs)/index";

const mockProgress = listMyProgress as jest.MockedFunction<typeof listMyProgress>;

const at = (iso: string, score: number | null, mistakes: string[] = []): ProgressEntryWithRoute => ({
  user_id: "u1", route_id: "r1", completed_at: iso,
  mock_test_score: score, mistakes, duration_seconds: 2460,
  routes: { name: "Route 3", centre_id: "c1", centres: { name: "Mill Hill (London)" } },
});

const signedInAs = (full_name?: string) =>
  useSession.setState({
    session: { user: { id: "u1", email: "a@b.com", user_metadata: full_name ? { full_name } : {} } } as never,
    initialized: true,
  });

/** Recent enough that "it's been a fortnight" never wins over what is asserted. */
const recent = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

const rowsAre = (...rows: ProgressEntryWithRoute[]) =>
  mockProgress.mockResolvedValue({ data: rows, stale: false });

beforeEach(() => {
  mockPush.mockClear();
  signedInAs("Sumeet Raheja");
  rowsAre();
});

test("the tab names itself rather than greeting you", async () => {
  render(<Home />);
  expect(await screen.findByText("Home")).toBeTruthy();
  expect(screen.queryByText(/Good (morning|afternoon|evening)/)).toBeNull();
});

test("a new account is asked for a first test, and sent where one starts", async () => {
  render(<Home />);
  expect(await screen.findByText("Your first mock test")).toBeTruthy();
  fireEvent.press(screen.getByText("Find a test centre near me"));
  expect(mockPush).toHaveBeenCalledWith("/centres");
});

test("the recurring fault leads, with the record beneath it", async () => {
  rowsAre(
    at(recent(20), 60, ["Junction observations", "Speeding"]),
    at(recent(9), 65, ["Junction observations"]),
    at(recent(1), 78, ["Junction observations"]),
  );
  render(<Home />);

  expect(await screen.findByTestId("diagnosis")).toHaveTextContent("Junction observations");
  expect(screen.getByText(/Marked in 3 of your 3 mock tests/)).toBeTruthy();
  expect(screen.getByTestId("latest-score")).toHaveTextContent("78");
});

test("one test is asked for a second rather than diagnosed", async () => {
  rowsAre(at(recent(1), 55, ["Speeding"]));
  render(<Home />);
  expect(await screen.findByText("Take a second mock test")).toBeTruthy();
  expect(screen.queryByTestId("fault-bars")).toBeNull();
});

test("a clean record is told so, not given an invented weakness", async () => {
  rowsAre(at(recent(9), 100), at(recent(1), 95));
  render(<Home />);
  expect(await screen.findByText("Nothing is costing you yet")).toBeTruthy();
});

// Home is not a read-only screen after your first score. This is the
// regression the redesign fixes.
test("there is always somewhere to go", async () => {
  rowsAre(at(recent(9), 60, ["Speeding"]), at(recent(1), 78, ["Speeding"]));
  render(<Home />);
  fireEvent.press(await screen.findByText("Start a mock test"));
  expect(mockPush).toHaveBeenCalledWith("/centres");
});

// No cache and no network. The button never needed one either.
test("a failed load still offers the way in", async () => {
  mockProgress.mockRejectedValue(new Error("offline"));
  render(<Home />);

  await waitFor(() => expect(screen.getByText(/back online/)).toBeTruthy());
  fireEvent.press(screen.getByText("Find a test centre near me"));
  expect(mockPush).toHaveBeenCalledWith("/centres");
});

test("the gear opens the account screen", async () => {
  render(<Home />);
  fireEvent.press(await screen.findByLabelText("Settings"));
  expect(mockPush).toHaveBeenCalledWith("/settings");
});
