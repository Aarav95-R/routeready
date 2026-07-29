const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockInsert = jest.fn();
const mockDel = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: mockOrder, eq: mockEq.mockReturnValue({ order: mockOrder, single: mockSingle }) })),
      insert: mockInsert,
      delete: mockDel.mockReturnValue({ match: jest.fn().mockResolvedValue({ error: null }) }),
    })),
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
  },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { listCentres } from "../centresRepo";
import { saveProgress, flushProgress } from "../progressRepo";

beforeEach(() => { jest.clearAllMocks(); return AsyncStorage.clear(); });

test("listCentres returns rows fresh", async () => {
  mockOrder.mockResolvedValue({ data: [{ id: "c1", name: "Mill Hill" }], error: null });
  const r = await listCentres();
  expect(r.stale).toBe(false);
  expect(r.data[0].name).toBe("Mill Hill");
});

test("listCentres serves stale cache when query fails", async () => {
  mockOrder.mockResolvedValueOnce({ data: [{ id: "c1", name: "Mill Hill" }], error: null });
  await listCentres();
  mockOrder.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
  const r = await listCentres();
  expect(r.stale).toBe(true);
  expect(r.data[0].id).toBe("c1");
});

test("saveProgress falls back to outbox and flushProgress retries", async () => {
  mockInsert.mockResolvedValueOnce({ error: { message: "offline" } });
  await saveProgress({ route_id: "r1", mock_test_score: 82, mistakes: ["speeding"], duration_seconds: 2400 });
  expect(JSON.parse((await AsyncStorage.getItem("queue:progress_outbox"))!)).toHaveLength(1);
  mockInsert.mockResolvedValueOnce({ error: null });
  expect(await flushProgress()).toBe(1);
});
