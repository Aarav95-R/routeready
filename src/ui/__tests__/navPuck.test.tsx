import { render, screen } from "@testing-library/react-native";
import { processColor } from "react-native";
import { NavPuck, PUCK_SIZE } from "../NavPuck";

test("NavPuck renders the three layers", () => {
  render(<NavPuck />);
  expect(screen.getByTestId("puck-pad")).toBeTruthy();
  expect(screen.getByTestId("puck-disc")).toBeTruthy();
  expect(screen.getByTestId("puck-arrow")).toBeTruthy();
});

test("NavPuck points straight up by default", () => {
  render(<NavPuck />);
  expect(screen.getByTestId("nav-puck").props.style.transform).toEqual([{ rotate: "0deg" }]);
});

test("NavPuck rotates when the camera is not following", () => {
  render(<NavPuck rotation={137} />);
  expect(screen.getByTestId("nav-puck").props.style.transform).toEqual([{ rotate: "137deg" }]);
});

test("the arrow is emerald, not Waze blue", () => {
  render(<NavPuck />);
  // react-native-svg normalises colour props, so compare against the same
  // normalisation of the literal we expect rather than the raw hex string.
  const fill = screen.getByTestId("puck-arrow").props.fill;
  expect(fill).toEqual(expect.objectContaining({ payload: processColor("#059669") }));
  expect(fill).not.toEqual(expect.objectContaining({ payload: processColor("#4AA8E0") }));
});

test("PUCK_SIZE leaves room for the presence pad", () => {
  expect(PUCK_SIZE).toBeGreaterThanOrEqual(80);
});
