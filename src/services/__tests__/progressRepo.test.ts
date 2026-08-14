const mockOrder = jest.fn();
const mockSelect = jest.fn(() => ({ order: mockOrder }));
jest.mock("@/lib/supabase", () => ({
  supabase: { from: jest.fn(() => ({ select: mockSelect })) },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { listMyProgress } from "../progressRepo";

beforeEach(() => { jest.clearAllMocks(); return AsyncStorage.clear(); });

// One query, one round trip. The home screen names the route on every history
// row and must not fetch per row to do it.
test("progress rows arrive with their route and centre attached", async () => {
  mockOrder.mockResolvedValue({
    data: [{
      user_id: "u1", route_id: "r1", completed_at: "2026-08-12T10:00:00Z",
      mock_test_score: 88, mistakes: [], duration_seconds: 2460,
      routes: { name: "Route 3", centre_id: "c1", centres: { name: "Mill Hill (London)" } },
    }],
    error: null,
  });

  const r = await listMyProgress();

  expect(mockSelect).toHaveBeenCalledWith("*, routes(name, centre_id, centres(name))");
  expect(r.data[0].routes?.name).toBe("Route 3");
  expect(r.data[0].routes?.centres?.name).toBe("Mill Hill (London)");
});

// A route deleted after the test was taken. The score is still the user's and
// must survive its route going missing.
test("a row whose route is gone still carries its score", async () => {
  mockOrder.mockResolvedValue({
    data: [{
      user_id: "u1", route_id: "r1", completed_at: "2026-08-12T10:00:00Z",
      mock_test_score: 88, mistakes: [], duration_seconds: 2460, routes: null,
    }],
    error: null,
  });

  const r = await listMyProgress();

  expect(r.data[0].mock_test_score).toBe(88);
  expect(r.data[0].routes).toBeNull();
});
