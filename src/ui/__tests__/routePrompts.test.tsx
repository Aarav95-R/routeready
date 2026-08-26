import { fireEvent, render, screen } from "@testing-library/react-native";
import { DriveChrome } from "../DriveChrome";
import { RouteFinishPrompt } from "../RouteFinishPrompt";
import { RouteStartPrompt } from "../RouteStartPrompt";

jest.mock("@expo/vector-icons/Ionicons", () => {
  const { View } = require("react-native");
  return function Icon(props: Record<string, unknown>) {
    return <View {...props} />;
  };
});

test("start prompt begins or waits only through explicit buttons", () => {
  const begin = jest.fn();
  const wait = jest.fn();
  render(
    <RouteStartPrompt
      visible
      routeName="North Orbital Road"
      detail="Practice route"
      onBegin={begin}
      onWait={wait}
    />,
  );

  expect(screen.getByText("Ready to begin?")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Begin route" }));
  fireEvent.press(screen.getByRole("button", { name: "Wait here" }));
  expect(begin).toHaveBeenCalledTimes(1);
  expect(wait).toHaveBeenCalledTimes(1);
});

test("hidden start prompt renders no actions", () => {
  render(
    <RouteStartPrompt
      visible={false}
      routeName="North Orbital Road"
      detail={null}
      onBegin={jest.fn()}
      onWait={jest.fn()}
    />,
  );

  expect(screen.queryByRole("button", { name: "Begin route" })).toBeNull();
});

test("finish prompt keeps driving or ends only through explicit buttons", () => {
  const keepDriving = jest.fn();
  const end = jest.fn();
  render(
    <RouteFinishPrompt
      visible
      routeName="North Orbital Road"
      onKeepDriving={keepDriving}
      onEnd={end}
    />,
  );

  expect(screen.getByText("Route complete")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Keep driving" }));
  fireEvent.press(screen.getByRole("button", { name: "End route" }));
  expect(keepDriving).toHaveBeenCalledTimes(1);
  expect(end).toHaveBeenCalledTimes(1);
});

test("drive chrome keeps guidance and controls in two stable surfaces", () => {
  const recenter = jest.fn();
  const stop = jest.fn();
  render(
    <DriveChrome
      eyebrow="Practice route"
      distanceLabel="180 m"
      instruction="Turn left onto King Harry Lane"
      nextInstruction="then continue straight"
      speedMph={24}
      remainingLabel="5.2 km"
      following={false}
      onRecenter={recenter}
      onStop={stop}
    />,
  );

  expect(screen.getByTestId("drive-guidance-deck")).toBeTruthy();
  expect(screen.getByTestId("drive-bottom-rail")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Recenter map" }));
  fireEvent.press(screen.getByRole("button", { name: "Stop route" }));
  expect(recenter).toHaveBeenCalledTimes(1);
  expect(stop).toHaveBeenCalledTimes(1);
});

test("recovery chrome uses a single amber status without changing its geometry", () => {
  render(
    <DriveChrome
      tone="off"
      eyebrow="Off route"
      distanceLabel="Rejoining ahead"
      instruction="Head back toward route"
      nextInstruction={null}
      speedMph={12}
      remainingLabel="Route paused"
      following
      onRecenter={jest.fn()}
    />,
  );

  expect(screen.getByTestId("drive-guidance-deck").props.style).toEqual(
    expect.objectContaining({ borderTopColor: "#D97706" }),
  );
  expect(screen.getByText("Off route")).toBeTruthy();
});
