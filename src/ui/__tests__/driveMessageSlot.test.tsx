import { Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import { type DriveMessage, DriveMessageSlot } from "../DriveMessageSlot";

const msg = (over: Partial<DriveMessage> & { id: string }): DriveMessage =>
  ({ tone: "info", text: over.id, ...over });

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

test("nothing is drawn when the drive has nothing to say", () => {
  render(<DriveMessageSlot messages={[]} top={0} />);
  expect(screen.queryByTestId("drive-message")).toBeNull();
});

// The whole point of the slot: three things used to be able to shout at once
// while somebody was turning left.
test("only the highest-ranked message is shown", () => {
  render(
    <DriveMessageSlot
      top={0}
      messages={[
        msg({ id: "off-route", tone: "route", text: "Rejoining the route" }),
        msg({ id: "zone", tone: "zone", text: "Check your mirrors" }),
      ]}
    />
  );
  expect(screen.getByTestId("drive-message")).toHaveTextContent("Rejoining the route");
  expect(screen.queryByText("Check your mirrors")).toBeNull();
});

// Hidden is not the same as never raised.
test("a message waiting behind the one on show is marked", () => {
  render(
    <DriveMessageSlot
      top={0}
      messages={[msg({ id: "a" }), msg({ id: "b" })]}
    />
  );
  expect(screen.getByTestId("drive-message-queue")).toBeTruthy();
});

test("a single message needs no queue marker", () => {
  render(<DriveMessageSlot messages={[msg({ id: "a" })]} top={0} />);
  expect(screen.queryByTestId("drive-message-queue")).toBeNull();
});

test("a message with a life expires and lets the next one through", () => {
  render(
    <DriveMessageSlot
      top={0}
      messages={[
        msg({ id: "habitual", text: "Use of mirrors ×3", ttlMs: 8000 }),
        msg({ id: "mark", text: "Junctions — driving fault" }),
      ]}
    />
  );
  expect(screen.getByTestId("drive-message")).toHaveTextContent("Use of mirrors ×3");

  act(() => { jest.advanceTimersByTime(8000); });

  expect(screen.getByTestId("drive-message")).toHaveTextContent("Junctions — driving fault");
});

test("a message with no life stands until it stops being true", () => {
  const { rerender } = render(
    <DriveMessageSlot messages={[msg({ id: "zone", tone: "zone", text: "Check your mirrors" })]} top={0} />
  );
  act(() => { jest.advanceTimersByTime(60_000); });
  expect(screen.getByTestId("drive-message")).toHaveTextContent("Check your mirrors");

  rerender(<DriveMessageSlot messages={[]} top={0} />);
  expect(screen.queryByTestId("drive-message")).toBeNull();
});

// The compass re-renders the mock screen about fifteen times a second. A timer
// keyed on the message object rather than its id would restart on every one of
// them, and a three-second message would never expire.
test("re-rendering does not restart a message's life", () => {
  const { rerender } = render(
    <DriveMessageSlot messages={[msg({ id: "mark", text: "Junctions", ttlMs: 3000 })]} top={0} />
  );
  for (let i = 0; i < 10; i++) {
    act(() => { jest.advanceTimersByTime(200); });
    // A fresh array and fresh objects each time, as the screen's own useMemo
    // produces whenever a dependency changes.
    rerender(<DriveMessageSlot messages={[msg({ id: "mark", text: "Junctions", ttlMs: 3000 })]} top={0} />);
  }
  act(() => { jest.advanceTimersByTime(1100); });
  expect(screen.queryByTestId("drive-message")).toBeNull();
});

// Off route is the one message that is guidance rather than a report, so it
// keeps its own banner instead of being flattened to a line.
test("a message can render its own content", () => {
  render(
    <DriveMessageSlot
      top={0}
      messages={[msg({ id: "off-route", render: () => <Text>Turn left onto London Road</Text> })]}
    />
  );
  expect(screen.getByText("Turn left onto London Road")).toBeTruthy();
  expect(screen.queryByTestId("drive-message")).toBeNull();
});
