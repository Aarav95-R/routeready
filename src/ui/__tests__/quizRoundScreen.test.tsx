import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock("@/services/quizRepo", () => ({ listQuestions: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { listQuestions } from "@/services/quizRepo";
import { loadResults } from "@/services/quizResults";
import type { QuizQuestion } from "@/types/db";
import Round from "../../../app/quiz/round";

const mockList = listQuestions as jest.MockedFunction<typeof listQuestions>;
const mockHaptic = Haptics.notificationAsync as jest.MockedFunction<typeof Haptics.notificationAsync>;

const q = (id: string, is_show_me = false): QuizQuestion => ({
  id, category: "safety", topic: `Topic ${id}`, is_show_me,
  question: `Question ${id}?`,
  answer: `Model answer ${id}.`,
  choices: [
    { text: `${id} right`, correct: true },
    { text: `${id} wrong a`, correct: false },
    { text: `${id} wrong b`, correct: false },
    { text: `${id} wrong c`, correct: false },
  ],
});

const bank = (n: number) => Array.from({ length: n }, (_, i) => q(`q${i}`));

/** Answer whichever question is on screen. */
const answerCurrent = async (correct: boolean) => {
  const id = screen.getByTestId("round-question").props.children as string;
  const stem = id.replace("Question ", "").replace("?", "");
  fireEvent.press(screen.getByText(correct ? `${stem} right` : `${stem} wrong a`));
  fireEvent.press(screen.getByTestId("round-cta"));
  await waitFor(() => expect(screen.getByTestId("round-cta-label").props.children).not.toBe("Check answer"));
};

const advance = () => fireEvent.press(screen.getByTestId("round-cta"));

beforeEach(async () => {
  mockBack.mockClear();
  mockHaptic.mockClear();
  mockList.mockReset();
  mockList.mockResolvedValue({ data: bank(12), stale: false });
  await AsyncStorage.clear();
});

test("a round opens on its first question, counted against ten", async () => {
  render(<Round />);
  expect(await screen.findByTestId("round-question")).toBeTruthy();
  expect(screen.getByTestId("round-counter").props.children).toBe("1 of 10");
});

test("the four options are all offered", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  expect(screen.getAllByTestId(/^round-choice-/)).toHaveLength(4);
});

test("picking an option selects it without committing it", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  fireEvent.press(screen.getAllByTestId(/^round-choice-/)[0]);
  // Nothing is marked and nothing is saved until the answer is checked.
  expect(screen.queryByTestId("round-answer")).toBeNull();
  expect((await loadResults()).answers).toEqual({});
});

test("the answer cannot be checked before an option is picked", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  expect(screen.getByTestId("round-cta").props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(screen.getByTestId("round-cta"));
  expect(screen.queryByTestId("round-answer")).toBeNull();
});

test("checking a right answer marks it and fires the success haptic", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  await answerCurrent(true);
  expect(mockHaptic).toHaveBeenCalledWith("success");
});

test("checking a wrong answer fires the error haptic and still shows which was right", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  const stem = (screen.getByTestId("round-question").props.children as string)
    .replace("Question ", "").replace("?", "");
  fireEvent.press(screen.getByText(`${stem} wrong a`));
  fireEvent.press(screen.getByTestId("round-cta"));
  await waitFor(() => expect(mockHaptic).toHaveBeenCalledWith("error"));
  expect(screen.getByLabelText("Correct answer")).toBeTruthy();
  expect(screen.getByLabelText("Your answer, incorrect")).toBeTruthy();
});

test("every answered question reveals the DVSA answer to say out loud", async () => {
  // The multiple choice is the drill. The examiner will not offer four
  // options, so the verbatim answer is the thing actually being taught.
  render(<Round />);
  await screen.findByTestId("round-question");
  await answerCurrent(true);
  expect(screen.getByTestId("round-answer")).toBeTruthy();
  expect(screen.getByText("What to say")).toBeTruthy();
});

