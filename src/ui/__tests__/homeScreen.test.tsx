import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useFocusEffect: (cb: () => void) => require("react").useEffect(cb, [cb]),
}));
jest.mock("@/services/progressRepo", () => ({ listMyProgress: jest.fn() }));
jest.mock("@/services/welcome", () => ({
  hasSeenWelcome: jest.fn(),
  markWelcomeSeen: jest.fn().mockResolvedValue(undefined),
}));

import { listMyProgress } from "@/services/progressRepo";
import { hasSeenWelcome, markWelcomeSeen } from "@/services/welcome";
import { useDevPreview } from "@/stores/devPreview";
import { useSession } from "@/stores/sessionStore";
import type { ProgressEntryWithRoute } from "@/types/db";
import Home from "../../../app/(tabs)/index";

const mockProgress = listMyProgress as jest.MockedFunction<typeof listMyProgress>;
const mockSeen = hasSeenWelcome as jest.MockedFunction<typeof hasSeenWelcome>;
const mockMarkSeen = markWelcomeSeen as jest.MockedFunction<typeof markWelcomeSeen>;

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
  mockMarkSeen.mockClear();
  signedInAs("Sumeet Raheja");
  useDevPreview.setState({ firstRun: false });
  rowsAre();
  // Default to the welcome already behind us, so every test below describes
  // the steady-state screen unless it says otherwise. The tests that are about
  // the welcome set this to false themselves.
  mockSeen.mockResolvedValue(true);
});

// The tab bar already says Home. The name is the one thing this screen knows
// that the tab bar does not — and sign-up went to the trouble of asking.
test("a brand-new account is welcomed by name", async () => {
  render(<Home />);
  expect(await screen.findByText("Welcome, Sumeet")).toBeTruthy();
  expect(screen.queryByText("Home")).toBeNull();
});

// Which salutation is right depends on whether this account has ever driven
// anything, and until the rows land nobody knows. Guessing means a brand-new
// account watches "Good evening" turn into "Welcome" a frame later.
test("the title waits for the record rather than greeting you twice", () => {
  mockProgress.mockReturnValue(new Promise(() => {}));
  render(<Home />);
  expect(screen.queryByText(/^(Welcome|Good (morning|afternoon|evening))/)).toBeNull();
});

test("an account with a record is greeted by the time of day instead", async () => {
  rowsAre(at(recent(1), 78, ["Junctions"]));
  render(<Home />);
  expect(await screen.findByText(/^Good (morning|afternoon|evening), Sumeet$/)).toBeTruthy();
});

// firstName("") is "", and "Welcome, " would be worse than no name at all.
test("an account with no name is welcomed without a dangling comma", async () => {
  signedInAs(undefined);
  render(<Home />);
  expect(await screen.findByText("Welcome")).toBeTruthy();
});

test("the line under the name is the app's own reading of the record", async () => {
  render(<Home />);
  expect(await screen.findByText(/where you.re starting from/)).toBeTruthy();
});

test("a new account is asked for a first test, and sent where one starts", async () => {
  render(<Home />);
  expect(await screen.findByText("Your first drive")).toBeTruthy();
  fireEvent.press(screen.getAllByText("Find a test centre near me")[0]);
  expect(mockPush).toHaveBeenCalledWith("/centres");
});

// The introduction is four panels long. Reading to the end of it and finding
// nothing to press means scrolling back up to the top to act.
test("the introduction ends with the same way in it opened with", async () => {
  render(<Home />);
  const actions = await screen.findAllByText("Find a test centre near me");
  expect(actions).toHaveLength(2);
  fireEvent.press(actions[1]);
  expect(mockPush).toHaveBeenCalledWith("/centres");
});

// One screen, one action, said twice only while the screen is long enough to
// lose it.
test("a screen with a record carries its action once", async () => {
  rowsAre(at(recent(1), 78, ["Junctions"]));
  render(<Home />);
  await screen.findByTestId("latest-score");
  expect(screen.getAllByText("Start a mock test")).toHaveLength(1);
});

// Most people open this app in the evening, indoors, nowhere near a car.
test("a first run explains itself and offers something to do indoors", async () => {
  render(<Home />);
  expect(await screen.findByText("Pick a centre")).toBeTruthy();
  fireEvent.press(screen.getByText("Theory quiz"));
  expect(mockPush).toHaveBeenCalledWith("/quiz");
});

