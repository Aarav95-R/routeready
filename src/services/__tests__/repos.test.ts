const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockInsert = jest.fn();
const mockDel = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: mockOrder, eq: mockEq.mockReturnValue({ order: mockOrder, single: mockSingle, maybeSingle: mockMaybeSingle }) })),
      insert: mockInsert,
      delete: mockDel.mockReturnValue({ match: jest.fn().mockResolvedValue({ error: null }) }),
    })),
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
  },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { listCentres } from "../centresRepo";
import { listManoeuvres } from "../manoeuvresRepo";
import { listQuestions } from "../quizRepo";
import { saveProgress, flushProgress } from "../progressRepo";
import { getRouteSteps, listRoutesByCentre } from "../routesRepo";

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

test("listManoeuvres returns rows fresh", async () => {
  mockOrder.mockResolvedValue({ data: [{ id: "m1", name: "Parallel park", steps: [], tips: [] }], error: null });
  const r = await listManoeuvres();
  expect(r.stale).toBe(false);
  expect(r.data[0].name).toBe("Parallel park");
});

test("listManoeuvres serves stale cache when query fails", async () => {
  // Reference data that never changes, on a tab most people open indoors.
  // Once it has been read it must survive with no network at all.
  mockOrder.mockResolvedValueOnce({ data: [{ id: "m1", name: "Parallel park", steps: [], tips: [] }], error: null });
  await listManoeuvres();
  mockOrder.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
  const r = await listManoeuvres();
  expect(r.stale).toBe(true);
  expect(r.data[0].name).toBe("Parallel park");
});

const QUESTION = {
  id: "s1", category: "safety", topic: "Tyre tread and condition",
  question: "Tell me how you'd check the tyres have sufficient tread depth.",
  answer: "The legal minimum tread depth is 1.6mm.", is_show_me: false,
  choices: [{ text: "1.6mm", correct: true }, { text: "1mm", correct: false }],
};

test("listQuestions returns rows fresh", async () => {
  mockOrder.mockResolvedValue({ data: [QUESTION], error: null });
  const r = await listQuestions();
  expect(r.stale).toBe(false);
  expect(r.data[0].topic).toBe("Tyre tread and condition");
  expect(r.data[0].choices).toHaveLength(2);
});

test("listQuestions serves stale cache when query fails", async () => {
  // Same argument as the manoeuvres above: this is the tab people open on the
  // sofa the night before, which is also where the signal is worst.
  mockOrder.mockResolvedValueOnce({ data: [QUESTION], error: null });
  await listQuestions();
  mockOrder.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
  const r = await listQuestions();
  expect(r.stale).toBe(true);
  expect(r.data[0].topic).toBe("Tyre tread and condition");
});

test("the quiz and the manoeuvres do not share a cache entry", async () => {
  // Both are reference tables read through cachedFetch. A shared key would
  // have one tab serving the other's rows the first time it went offline.
  mockOrder.mockResolvedValueOnce({ data: [QUESTION], error: null });
  await listQuestions();
  mockOrder.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
  await expect(listManoeuvres()).rejects.toThrow();
});

test("listRoutesByCentre asks for named columns, never *", async () => {
  mockOrder.mockResolvedValue({ data: [{ id: "r1", name: "Loop", is_free: true }], error: null });
  await listRoutesByCentre("c1");
  const select = (supabase.from as jest.Mock).mock.results[0].value.select as jest.Mock;
  expect(select).toHaveBeenCalled();
  expect(select.mock.calls[0][0]).not.toBe("*");
  expect(select.mock.calls[0][0]).toContain("is_free");
  expect(select.mock.calls[0][0]).not.toContain("steps");
});

test("getRouteSteps returns the steps when the server serves them", async () => {
  mockMaybeSingle.mockResolvedValue({ data: { steps: [{ instruction: "Turn left" }] }, error: null });
  const r = await getRouteSteps("r1");
  expect(r.data).toHaveLength(1);
});

test("getRouteSteps returns null when the policy refuses the row", async () => {
  // RLS does not error — it returns no rows. Null and [] must stay distinct:
  // a route can legitimately have no steps.
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  const r = await getRouteSteps("r2");
  expect(r.data).toBeNull();
});