test("an answer is saved as it is given, not at the end of the round", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  await answerCurrent(true);
  await waitFor(async () => expect(Object.keys((await loadResults()).answers)).toHaveLength(1));
});

test("the round moves on to the next question", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  const first = screen.getByTestId("round-question").props.children;
  await answerCurrent(true);
  advance();
  await waitFor(() =>
    expect(screen.getByTestId("round-question").props.children).not.toBe(first));
  expect(screen.getByTestId("round-counter").props.children).toBe("2 of 10");
});

test("a marked question cannot be re-answered", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  await answerCurrent(false);
  const before = await loadResults();
  fireEvent.press(screen.getAllByTestId(/^round-choice-/)[0]);
  expect(await loadResults()).toEqual(before);
});

test("closing a round part-way keeps what was already answered", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  await answerCurrent(true);
  fireEvent.press(screen.getByTestId("round-close"));
  expect(mockBack).toHaveBeenCalled();
  expect(Object.keys((await loadResults()).answers)).toHaveLength(1);
});

test("a part-way exit does not record a round score", async () => {
  // Two right out of ten asked is not a score of two out of ten.
  render(<Round />);
  await screen.findByTestId("round-question");
  await answerCurrent(true);
  fireEvent.press(screen.getByTestId("round-close"));
  expect((await loadResults()).lastScore).toBeNull();
});

test("the last question ends on a summary carrying the score", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  for (let i = 0; i < 10; i++) {
    await answerCurrent(i < 7);
    advance();
  }
  expect(await screen.findByTestId("round-summary")).toBeTruthy();
  expect(screen.getByTestId("round-score").props.children).toBe("7 of 10");
});

test("the summary lists what was missed, by subject", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  for (let i = 0; i < 10; i++) {
    await answerCurrent(i < 7);
    advance();
  }
  await screen.findByTestId("round-summary");
  expect(screen.getAllByTestId(/^round-missed-/)).toHaveLength(3);
});

test("finishing a round records its score for the next one to be compared against", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  for (let i = 0; i < 10; i++) {
    await answerCurrent(i < 7);
    advance();
  }
  await screen.findByTestId("round-summary");
  await waitFor(async () => expect((await loadResults()).lastScore).toBe(7));
});

test("a perfect round is not offered questions to practise again", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  for (let i = 0; i < 10; i++) {
    await answerCurrent(true);
    advance();
  }
  await screen.findByTestId("round-summary");
  expect(screen.queryAllByTestId(/^round-missed-/)).toHaveLength(0);
  expect(screen.getByText("Every one right. Go and book it.")).toBeTruthy();
});

test("the summary can deal a fresh round without leaving the screen", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  for (let i = 0; i < 10; i++) {
    await answerCurrent(i < 7);
    advance();
  }
  await screen.findByTestId("round-summary");
  fireEvent.press(screen.getByTestId("round-again"));
  expect(await screen.findByTestId("round-question")).toBeTruthy();
  expect(screen.getByTestId("round-counter").props.children).toBe("1 of 10");
});

test("done returns to the tab", async () => {
  render(<Round />);
  await screen.findByTestId("round-question");
  for (let i = 0; i < 10; i++) {
    await answerCurrent(true);
    advance();
  }
  fireEvent.press(await screen.findByTestId("round-done"));
  expect(mockBack).toHaveBeenCalled();
});

test("a bank that will not load says so rather than dealing an empty round", async () => {
  mockList.mockRejectedValue(new Error("no network, no cache"));
  render(<Round />);
  expect(await screen.findByTestId("round-error")).toBeTruthy();
});

test("the round names the same cause the tab does when the database is behind", async () => {
  // Barely reachable — the tab must load before this screen can be opened —
  // but two screens giving two different explanations of one cause is how a
  // setup problem gets diagnosed twice.
  mockList.mockRejectedValue(new Error("column show_me_tell_me.choices does not exist"));
  render(<Round />);
  expect(await screen.findByText("This build needs a database update.")).toBeTruthy();
});
