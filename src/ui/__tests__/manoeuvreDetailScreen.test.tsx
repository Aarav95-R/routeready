import { ScrollView } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

const mockBack = jest.fn();
let mockParams: { id: string } = { id: "m3" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/services/manoeuvresRepo", () => ({ listManoeuvres: jest.fn() }));

import { sceneFor } from "@/lib/manoeuvreScenes";
import { ManoeuvreDiagram } from "@/ui/ManoeuvreDiagram";
import { listManoeuvres } from "@/services/manoeuvresRepo";
import type { Manoeuvre } from "@/types/db";
import ManoeuvreDetail from "../../../app/manoeuvre/[id]";

const mockList = listManoeuvres as jest.MockedFunction<typeof listManoeuvres>;

const steps = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ title: `Step ${i + 1}`, detail: `Do the ${i + 1} thing.` }));

const parallel: Manoeuvre = {
  id: "m3", name: "Parallel park", steps: steps(6), tips: ["Go slow.", "Use references.", "Pause and look."],
};
const unknown: Manoeuvre = { id: "m9", name: "Emergency stop", steps: steps(3), tips: ["Both feet."] };

// Where the car sits is Reanimated's business and runs on the UI thread, so
// it is not observable from here. The seam that *is* observable is the step
// this screen hands the diagram; that the diagram then draws the right pose
// for it is proved in manoeuvreDiagram.test.tsx.
const stepGiven = () => screen.UNSAFE_getByType(ManoeuvreDiagram).props.step;
const carX = () => (screen.getByTestId("manoeuvre-car").props.matrix as number[])[4];


const scrollTo = (y: number) =>
  fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), {
    nativeEvent: {
      contentOffset: { y },
      contentSize: { height: 1200, width: 320 },
      layoutMeasurement: { height: 400, width: 320 },
    },
  });

/**
 * Lay the steps out the way the platform would: the group at `groupY` in the
 * scroll content, and each row at its own offset *within* that group.
 */
const layOutStepsWithGroupAt = (groupY: number, rowYs: number[]) => {
  fireEvent(screen.getByTestId("manoeuvre-steps"), "layout", { nativeEvent: { layout: { y: groupY } } });
  rowYs.forEach((y, i) =>
    fireEvent(screen.getByTestId(`manoeuvre-step-${i}`), "layout", { nativeEvent: { layout: { y } } })
  );
};

beforeEach(() => {
  mockBack.mockClear();
  mockParams = { id: "m3" };
  mockList.mockResolvedValue({ data: [parallel, unknown], stale: false });
});

test("the manoeuvre is named, stepped and tipped", async () => {
  render(<ManoeuvreDetail />);
  expect(await screen.findByText("Parallel park")).toBeTruthy();
  expect(screen.getByText("Step 6")).toBeTruthy();
  expect(screen.getByText("Use references.")).toBeTruthy();
});

test("it opens on step one", async () => {
  render(<ManoeuvreDetail />);
  await screen.findByText("Parallel park");
  expect(screen.getByText("Step 1 of 6")).toBeTruthy();
  expect(carX()).toBeCloseTo(sceneFor("Parallel park")!.poses[0].x, 6);
});

test("tapping a step drives the car to it", async () => {
  // The binding this screen exists for: what you are reading and what the
  // diagram shows are one number, never two.
  render(<ManoeuvreDetail />);
  fireEvent.press(await screen.findByTestId("manoeuvre-step-3"));
  expect(stepGiven()).toBe(3);
  expect(screen.getByText("Step 4 of 6")).toBeTruthy();
});

test("a manoeuvre this build cannot draw still reads completely", async () => {
  // No diagram, no apology, no gap where one used to be — a learner reading
  // the steps has lost nothing they knew was there.
  mockParams = { id: "m9" };
  render(<ManoeuvreDetail />);
  expect(await screen.findByText("Emergency stop")).toBeTruthy();
  expect(screen.getByText("Both feet.")).toBeTruthy();
  expect(screen.queryByTestId("manoeuvre-diagram")).toBeNull();
  expect(screen.queryByText(/Step 1 of/)).toBeNull();
});

test("an id that is not there says so instead of hanging on a spinner", async () => {
  mockParams = { id: "nope" };
  render(<ManoeuvreDetail />);
  expect(await screen.findByTestId("manoeuvre-missing")).toBeTruthy();
});

test("scrolling the steps drives the car too, without anyone tapping", async () => {
  // The step rows report their position relative to the row wrapper the
  // grouped list puts around them, not relative to the scroll content — so a
  // row's own y is 0, or 1 once a hairline sits above it, and is useless on
  // its own. What this screen has to add up is where the group starts plus
  // where the row sits inside it. Firing the events the way React Native
  // actually reports them is the whole point of this test: filling `tops`
  // with the numbers we wish for tests the arithmetic and not the wiring.
  render(<ManoeuvreDetail />);
  await screen.findByText("Parallel park");
  layOutStepsWithGroupAt(200, [0, 120, 260, 380, 500, 640]);

  scrollTo(465); // 200 + 260 -> the third step has just reached the top
  expect(stepGiven()).toBe(2);
  expect(screen.getByText("Step 3 of 6")).toBeTruthy();

  scrollTo(199); // still above the group entirely
  expect(stepGiven()).toBe(0);

  scrollTo(9999);
  expect(stepGiven()).toBe(5);
});
