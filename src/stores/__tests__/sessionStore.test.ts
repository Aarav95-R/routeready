jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signInWithOtp: jest.fn(),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
  },
}));
import { supabase } from "@/lib/supabase";
import { useSession } from "../sessionStore";

test("init loads session and marks initialized", async () => {
  await useSession.getState().init();
  expect(useSession.getState().initialized).toBe(true);
  expect(useSession.getState().session).toBeNull();
});

test("signIn returns null on success, message on failure", async () => {
  (supabase.auth.signInWithPassword as jest.Mock)
    .mockResolvedValueOnce({ data: { session: { user: {} } }, error: null })
    .mockResolvedValueOnce({ data: { session: null }, error: { message: "Invalid login credentials" } });
  expect(await useSession.getState().signIn("a@b.com", "pw")).toBeNull();
  expect(await useSession.getState().signIn("a@b.com", "bad")).toBe("Invalid login credentials");
});

test("sendMagicLink passes redirect", async () => {
  (supabase.auth.signInWithOtp as jest.Mock).mockResolvedValue({ error: null });
  await useSession.getState().sendMagicLink("a@b.com");
  expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
    email: "a@b.com",
    options: { emailRedirectTo: "routeready://auth-callback" },
  });
});
