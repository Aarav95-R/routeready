import { render } from "@testing-library/react-native";
import { ManeuverBanner } from "../ManeuverBanner";
import type { NavStep } from "@/types/db";

const step: NavStep = {
  lat: 51.5, lng: -0.1, instruction: "Turn left onto Sandpit Lane",
  road: "Sandpit Lane", type: "turn", modifier: "left", distanceM: 120,
};

test("the banner shows the instruction it was given", () => {
  const { getByText } = render(<ManeuverBanner step={step} distanceM={200} />);
  expect(getByText("Turn left onto Sandpit Lane")).toBeTruthy();
});

test("the go tone formats the distance", () => {
  const { getByText } = render(<ManeuverBanner step={step} distanceM={200} />);
  expect(getByText("200 m")).toBeTruthy();
});

test("the off tone replaces the distance with the rejoin label", () => {
  const { getByText, queryByText } = render(
    <ManeuverBanner
      tone="off"
      eyebrow="Off route"
      step={step}
      distanceM={200}
      distanceLabel="Rejoining ahead"
    />
  );
  expect(getByText("Off route")).toBeTruthy();
  expect(getByText("Rejoining ahead")).toBeTruthy();
  expect(queryByText("200 m")).toBeNull();
});

test("the off tone still shows the instruction, so a turn is not lost to the colour change", () => {
  const { getByText } = render(
    <ManeuverBanner tone="off" eyebrow="Off route" step={step} distanceM={null} distanceLabel="Rejoining ahead" />
  );
  expect(getByText("Turn left onto Sandpit Lane")).toBeTruthy();
});

test("with no distance and no label, the distance line is absent entirely", () => {
  const { queryByText } = render(<ManeuverBanner step={step} distanceM={null} />);
  expect(queryByText("now")).toBeNull();
  expect(queryByText("0 m")).toBeNull();
});
