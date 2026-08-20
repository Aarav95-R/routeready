import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/services/manoeuvresRepo", () => ({ listManoeuvres: jest.fn() }));

import { listManoeuvres } from "@/services/manoeuvresRepo";
import type { Manoeuvre } from "@/types/db";
import Manoeuvres from "../../../app/(tabs)/manoeuvres";

const mockList = listManoeuvres as jest.MockedFunction<typeof listManoeuvres>;

const m = (id: string, name: string): Manoeuvre => ({
  id, name,
  steps: [{ title: "Choose your space", detail: "Find a gap." }],
  tips: ["Keep it slow."],
});

// As the query returns them: `.order("name")`, i.e. alphabetical.
const SEEDED = [
  m("m1", "Bay park (reverse)"), m("m2", "Forward bay park"),
  m("m3", "Parallel park"), m("m4", "Pull up on the right"),
];

const loads = (rows: Manoeuvre[], stale = false) =>
  mockList.mockResolvedValue({ data: rows, stale });

beforeEach(() => {
  mockPush.mockClear();
  mockList.mockReset();
  loads(SEEDED);
});

test("all four are listed, under the two headings", async () => {
  render(<Manoeuvres />);
  expect(await screen.findByText("Parallel park")).toBeTruthy();
  expect(screen.getByText("Reversing")).toBeTruthy();
  expect(screen.getByText("On the road")).toBeTruthy();
  expect(screen.getByText("Pull up on the right")).toBeTruthy();
});

test("a row says what the manoeuvre is, not just its name", async () => {
  render(<Manoeuvres />);
  expect(await screen.findByText("Reverse into a marked bay, finishing nose-out.")).toBeTruthy();
});

test("tapping a manoeuvre opens it", async () => {
  render(<Manoeuvres />);
  fireEvent.press(await screen.findByTestId("manoeuvre-row-m3"));
  expect(mockPush).toHaveBeenCalledWith("/manoeuvre/m3");
});

test("the four rows arrive in the order the design puts them in", async () => {
  render(<Manoeuvres />);
  await screen.findByText("Parallel park");
  const names = screen.getAllByTestId(/^manoeuvre-row-/).map((r) => r.props.testID);
  expect(names).toEqual([
    "manoeuvre-row-m3", "manoeuvre-row-m1", "manoeuvre-row-m2", "manoeuvre-row-m4",
  ]);
});

test("a cold first launch with no network offers a retry rather than a blank tab", async () => {
  mockList.mockRejectedValueOnce(new Error("offline"));
  render(<Manoeuvres />);
  fireEvent.press(await screen.findByTestId("manoeuvres-retry"));
  await waitFor(() => expect(screen.getByText("Parallel park")).toBeTruthy());
});

test("rows read from the cache say so", async () => {
  loads(SEEDED, true);
  render(<Manoeuvres />);
  await screen.findByText("Parallel park");
  expect(screen.getByText(/showing saved data/i)).toBeTruthy();
});
