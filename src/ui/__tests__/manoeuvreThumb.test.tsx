import { render, screen } from "@testing-library/react-native";
import { ManoeuvreThumb } from "../ManoeuvreThumb";

const glassY = () => screen.getByTestId("thumb-glass").props.y as number;

test("each manoeuvre this build knows gets a glyph", () => {
  for (const slug of ["parallel", "bay-reverse", "bay-forward", "pull-up-right"] as const) {
    render(<ManoeuvreThumb slug={slug} />);
    expect(screen.getByTestId("thumb-glass")).toBeTruthy();
    screen.unmount();
  }
});

test("the two bay parks differ in exactly one mark: which way the car faces", () => {
  // They end in the same bay and read as the same row otherwise. The lighter
  // bar is the windscreen — nearer the aisle when you reversed in, nearer the
  // back of the bay when you drove in — and that is the whole difference
  // between the manoeuvres.
  render(<ManoeuvreThumb slug="bay-reverse" />);
  const reversedIn = glassY();
  screen.unmount();

  render(<ManoeuvreThumb slug="bay-forward" />);
  expect(glassY()).toBeLessThan(reversedIn);
});

test("a manoeuvre this build cannot draw still holds its place in the row", () => {
  // No glyph, but the same tile, so the names below it stay on one margin.
  render(<ManoeuvreThumb slug={null} />);
  expect(screen.getByTestId("manoeuvre-thumb")).toBeTruthy();
  expect(screen.queryByTestId("thumb-glass")).toBeNull();
});
