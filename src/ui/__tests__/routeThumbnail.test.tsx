import { processColor } from "react-native";
import { render, screen } from "@testing-library/react-native";
import type { GeoLineString } from "@/types/db";
import { colors } from "@/ui/theme";
import { RouteThumbnail } from "../RouteThumbnail";

// react-native-svg hands the native side a processed colour rather than the
// string it was given, so the hex has to be put through the same mill to be
// compared with it.
const paint = (testID: string, prop: "fill" | "stroke") =>
  screen.getByTestId(testID).props[prop].payload;

const geometry: GeoLineString = {
  type: "LineString",
  coordinates: [[-0.24, 51.60], [-0.23, 51.61], [-0.22, 51.605], [-0.21, 51.61]],
};

test("a route starts on the road, in the road's own green", () => {
  render(<RouteThumbnail geometry={geometry} width={200} />);
  expect(paint("thumb-start", "stroke")).toBe(processColor(colors.accent));
});

// Green is the road, clay is you. On the one screen where a learner has not
// driven anything yet, the dot at the start of the line is them.
test("the start marker can be the person instead", () => {
  render(<RouteThumbnail geometry={geometry} width={200} youAreHere />);
  expect(paint("thumb-start", "fill")).toBe(processColor(colors.clay));
});
