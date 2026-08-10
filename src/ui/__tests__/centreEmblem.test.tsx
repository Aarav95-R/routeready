import { render, screen } from "@testing-library/react-native";
import type { CentreIdentity } from "@/lib/centreIdentity";
import { CentreEmblem } from "../CentreEmblem";

const identity: CentreIdentity = {
  hue: "#BE123C", tint: "#FFF1F2", initials: "MH", seed: 1,
};

test("shows the monogram in the centre's hue on its tint", () => {
  render(<CentreEmblem identity={identity} />);
  expect(screen.getByTestId("emblem-initials")).toHaveTextContent("MH");
  expect(screen.getByTestId("emblem")).toHaveStyle({ backgroundColor: "#FFF1F2" });
});

test("two seeds draw different marks", () => {
  const { unmount } = render(<CentreEmblem identity={identity} />);
  const first = screen.getAllByTestId("emblem-arc").map((n) => n.props.cx);
  unmount();

  render(<CentreEmblem identity={{ ...identity, seed: 7 }} />);
  const second = screen.getAllByTestId("emblem-arc").map((n) => n.props.cx);
  expect(second).not.toEqual(first);
});
