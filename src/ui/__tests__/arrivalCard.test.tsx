import { fireEvent, render, screen } from "@testing-library/react-native";
import { ArrivalCard } from "../ArrivalCard";

const setup = (over: Partial<React.ComponentProps<typeof ArrivalCard>> = {}) =>
  render(
    <ArrivalCard
      title="Route 3 · Sandpit Lane and Holywell Hill"
      detail="4.2 km · 14 min"
      primaryLabel="Begin mock test"
      onPrimary={() => {}}
      secondaryLabel="Not yet — hold here"
      onSecondary={() => {}}
      {...over}
    />
  );

test("says where the driver is and what they are about to start", () => {
  setup();
  expect(screen.getByText("You're at the start line")).toBeTruthy();
  expect(screen.getByText("Route 3 · Sandpit Lane and Holywell Hill")).toBeTruthy();
  expect(screen.getByText("4.2 km · 14 min")).toBeTruthy();
  expect(screen.getByText("Begin mock test")).toBeTruthy();
});

test("the primary action hands back to the caller", () => {
  const onPrimary = jest.fn();
  setup({ onPrimary });
  fireEvent.press(screen.getByText("Begin mock test"));
  expect(onPrimary).toHaveBeenCalledTimes(1);
});

// "Not yet" has to be reachable: a learner who arrives early needs to be able
// to sit at the kerb without the clock running.
test("the secondary action hands back to the caller", () => {
  const onSecondary = jest.fn();
  setup({ onSecondary });
  fireEvent.press(screen.getByText("Not yet — hold here"));
  expect(onSecondary).toHaveBeenCalledTimes(1);
});

test("a missing detail line is dropped rather than left empty", () => {
  setup({ detail: null });
  expect(screen.queryByText("4.2 km · 14 min")).toBeNull();
  expect(screen.getByText("Begin mock test")).toBeTruthy();
});