test("the introduction goes away once there is a record", async () => {
  rowsAre(at(recent(1), 78, ["Junctions"]));
  render(<Home />);
  await screen.findByTestId("latest-score");
  expect(screen.queryByText("Pick a centre")).toBeNull();
  expect(screen.queryByText("Theory quiz")).toBeNull();
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

// An empty screen because the network failed is not the same as an empty
// screen because you are new, and only one of them should be taught the app.
test("a failed load is not treated as a first run", async () => {
  mockProgress.mockRejectedValue(new Error("offline"));
  render(<Home />);

  await waitFor(() => expect(screen.getByText(/back online/)).toBeTruthy());
  expect(screen.queryByText("Pick a centre")).toBeNull();
  // Nor is it read a verdict on a record it could not load.
  expect(screen.queryByText(/where you.re starting from/)).toBeNull();
});

test("the gear opens the account screen", async () => {
  render(<Home />);
  fireEvent.press(await screen.findByLabelText("Settings"));
  expect(mockPush).toHaveBeenCalledWith("/settings");
});

// Whoever is building the first-run screen has an account with drives on it,
// and no first-run screen. The preview stands in for the empty record rather
// than for the flag, so every panel below the header is the real thing.
test("the first-run screen can be previewed from an account that has driven", async () => {
  rowsAre(at(recent(1), 78, ["Junctions"]));
  useDevPreview.setState({ firstRun: true });
  render(<Home />);

  expect(await screen.findByText("Welcome, Sumeet")).toBeTruthy();
  expect(screen.getByText("Pick a centre")).toBeTruthy();
  expect(screen.getByTestId("marking-sheet")).toBeTruthy();
  expect(screen.queryByTestId("latest-score")).toBeNull();
});

// ── The welcome ────────────────────────────────────────────────────────────
//
// Home already had two ways to Centres, both drawn off an empty record. Neither
// says anything about the account having just been made — a state you leave by
// acting once, not by driving.

const brandNew = () => mockSeen.mockResolvedValue(false);

test("an account that has just been made is welcomed above everything else", async () => {
  brandNew();
  render(<Home />);
  expect(await screen.findByTestId("welcome-banner")).toBeTruthy();
  expect(screen.getByText("You're all set up")).toBeTruthy();
});

test("the welcome is the way to the centres list, and does not come back", async () => {
  brandNew();
  render(<Home />);
  fireEvent.press(await screen.findByText("Browse test centres"));

  expect(mockPush).toHaveBeenCalledWith("/centres");
  expect(mockMarkSeen).toHaveBeenCalledWith("u1");
  await waitFor(() => expect(screen.queryByTestId("welcome-banner")).toBeNull());
});

// Most people open this app in the evening, nowhere near a car. Putting the
// strip away has to be possible without pretending to go and drive.
test("it can be dismissed without going anywhere", async () => {
  brandNew();
  render(<Home />);
  fireEvent.press(await screen.findByLabelText("Dismiss welcome"));

  await waitFor(() => expect(screen.queryByTestId("welcome-banner")).toBeNull());
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockMarkSeen).toHaveBeenCalledWith("u1");
});

// The record is still empty at this point — they looked at Centres and came
// back. The introduction below is still right; welcoming them twice is not.
test("coming back to an empty record is not a second welcome", async () => {
  render(<Home />);
  expect(await screen.findByText("Your first drive")).toBeTruthy();
  expect(screen.queryByTestId("welcome-banner")).toBeNull();
});

test("an account with a record is never welcomed, whatever the flag says", async () => {
  brandNew();
  rowsAre(at(recent(1), 78, ["Junctions"]));
  render(<Home />);
  await screen.findByTestId("latest-score");
  expect(screen.queryByTestId("welcome-banner")).toBeNull();
});

// An empty screen because the network failed is not an account that was just
// created, and the welcome would be the app's most confident wrong claim yet.
test("a failed load is not welcomed either", async () => {
  brandNew();
  mockProgress.mockRejectedValue(new Error("offline"));
  render(<Home />);
  await waitFor(() => expect(screen.getByText(/back online/)).toBeTruthy());
  expect(screen.queryByTestId("welcome-banner")).toBeNull();
});

// The strip must never appear before the record has said whether this is a
// first run — a welcome that pops in above a diagnosis is worse than a late one.
test("nothing is welcomed while the record is still in flight", () => {
  brandNew();
  mockProgress.mockReturnValue(new Promise(() => {}));
  render(<Home />);
  expect(screen.queryByTestId("welcome-banner")).toBeNull();
});

// The preview stands in for first-run state, not for the branch — and a
// developer who dismissed this once would otherwise never see it again.
test("the dev preview shows the welcome to an account that has driven", async () => {
  rowsAre(at(recent(1), 78, ["Junctions"]));
  useDevPreview.setState({ firstRun: true });
  render(<Home />);
  expect(await screen.findByTestId("welcome-banner")).toBeTruthy();
});
