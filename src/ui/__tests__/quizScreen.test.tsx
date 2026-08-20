import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb: () => void) => require("react").useEffect(cb, [cb]),
}));
jest.mock("@/services/quizRepo", () => ({ listQuestions: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { listQuestions } from "@/services/quizRepo";
import { recordAnswer } from "@/services/quizResults";
import type { QuizCategory, QuizQuestion } from "@/types/db";
import Quiz from "../../../app/(tabs)/quiz";

const mockList = listQuestions as jest.MockedFunction<typeof listQuestions>;

const q = (
  id: string, category: QuizCategory, topic: string, is_show_me = false,
): QuizQuestion => ({
  id, category, topic, is_show_me,
  question: `Tell me how you'd check ${topic.toLowerCase()}.`,
  answer: `The model answer for ${topic.toLowerCase()}.`,
  choices: [
    { text: "Right", correct: true }, { text: "Wrong 1", correct: false },
    { text: "Wrong 2", correct: false }, { text: "Wrong 3", correct: false },
  ],
});

const SEEDED = [
  q("s1", "safety", "Tyre tread and condition"),
  q("s2", "safety", "Head restraint"),
  q("i1", "inside_car", "The horn", true),
  q("u1", "under_bonnet", "Engine oil"),
];

beforeEach(async () => {
  mockPush.mockClear();
  mockList.mockReset();
  mockList.mockResolvedValue({ data: SEEDED, stale: false });
  await AsyncStorage.clear();
});

test("every question in the bank is listed, under its category", async () => {
  render(<Quiz />);
  expect(await screen.findByText("Tyre tread and condition")).toBeTruthy();
  expect(screen.getByText("Safety and the outside")).toBeTruthy();
  expect(screen.getByText("Inside the car")).toBeTruthy();
  expect(screen.getByText("Under the bonnet")).toBeTruthy();
});

test("a row leads with the subject, not with the six words every question opens with", async () => {
  // Left as written the list is nineteen rows of "Tell me how you'd check…"
  // and nothing is scannable.
  render(<Quiz />);
  expect(await screen.findByText("The horn")).toBeTruthy();
  expect(screen.queryByText("Tell me how you'd check the horn.")).toBeNull();
});

test("a row says which way the examiner will ask", async () => {
  render(<Quiz />);
  await screen.findByText("The horn");
  expect(screen.getAllByText("Show me")).toHaveLength(1);
  expect(screen.getAllByText("Tell me")).toHaveLength(3);
});

test("tapping a row reveals the question in full and the answer to say", async () => {
  render(<Quiz />);
  fireEvent.press(await screen.findByTestId("quiz-row-i1"));
  expect(await screen.findByText("Tell me how you'd check the horn.")).toBeTruthy();
  expect(screen.getByText(/The model answer for the horn\./)).toBeTruthy();
});

test("opening a second row closes the first, so the list never becomes a wall of text", async () => {
  render(<Quiz />);
  fireEvent.press(await screen.findByTestId("quiz-row-i1"));
  await screen.findByText("Tell me how you'd check the horn.");
  fireEvent.press(screen.getByTestId("quiz-row-u1"));
  await screen.findByText("Tell me how you'd check engine oil.");
  expect(screen.queryByText("Tell me how you'd check the horn.")).toBeNull();
});

test("tapping an open row closes it again", async () => {
  render(<Quiz />);
  fireEvent.press(await screen.findByTestId("quiz-row-i1"));
  await screen.findByText("Tell me how you'd check the horn.");
  fireEvent.press(screen.getByTestId("quiz-row-i1"));
  await waitFor(() =>
    expect(screen.queryByText("Tell me how you'd check the horn.")).toBeNull());
});

test("the hero counts what is known against the whole bank", async () => {
  await recordAnswer("s1", true);
  await recordAnswer("s2", false);
  render(<Quiz />);
  // One right, one wrong, two never seen — only the right one counts.
  expect(await screen.findByText("1 done")).toBeTruthy();
  expect(screen.getByText("3 to go")).toBeTruthy();
});

test("a learner who has answered nothing is shown a job to do, not a score of zero", async () => {
  render(<Quiz />);
  expect(await screen.findByText("0 done")).toBeTruthy();
  expect(screen.getByText("4 to go")).toBeTruthy();
});

test("the bar fills to the fraction that is known", async () => {
  await recordAnswer("s1", true);
  render(<Quiz />);
  const fill = await screen.findByTestId("quiz-progress-fill");
  expect(fill.props.style).toMatchObject({ width: "25%" });
});

test("starting a round opens it", async () => {
  render(<Quiz />);
  fireEvent.press(await screen.findByTestId("quiz-start"));
  expect(mockPush).toHaveBeenCalledWith("/quiz/round");
});

test("cached rows say so rather than pretending to be current", async () => {
  mockList.mockResolvedValue({ data: SEEDED, stale: true });
  render(<Quiz />);
  expect(await screen.findByText(/Offline/)).toBeTruthy();
});

test("a failed load offers a way out rather than an empty screen", async () => {
  mockList.mockRejectedValue(new Error("no network, no cache"));
  render(<Quiz />);
  expect(await screen.findByTestId("quiz-retry")).toBeTruthy();

  mockList.mockResolvedValue({ data: SEEDED, stale: false });
  fireEvent.press(screen.getByTestId("quiz-retry"));
  expect(await screen.findByText("Tyre tread and condition")).toBeTruthy();
});

test("a section header counts its own questions", async () => {
  render(<Quiz />);
  await screen.findByText("Tyre tread and condition");
  expect(screen.getByTestId("quiz-count-Safety and the outside").props.children).toBe(2);
  expect(screen.getByTestId("quiz-count-Under the bonnet").props.children).toBe(1);
});

test("the state of a row survives a reload of the questions behind it", async () => {
  // The tick comes off the device and the row comes off the network. They are
  // fetched separately and joined in the view, so a slow question fetch must
  // not lose an answer that is already on disk.
  await recordAnswer("s1", true);
  render(<Quiz />);
  expect(await screen.findByTestId("quiz-state-s1")).toBeTruthy();
  expect(screen.queryByTestId("quiz-state-s2")).toBeNull();
});

test("a database that has not been migrated says so, rather than blaming the network", async () => {
  // The failure this screen actually shipped with: the Supabase project had
  // never had the Phase 2 columns added, and the tab said only "Couldn't load
  // the questions", which reads as a connection problem.
  mockList.mockRejectedValue(new Error("column show_me_tell_me.topic does not exist"));
  render(<Quiz />);
  expect(await screen.findByText("This build needs a database update.")).toBeTruthy();
  expect(screen.getByText(/2026-08-18-quiz\.sql/)).toBeTruthy();
});

test("an ordinary failure still reads as an ordinary failure", async () => {
  mockList.mockRejectedValue(new Error("Network request failed"));
  render(<Quiz />);
  expect(await screen.findByText("Couldn't load the questions.")).toBeTruthy();
  expect(screen.queryByText(/\.sql/)).toBeNull();
});

test("try again acknowledges the press while it is still trying", async () => {
  // Reported as "try again but nothing happened": on a fast failure the button
  // re-rendered identically, so a press that did run looked like a press that
  // had not registered.
  mockList.mockRejectedValue(new Error("Network request failed"));
  render(<Quiz />);
  fireEvent.press(await screen.findByTestId("quiz-retry"));

  expect(screen.getByTestId("quiz-retry-label").props.children).toBe("Trying…");
  expect(screen.getByTestId("quiz-retry").props.accessibilityState).toMatchObject({ disabled: true });
});

test("a second press cannot stack another load on top of the first", async () => {
  mockList.mockRejectedValue(new Error("Network request failed"));
  render(<Quiz />);
  fireEvent.press(await screen.findByTestId("quiz-retry"));
  const callsAfterFirst = mockList.mock.calls.length;
  fireEvent.press(screen.getByTestId("quiz-retry"));
  expect(mockList.mock.calls.length).toBe(callsAfterFirst);
});

test("the button comes back once the attempt has finished failing", async () => {
  mockList.mockRejectedValue(new Error("Network request failed"));
  render(<Quiz />);
  fireEvent.press(await screen.findByTestId("quiz-retry"));
  await waitFor(() =>
    expect(screen.getByTestId("quiz-retry-label").props.children).toBe("Try again"));
});

test("the card says what the button will start", async () => {
  // It shipped as a number, a bar and "Start a round" — nothing naming the
  // format, the length, or what you get out of it.
  render(<Quiz />);
  await screen.findByTestId("quiz-start");
  expect(screen.getByText(/four answers/i)).toBeTruthy();
  expect(screen.getByText(/Ten questions/i)).toBeTruthy();
});

test("the button names the thing it starts, not a word only this app uses", async () => {
  render(<Quiz />);
  expect(await screen.findByTestId("quiz-start-label")).toBeTruthy();
  expect(screen.getByTestId("quiz-start-label").props.children).toBe("Start the quiz");
});

test("the start control is reachable by name for a screen reader", async () => {
  render(<Quiz />);
  const start = await screen.findByTestId("quiz-start");
  expect(start.props.accessibilityLabel).toMatch(/quiz/i);
  expect(start.props.accessibilityHint).toMatch(/ten|10/i);
});

test("the list says what it is for, so it is not mistaken for the quiz", async () => {
  render(<Quiz />);
  expect(await screen.findByText("Look them up")).toBeTruthy();
});

test("the reference header counts whatever the bank actually holds", async () => {
  mockList.mockResolvedValue({ data: SEEDED.slice(0, 3), stale: false });
  render(<Quiz />);
  expect((await screen.findByTestId("quiz-reference-count")).props.children).toBe(3);
});

