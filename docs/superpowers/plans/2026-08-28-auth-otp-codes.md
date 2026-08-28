# Auth OTP Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every tapped link in RouteReady's auth email — confirmation, password recovery, magic link — with a six-digit code typed into the app.

**Architecture:** One shared `app/(auth)/verify.tsx` screen, parameterised by `email` and `type`, serves all three flows. Pure logic (code normalisation, per-type copy) lives in `src/lib` with its own tests, matching how `authRoute`/`authError` are already factored. `sessionStore` gains `verifyCode`/`resendCode` and loses every `redirectTo`. The whole deep-link auth path is then deleted rather than left dormant.

**Tech Stack:** Expo Router 6, React Native 0.81, Zustand, `@supabase/supabase-js` v2 (`auth.verifyOtp`, `auth.resend`), Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-08-28-auth-otp-codes-design.md`

## Global Constraints

- **Code length is 6.** Import `CODE_LENGTH` from `@/lib/otpCode`; never write a bare `6`.
- **No emojis anywhere** — copy, comments, or commit messages.
- **Type styles come from `@/ui/type`**; colours from `@/ui/theme`. Never a raw hex in a screen or component.
- **Green is action, clay is the person.** Never introduce a second green.
- **Every user-facing failure goes through `authError`** — no screen renders a raw Supabase string.
- **`maxFontSizeMultiplier={MAX_DISPLAY_SCALE}`** on every display-size `<Text>`.
- Run `npm test` and `npx tsc --noEmit` before every commit; both must be clean.
- Commit style is the repo's: `feat:`, `fix:`, `test:`, `chore:`, `docs:`, lowercase after the colon.

---

### Task 1: Code normalisation

**Files:**
- Create: `src/lib/otpCode.ts`
- Test: `src/lib/__tests__/otpCode.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `CODE_LENGTH: 6`, `normaliseCode(raw: string): string`, `isComplete(code: string): boolean`, `type CodeType = "signup" | "recovery" | "email"`

- [ ] **Step 1: Write the failing test**

```ts
import { CODE_LENGTH, isComplete, normaliseCode } from "../otpCode";

test("it keeps a plain six-digit code as it is", () => {
  expect(normaliseCode("418302")).toBe("418302");
});

// Mail clients and the artifact both show the code grouped for reading. What
// gets pasted is therefore rarely six bare digits, and a field that rejects
// what it told the person to copy is the worst kind of small bug.
test.each([
  ["a space in the middle", "418 302"],
  ["a hyphen in the middle", "418-302"],
  ["leading and trailing space", "  418302 "],
  ["a non-breaking space", "418 302"],
])("it strips %s", (_label, raw) => {
  expect(normaliseCode(raw)).toBe("418302");
});

test("it drops letters rather than holding a code that can never verify", () => {
  expect(normaliseCode("4a1b8c3d0e2f")).toBe("418302");
});

// A paste of a longer string must not silently fill the field with the wrong
// six characters — taking the first six is the only reading that matches what
// the boxes show.
test("it caps at the code length", () => {
  expect(normaliseCode("4183021234")).toBe("418302");
  expect(normaliseCode("418302").length).toBe(CODE_LENGTH);
});

test("nothing usable normalises to nothing", () => {
  expect(normaliseCode("")).toBe("");
  expect(normaliseCode("no digits here")).toBe("");
});

test("only a full-length code counts as complete", () => {
  expect(isComplete("418302")).toBe(true);
  expect(isComplete("41830")).toBe(false);
  expect(isComplete("")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/otpCode.test.ts`
Expected: FAIL — `Cannot find module '../otpCode'`

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * The shape of what the six boxes hold.
 *
 * Normalisation lives here rather than in `CodeField` because the field is not
 * the only thing that can put a value in it: iOS autofill, a paste from Mail,
 * and a hardware keyboard all arrive by different routes, and only one of them
 * is a keystroke. One function means the field cannot hold a value the verify
 * call would reject.
 */
export const CODE_LENGTH = 6;

/** Which flow a code belongs to, in Supabase's own vocabulary for `verifyOtp`. */
export type CodeType = "signup" | "recovery" | "email";

/**
 * Digits only, capped at the code length.
 *
 * Non-digits are dropped rather than refused: the emails group the code for
 * legibility, so a space or a hyphen is what a careful person pastes, and
 * rejecting it would punish reading the email properly.
 */
export function normaliseCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function isComplete(code: string): boolean {
  return code.length === CODE_LENGTH;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/otpCode.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/otpCode.ts src/lib/__tests__/otpCode.test.ts
git commit -m "feat: normalise what a six-digit code field can hold"
```

---

### Task 2: Sentences for a code that does not work

**Files:**
- Modify: `src/lib/authError.ts` (the `SENTENCES` table)
- Test: `src/lib/__tests__/authError.test.ts` (append)

**Interfaces:**
- Consumes: nothing
- Produces: no new exports — `authError` gains three matches

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/authError.test.ts`:

```ts
/**
 * ── Codes ─────────────────────────────────────────────────────────────────
 *
 * These three have to stay distinguishable. "Wrong" means try again with the
 * same email open; "expired" means that email is now useless and a new one is
 * needed. Collapsing them into one sentence is how somebody retypes a code
 * that will never work, six digits at a time, until they give up.
 */
test("a wrong code says to check it, not to start again", () => {
  const sentence = authError("Invalid OTP");
  expect(sentence).toMatch(/isn't right/i);
  expect(sentence).not.toMatch(/expired/i);
});

test("an expired code says to send a new one", () => {
  const sentence = authError("AuthApiError: otp_expired");
  expect(sentence).toMatch(/expired/i);
  expect(sentence).toMatch(/new code/i);
});

// Supabase's own wording for verifyOtp folds both causes into one message, so
// this one sentence has to name both without implying either.
test("Supabase's combined message names both causes", () => {
  const sentence = authError("Token has expired or is invalid");
  expect(sentence).toMatch(/expired/i);
  expect(sentence).toMatch(/isn't right/i);
});

// The OTP entries sit above the generic ones and must not shadow the sign-in
// message, which also contains the word "invalid".
test("adding the code sentences did not capture a bad password", () => {
  expect(authError("Invalid login credentials")).toMatch(/don't match/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/authError.test.ts`
Expected: FAIL — the three new cases return `AUTH_FALLBACK`

- [ ] **Step 3: Write minimal implementation**

In `src/lib/authError.ts`, insert these three rows into `SENTENCES` immediately
after the `invalid login credentials` row:

```ts
  // ── Codes. Above the generic entries because two of these contain the word
  // "invalid", and below `invalid login credentials` because that one is more
  // specific still. Supabase folds both causes into one message for verifyOtp,
  // so that combined case gets a sentence naming both.
  ["token has expired or is invalid", "That code has expired or isn't right. Check the email, or send a new code."],
  ["otp_expired", "That code has expired. Send a new code and try again."],
  ["invalid otp", "That code isn't right. Check the email and try again."],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/authError.test.ts`
Expected: PASS — all existing tests plus the four new ones

- [ ] **Step 5: Commit**

```bash
git add src/lib/authError.ts src/lib/__tests__/authError.test.ts
git commit -m "feat: tell a wrong code apart from an expired one"
```

---

### Task 3: The code field

**Files:**
- Create: `src/ui/CodeField.tsx`
- Test: `src/ui/__tests__/codeField.test.tsx`

**Interfaces:**
- Consumes: `CODE_LENGTH`, `normaliseCode` from `@/lib/otpCode`
- Produces: `CodeField({ value, onChangeText, invalid?, autoFocus? })` — a controlled component; `onChangeText` always receives an already-normalised string

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CodeField } from "../CodeField";
import { CODE_LENGTH } from "@/lib/otpCode";
import { colors } from "@/ui/theme";

const field = () => screen.getByLabelText("Verification code");

test("it shows one box per digit of the code", () => {
  render(<CodeField value="" onChangeText={jest.fn()} />);
  expect(screen.getByTestId("code-box-0")).toBeTruthy();
  expect(screen.getByTestId("code-box-5")).toBeTruthy();
  expect(screen.queryByTestId("code-box-6")).toBeNull();
});

test("each digit typed lands in its own box", () => {
  render(<CodeField value="418" onChangeText={jest.fn()} />);
  expect(screen.getByTestId("code-box-0")).toHaveTextContent("4");
  expect(screen.getByTestId("code-box-2")).toHaveTextContent("8");
});

/**
 * The single most likely input is a paste from the email, where the code is
 * shown grouped. The field normalises rather than refusing — see otpCode.
 */
test("a pasted grouped code arrives normalised", () => {
  const onChangeText = jest.fn();
  render(<CodeField value="" onChangeText={onChangeText} />);
  fireEvent.changeText(field(), "418 302");
  expect(onChangeText).toHaveBeenCalledWith("418302");
});

test("it never reports more than a full code", () => {
  const onChangeText = jest.fn();
  render(<CodeField value="" onChangeText={onChangeText} />);
  fireEvent.changeText(field(), "4183029999");
  expect(onChangeText).toHaveBeenCalledWith("418302");
});

// The whole field goes red, not one box: the person cannot know which digit
// was wrong, and marking one would be a guess presented as fact.
//
// The value is deliberately partial. With a complete code the cursor is -1 and
// every box already takes the same branch, so asserting only that the borders
// agree would still pass with the invalid branch deleted — the assertion has
// to name the colour, and the cursor has to be live for it to mean anything.
test("a refused code marks every box", () => {
  render(<CodeField value="4183" onChangeText={jest.fn()} invalid />);
  const borders = Array.from({ length: CODE_LENGTH }, (_, i) =>
    screen.getByTestId(`code-box-${i}`).props.style.borderColor);
  expect(new Set(borders)).toEqual(new Set([colors.danger]));
});

test("it asks for the numeric keypad and offers one-time-code autofill", () => {
  render(<CodeField value="" onChangeText={jest.fn()} />);
  expect(field().props.keyboardType).toBe("number-pad");
  expect(field().props.textContentType).toBe("oneTimeCode");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/__tests__/codeField.test.tsx`
Expected: FAIL — `Cannot find module '../CodeField'`

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { CODE_LENGTH, normaliseCode } from "@/lib/otpCode";
import { colors } from "@/ui/theme";
import { FACES, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * Six boxes with one real input behind them.
 *
 * Six separate `TextInput`s is the obvious build and the wrong one: it has to
 * hand focus along on every keystroke, backspace out of an empty box into the
 * previous one, and split a six-character paste across six controls that each
 * think they hold one character. One transparent full-bleed input avoids all
 * of it — the boxes become presentation, and paste, autofill and backspace are
 * the platform's own behaviour rather than ours to reimplement.
 *
 * The value is normalised on the way in rather than validated on the way out,
 * so this component cannot hold a string that `verifyOtp` would reject.
 */
export function CodeField({
  value, onChangeText, invalid = false, autoFocus = true,
}: {
  value: string;
  onChangeText: (code: string) => void;
  /** Every box goes red — which digit was wrong is not knowable. */
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const input = useRef<TextInput>(null);
  const boxes = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");
  // The box the next digit lands in, so it can carry the accent. Once the code
  // is full there is no next box and nothing is highlighted.
  const cursor = value.length < CODE_LENGTH ? value.length : -1;

  const border = (i: number) => {
    if (invalid) return colors.danger;
    return i === cursor ? colors.accent : colors.separator;
  };

  return (
    <Pressable
      // `accessible={false}` is load-bearing, not tidiness. Pressable defaults
      // to accessible: true, which collapses this whole subtree — six boxes and
      // the input — into one opaque node, and a screen reader then announces
      // "Enter the code, button" and offers no way to type. With it false, the
      // TextInput's own label is what assistive tech reaches.
      accessible={false}
      accessibilityRole="button"
      accessibilityLabel="Enter the code"
      // Effectively unreachable by ordinary touch, since the full-bleed input
      // above claims the responder first; this serves the assistive-tech
      // activation path.
      onPress={() => input.current?.focus()}
      style={{ flexDirection: "row", justifyContent: "center", gap: 9, paddingHorizontal: 16 }}
    >
      {boxes.map((digit, i) => (
        <View
          key={i}
          testID={`code-box-${i}`}
          style={{
            width: 46, height: 56, borderRadius: 12,
            backgroundColor: colors.cell,
            borderWidth: 1.5, borderColor: border(i),
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Text
            maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
            style={{ fontSize: 26, lineHeight: 32, fontFamily: FACES["700"], fontWeight: "700", color: colors.label }}
          >
            {digit}
          </Text>
        </View>
      ))}
      <TextInput
        ref={input}
        accessibilityLabel="Verification code"
        value={value}
        onChangeText={(raw) => onChangeText(normaliseCode(raw))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        maxLength={CODE_LENGTH}
        // Invisible rather than absent: it has to be focusable and hold the
        // caret, and a zero-size input does not reliably take focus on iOS.
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }}
      />
    </Pressable>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/ui/__tests__/codeField.test.tsx`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/ui/CodeField.tsx src/ui/__tests__/codeField.test.tsx
git commit -m "feat: a six-box code field with one input behind it"
```

---

### Task 4: Verifying and resending in the store

**Files:**
- Modify: `src/stores/sessionStore.ts`
- Test: `src/stores/__tests__/sessionStore.test.ts`

**Interfaces:**
- Consumes: `CodeType` from `@/lib/otpCode`
- Produces: `verifyCode(email, token, type: CodeType): Promise<string | null>`, `resendCode(email, type: CodeType): Promise<string | null>` on `useSession`. `signUp`, `sendMagicLink` and `sendPasswordReset` keep their signatures but no longer pass any redirect.

- [ ] **Step 1: Write the failing test**

First extend the module mock at the top of `sessionStore.test.ts` — add these
two lines inside the `auth: { ... }` object:

```ts
      verifyOtp: jest.fn(),
      resend: jest.fn(),
```

Then append:

```ts
/**
 * ── Codes ─────────────────────────────────────────────────────────────────
 *
 * The session is set from the verify result rather than left to the auth
 * listener. Both do fire in the real client, but the listener is the slower
 * of the two and the screen navigates on the store, so trusting only the
 * listener puts a frame of "signed in but still on the code screen" in front
 * of every person who gets their code right.
 */
test("a good signup code opens a session", async () => {
  const session = { user: { id: "u1" } };
  (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ data: { session }, error: null });

  expect(await useSession.getState().verifyCode("a@b.com", "418302", "signup")).toBeNull();

  expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: "a@b.com", token: "418302", type: "signup" });
  expect(useSession.getState().session).toBe(session);
  expect(useSession.getState().recovering).toBe(false);
});

// Same call, one different consequence — exactly as the old deep-link path
// treated `type === "recovery"`. Without this the person lands in the app on
// the password they could not remember.
test("a good recovery code routes to setting a new password", async () => {
  (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });

  await useSession.getState().verifyCode("a@b.com", "418302", "recovery");

  expect(useSession.getState().recovering).toBe(true);
});

test("a refused code is a sentence and changes nothing", async () => {
  useSession.setState({ session: null, recovering: false });
  (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({
    data: { session: null }, error: { message: "Token has expired or is invalid" },
  });

  expect(await useSession.getState().verifyCode("a@b.com", "000000", "recovery"))
    .toBe(authError("Token has expired or is invalid"));
  expect(useSession.getState().session).toBeNull();
  expect(useSession.getState().recovering).toBe(false);
});

/**
 * Three flows, three different ways to ask again. `auth.resend` covers signup
 * only; recovery and magic link are re-sent by calling the same function that
 * sent them the first time.
 */
test("resending a signup code uses resend", async () => {
  (supabase.auth.resend as jest.Mock).mockResolvedValue({ error: null });
  expect(await useSession.getState().resendCode("a@b.com", "signup")).toBeNull();
  expect(supabase.auth.resend).toHaveBeenCalledWith({ type: "signup", email: "a@b.com" });
});

test("resending a recovery code asks for another reset", async () => {
  (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({ error: null });
  expect(await useSession.getState().resendCode("a@b.com", "recovery")).toBeNull();
  expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.com");
});

test("resending a magic code asks for another one", async () => {
  (supabase.auth.signInWithOtp as jest.Mock).mockResolvedValue({ error: null });
  expect(await useSession.getState().resendCode("a@b.com", "email")).toBeNull();
  expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({ email: "a@b.com" });
});

// max_frequency is 60s on the project, so this is the common answer to an
// impatient second tap, not an edge case.
test("resending too soon is a sentence", async () => {
  (supabase.auth.resend as jest.Mock).mockResolvedValue({
    error: { message: "For security purposes, you can only request this after 41 seconds" },
  });
  expect(await useSession.getState().resendCode("a@b.com", "signup")).toMatch(/give it a minute/i);
});

/**
 * No emailed link exists any more, so a redirect on any of these is a leftover
 * pointing at a screen that has been deleted.
 */
test("nothing asks Supabase to redirect anywhere", async () => {
  (supabase.auth.signUp as jest.Mock).mockResolvedValue({ error: null });
  (supabase.auth.signInWithOtp as jest.Mock).mockResolvedValue({ error: null });
  (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({ error: null });

  await useSession.getState().signUp("a@b.com", "hunter2hunter2", { full_name: "Sam" });
  await useSession.getState().sendMagicLink("a@b.com");
  await useSession.getState().sendPasswordReset("a@b.com");

  expect(JSON.stringify((supabase.auth.signUp as jest.Mock).mock.calls)).not.toMatch(/redirect/i);
  expect(JSON.stringify((supabase.auth.signInWithOtp as jest.Mock).mock.calls)).not.toMatch(/redirect/i);
  expect(JSON.stringify((supabase.auth.resetPasswordForEmail as jest.Mock).mock.calls)).not.toMatch(/redirect/i);
});
```

Then **delete** the three existing tests that assert on redirects and the three
`setSessionFromCallback` tests — they cover behaviour this task removes. They
are at roughly `sessionStore.test.ts:181`, `:192`, `:209`, `:229`, `:236`,
`:245` and `:371`; find them by searching for `emailRedirectTo`, `redirectTo`
and `setSessionFromCallback`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/stores/__tests__/sessionStore.test.ts`
Expected: FAIL — `verifyCode is not a function`

- [ ] **Step 3: Write minimal implementation**

In `src/stores/sessionStore.ts`:

1. Add the import: `import type { CodeType } from "@/lib/otpCode";`
2. Delete the `REDIRECT` constant.
3. In the `SessionState` type, replace the `setSessionFromCallback` line with:

```ts
  verifyCode: (email: string, token: string, type: CodeType) => Promise<string | null>;
  resendCode: (email: string, type: CodeType) => Promise<string | null>;
```

4. Drop the `options` redirect from the three senders:

```ts
  signUp: async (email, password, metadata = {}) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
    return error ? authError(error.message) : null;
  },
  sendMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    return error ? authError(error.message) : null;
  },
  sendPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return error ? authError(error.message) : null;
  },
```

5. Replace the whole `setSessionFromCallback` implementation with:

```ts
  /**
   * The typed code, whichever flow it came from.
   *
   * All three open the same kind of session; only `recovery` changes what the
   * app does next, which is why that alone is branched on — the same split the
   * deep-link callback used to make on its `type` fragment.
   *
   * The session is set from the result rather than left to the auth listener.
   * Both fire in the real client, but the screen navigates on this store, and
   * waiting on the slower of the two shows a frame of the code screen to
   * somebody who has already got it right.
   */
  verifyCode: async (email, token, type) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type });
    if (error) return authError(error.message);
    set({ session: data.session, recovering: type === "recovery" });
    return null;
  },

  /**
   * Ask for another code.
   *
   * Three flows, three calls: `auth.resend` handles signup and nothing else we
   * use, so recovery and magic link are re-sent by calling the same function
   * that sent them the first time. `max_frequency` is 60s on the project, so a
   * refusal here is ordinary impatience rather than a fault — `authError`
   * already turns it into a sentence about waiting a minute.
   */
  resendCode: async (email, type) => {
    if (type === "recovery") {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      return error ? authError(error.message) : null;
    }
    if (type === "email") {
      const { error } = await supabase.auth.signInWithOtp({ email });
      return error ? authError(error.message) : null;
    }
    const { error } = await supabase.auth.resend({ type: "signup", email });
    return error ? authError(error.message) : null;
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/stores/__tests__/sessionStore.test.ts && npx tsc --noEmit`
Expected: PASS. `tsc` will still flag `app/_layout.tsx` for the now-missing `setSessionFromCallback` — that is Task 7's job and is expected here.

- [ ] **Step 5: Commit**

```bash
git add src/stores/sessionStore.ts src/stores/__tests__/sessionStore.test.ts
git commit -m "feat: verify and resend codes instead of following links"
```

---

### Task 5: The verify screen

**Files:**
- Create: `src/lib/verifyCopy.ts`
- Create: `src/lib/__tests__/verifyCopy.test.ts`
- Create: `app/(auth)/verify.tsx`
- Test: `src/ui/__tests__/verifyScreen.test.tsx`

**Interfaces:**
- Consumes: `CodeField`, `CODE_LENGTH`/`isComplete`/`CodeType` from `@/lib/otpCode`, `verifyCode`/`resendCode` from `useSession`
- Produces: route `/(auth)/verify` taking `email` and `type` params; `verifyCopy(type: CodeType): { title: string; subtitle: (email: string) => string }`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/verifyCopy.test.ts`:

```ts
import { verifyCopy } from "../verifyCopy";

test("each flow gets its own words", () => {
  const titles = (["signup", "recovery", "email"] as const).map((t) => verifyCopy(t).title);
  expect(new Set(titles).size).toBe(3);
});

test("the address is repeated back, so a typo is visible", () => {
  expect(verifyCopy("signup").subtitle("sam@example.com")).toContain("sam@example.com");
  expect(verifyCopy("recovery").subtitle("sam@example.com")).toContain("sam@example.com");
});

// An unknown type must still render a screen rather than crash it — Supabase
// adds link types without announcing them.
test("an unrecognised type still has words", () => {
  expect(verifyCopy("nonsense" as never).title).toBeTruthy();
});
```

`src/ui/__tests__/verifyScreen.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ email: "sam@example.com", type: "signup" }),
}));

import Verify from "../../../app/(auth)/verify";
import { useSession } from "@/stores/sessionStore";

const verifyCode = jest.fn();
const resendCode = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  verifyCode.mockResolvedValue(null);
  resendCode.mockResolvedValue(null);
  useSession.setState({ verifyCode, resendCode } as never);
});

const type = (code: string) =>
  fireEvent.changeText(screen.getByLabelText("Verification code"), code);

test("the address the code went to is on screen", () => {
  render(<Verify />);
  expect(screen.getByText(/sam@example\.com/)).toBeTruthy();
});

/**
 * Six digits is the whole form. Making somebody reach for a separate button
 * after the last digit is a tap that carries no information.
 */
test("a full code verifies without a further tap", async () => {
  render(<Verify />);
  type("418302");
  await waitFor(() =>
    expect(verifyCode).toHaveBeenCalledWith("sam@example.com", "418302", "signup"));
});

test("an incomplete code verifies nothing", () => {
  render(<Verify />);
  type("4183");
  expect(verifyCode).not.toHaveBeenCalled();
});

test("a refused code says why and keeps the digits on screen", async () => {
  verifyCode.mockResolvedValue("That code isn't right. Check the email and try again.");
  render(<Verify />);
  type("418302");
  expect(await screen.findByText(/isn't right/i)).toBeTruthy();
  expect(screen.getByTestId("code-box-0")).toHaveTextContent("4");
});

// Two verifies for one code is a wasted attempt against the rate limit, and
// the second one always fails — the first spent the code.
test("a code in flight is not sent twice", async () => {
  verifyCode.mockReturnValue(new Promise(() => {}));
  render(<Verify />);
  type("418302");
  type("418302");
  await waitFor(() => expect(verifyCode).toHaveBeenCalledTimes(1));
});

test("a new code can be asked for", async () => {
  render(<Verify />);
  fireEvent.press(screen.getByRole("button", { name: "Send a new code" }));
  await waitFor(() => expect(resendCode).toHaveBeenCalledWith("sam@example.com", "signup"));
});

test("a refused resend states the reason", async () => {
  resendCode.mockResolvedValue("Too many tries just now. Give it a minute and go again.");
  render(<Verify />);
  fireEvent.press(screen.getByRole("button", { name: "Send a new code" }));
  expect(await screen.findByText(/give it a minute/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest verifyCopy verifyScreen`
Expected: FAIL — both modules missing

- [ ] **Step 3: Write minimal implementation**

`src/lib/verifyCopy.ts`:

```ts
import type { CodeType } from "@/lib/otpCode";

/**
 * What the one verify screen says, per flow.
 *
 * Separated from the screen because it is the part that differs and the part
 * worth reading in one place: three flows share every pixel and disagree only
 * about six sentences, and inlining them would bury that in JSX conditionals.
 *
 * Words only — the per-flow badge glyph lives in the screen instead. Typing an
 * icon name properly costs `keyof typeof Ionicons.glyphMap`, and importing a
 * vector-icon package into `src/lib` to get it would put a UI dependency in the
 * one directory that has none: `authRoute`, `authError` and `otpCode` are all
 * dependency-free, and that is what makes them trivially testable.
 */
type Copy = {
  title: string;
  subtitle: (email: string) => string;
};

const COPY: Record<CodeType, Copy> = {
  signup: {
    title: "Check your email",
    subtitle: (email) => `We've sent a six-digit code to ${email}. Enter it to activate your account.`,
  },
  recovery: {
    title: "Enter your code",
    subtitle: (email) => `We've sent a six-digit code to ${email}. Enter it, then you can set a new password.`,
  },
  email: {
    // Distinct from recovery's title on purpose: the test above asserts three
    // different titles, because a screen that cannot say which flow you are in
    // is the one people abandon.
    title: "Sign in with your code",
    subtitle: (email) => `We've sent a six-digit code to ${email}. Enter it and you're in.`,
  },
};

export function verifyCopy(type: CodeType): Copy {
  return COPY[type] ?? COPY.signup;
}
```

`app/(auth)/verify.tsx`:

```tsx
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CodeField } from "@/ui/CodeField";
import { isComplete, type CodeType } from "@/lib/otpCode";
import { verifyCopy } from "@/lib/verifyCopy";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { footnote, largeTitle, subheadline, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

/**
 * The badge glyph per flow, matching the badge that flow's email carries.
 *
 * Here rather than in `verifyCopy` so that module stays free of UI imports;
 * this is the same shape `app/(auth)/sign-up.tsx` uses for FOCUS_ICONS.
 */
const ICONS: Record<CodeType, React.ComponentProps<typeof Ionicons>["name"]> = {
  signup: "mail-outline",
  recovery: "lock-open-outline",
  email: "key-outline",
};

/**
 * Where every emailed code is typed — sign-up, recovery and magic link alike.
 *
 * One screen rather than a field inlined into each of the three senders. The
 * resend cooldown, the three failure sentences and the paste handling are the
 * same in all three flows, and three copies of them is three chances to drift.
 *
 * There is no submit button. Six digits is the whole form, so the last digit
 * is the submit — a button after it would be a tap carrying no information.
 * `busy` is what stops a second verify: the code is spent by the first, so a
 * duplicate is always a wasted attempt against the rate limit.
 *
 * Nothing here routes on success. Setting the session is what moves the app —
 * `nextAuthRoute` sends a confirmed sign-up to the tabs and a verified
 * recovery to update-password, exactly as it did when links did the setting.
 */
export default function Verify() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; type?: string }>();
  const email = params.email ?? "";
  const type = (params.type ?? "signup") as CodeType;

  const verifyCode = useSession((s) => s.verifyCode);
  const resendCode = useSession((s) => s.resendCode);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = verifyCopy(type);

  const enter = async (next: string) => {
    setCode(next);
    if (error) setError(null);
    if (!isComplete(next) || busy) return;

    setBusy(true);
    const failure = await verifyCode(email, next, type);
    setBusy(false);
    if (!failure) return;
    setError(failure);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const again = async () => {
    setError(null);
    setNotice(null);
    const failure = await resendCode(email, type);
    if (failure) {
      setError(failure);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setCode("");
    setNotice("Sent. Check your email again.");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.field }}>
      <View style={{ height: 44, justifyContent: "center", paddingHorizontal: 12 }}>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}
          onPress={() => router.back()}
          style={{ height: 44, width: 44, justifyContent: "center" }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.accentPressed} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: "padding", android: "height" })}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={enterFrom(0)} style={{ paddingHorizontal: 16, paddingBottom: 26, gap: 14 }}>
            <View style={{ height: 56, width: 56, borderRadius: 17, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={ICONS[type] ?? ICONS.signup} size={26} color="#FFFFFF" />
            </View>
            <View>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...largeTitle, color: colors.label }}>
                {copy.title}
              </Text>
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary, paddingTop: 6 }}>
                {copy.subtitle(email)}
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={enterFrom(1)}>
            <CodeField value={code} onChangeText={enter} invalid={Boolean(error)} />
            {/* The live region is the non-visual half of `invalid`. CodeField
                signals a refused code by turning every box red, which reaches
                nobody using a screen reader; this is where the sentence saying
                what went wrong actually gets announced. */}
            {error && (
              <Text
                accessibilityLiveRegion="polite"
                maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
                style={{ ...footnote, color: colors.danger, paddingHorizontal: 20, paddingTop: 14, textAlign: "center" }}
              >
                {error}
              </Text>
            )}
            {notice && !error && (
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.accentPressed, paddingHorizontal: 20, paddingTop: 14, textAlign: "center" }}>
                {notice}
              </Text>
            )}
          </Animated.View>

          <Animated.View entering={enterFrom(2)} style={{ paddingTop: 20 }}>
            <Pressable
              accessibilityRole="button" accessibilityLabel="Send a new code"
              onPress={again}
              style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary }}>
                {"Didn't arrive? "}
                <Text style={{ color: colors.accentPressed, fontWeight: "600" }}>Send a new code</Text>
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Regenerate the typed-route declarations**

`app.config.js` sets `experiments.typedRoutes`, and `tsconfig.json` includes
`.expo/types/**/*.ts`, where expo-router writes a literal union of every route
that exists. Creating `verify.tsx` does not update that file, so until it is
regenerated `tsc` rejects any push to the new route with:

```
error TS2322: Type '"/(auth)/verify"' is not assignable to type '"/" | "/(auth)/update-password" | ...'
```

Task 6 pushes to this route from three screens, so regenerate now:

```bash
npx expo start --clear > /tmp/regen.log 2>&1 &
sleep 6; pkill -f "expo start"
grep -c "/verify" .expo/types/router.d.ts
```

Expected: a non-zero count. Generation happens during boot and completes in a
couple of seconds — it works even when the server then declines to bind a port
because another dev server already holds 8081, so a "Skipping dev server" line
in the log is not a failure.

`.expo/` is gitignored, so this produces no diff. It is a local build artifact
that any developer regenerates by running the app; it is regenerated here only
so the typecheck in the next step reflects the route that now exists.

- [ ] **Step 5: Run tests and the typecheck**

Run: `npx jest verifyCopy verifyScreen && npx tsc --noEmit`
Expected: PASS, 3 + 7 tests, and a clean typecheck.

Note: `tsc` still reports the pre-existing error in `app/_layout.tsx` from
Task 4's removal of `setSessionFromCallback` — that is expected and is Task 7's
to fix. It must be the *only* error, and it must be in that one file.

- [ ] **Step 6: Commit**

```bash
git add src/lib/verifyCopy.ts src/lib/__tests__/verifyCopy.test.ts "app/(auth)/verify.tsx" src/ui/__tests__/verifyScreen.test.tsx
git commit -m "feat: one screen where every emailed code is typed"
```

---

### Task 6: Send all three flows to the verify screen

**Files:**
- Modify: `app/(auth)/sign-up.tsx` (the `done` branch, around `:160-188`)
- Modify: `app/(auth)/reset.tsx` (the `sentTo` branch)
- Modify: `app/(auth)/sign-in.tsx` (`emailLink`)
- Test: `src/ui/__tests__/signUpFlow.test.tsx`, `src/ui/__tests__/resetScreen.test.tsx`, `src/ui/__tests__/signInScreen.test.tsx`

**Interfaces:**
- Consumes: the `/(auth)/verify` route from Task 5
- Produces: nothing new — three call sites now navigate instead of rendering a "check your inbox" dead end

- [ ] **Step 1: Write the failing test**

In `src/ui/__tests__/resetScreen.test.tsx`, replace the two tests named
`"once sent, the form is gone and the next step is named"` and
`"the address it went to is repeated back, so a typo is visible"` with:

```tsx
// The screen no longer has a terminal "check your inbox" state — the code has
// to be typed somewhere, and that somewhere is the verify screen.
test("once sent it goes to the code screen, carrying the address", async () => {
  render(<Reset />);
  ask("sam@example.com");
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({
    pathname: "/(auth)/verify",
    params: { email: "sam@example.com", type: "recovery" },
  }));
});
```

and add `push` to that file's router mock so it is observable:

```tsx
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack, push: mockPush, replace: jest.fn() }) }));
```

In `src/ui/__tests__/signInScreen.test.tsx` the router mock already captures
`mockPush` (line 3), so no mock change is needed. Two existing tests assert on
the sent-notice this task removes:

- Replace `"a sign-in link can be sent instead, and says it was"` (line 83) with
  the test below.
- **Delete** `"a later failure clears the earlier success message"` (line 102)
  together with its doc comment. It guards an interaction between `notice` and
  `error` that cannot happen once `notice` is gone — sending now navigates away
  rather than leaving a message on the screen behind.

Keep `"a link cannot be sent to an empty address"` (line 91), but update its
selector along with the rest — the button is renamed in Step 3, since it no
longer sends a link. **Every `{ name: "Email me a sign-in link" }` in this file
becomes `{ name: "Email me a sign-in code" }`**; there are three, at lines 86,
93 and 105, and the one at 105 goes away with its test.

```tsx
// Sending no longer annotates this screen — there is a code to type, so the
// flow moves to the screen that takes it.
test("asking for a sign-in code goes to the code screen", async () => {
  render(<SignIn />);
  fireEvent.changeText(screen.getByLabelText("Email address"), "sam@example.com");
  fireEvent.press(screen.getByRole("button", { name: "Email me a sign-in code" }));
  await waitFor(() => expect(sendMagicLink).toHaveBeenCalledWith("sam@example.com"));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({
    pathname: "/(auth)/verify",
    params: { email: "sam@example.com", type: "email" },
  }));
});
```

In `src/ui/__tests__/signUpFlow.test.tsx`, capture `push` in the router mock at
the top of the file (it is currently an anonymous `jest.fn()` at line 6):

```tsx
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: mockPush }),
}));
```

Then replace the test named `"success replaces the form rather than annotating it"`
(line 194) in full with — note it reuses the file's existing `answerEverything()`
and `fillCredentials()` helpers:

```tsx
// The screen used to end on its own "Check your inbox" panel. There is now a
// code to type, so the flow continues on the verify screen instead of stopping.
test("a created account goes to the code screen", async () => {
  render(<SignUp />);
  await answerEverything();
  fillCredentials();
  fireEvent.press(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({
    pathname: "/(auth)/verify",
    params: { email: "sam@example.com", type: "signup" },
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest resetScreen signInScreen signUpFlow`
Expected: FAIL — `mockPush` never called

- [ ] **Step 3: Write minimal implementation**

In `app/(auth)/reset.tsx` — delete the `sentTo` state and the whole `sentTo ?`
branch of the JSX, and end `send` by navigating:

```tsx
    setSentTo(address);
```

becomes

```tsx
    router.push({ pathname: "/(auth)/verify", params: { email: address, type: "recovery" } });
```

Then clean up what the deleted branch leaves behind. Be precise — two of these
imports are still in use by code that stays:

- Delete the `sentTo` state (line 32). Its only readers were inside the branch.
- Remove **`popIn` only** from `import { enterFrom, popIn } from "@/ui/motion";`
  (line 11), leaving `import { enterFrom } from "@/ui/motion";`. `popIn` was
  used at line 68 and nowhere else; `enterFrom` is still used three times.
- **Keep the `Ionicons` import** (line 7). The mail badge at line 71 goes with
  the branch, but the back chevron at line 59 stays and needs it.
- **Keep `Animated`** (line 5) — `enterFrom` still drives three `Animated.View`s.

Only one of those two mistakes is caught for you. Deleting an import that is
still in use fails `tsc` immediately. Leaving one behind that is now unused
does **not** — this project sets neither `noUnusedLocals` nor
`noUnusedParameters` (checked in `tsconfig.json` and `expo/tsconfig.base`), so
a stale `popIn` import typechecks happily. `npx expo lint` is what flags it, and
Task 9 runs that. Remove it by hand here rather than relying on either.

In `app/(auth)/sign-in.tsx`, replace the tail of `emailLink`:

```tsx
    setNotice("Check your email for the sign-in link.");
```

with

```tsx
    router.push({ pathname: "/(auth)/verify", params: { email: email.trim(), type: "email" } });
```

Then remove the `notice` state entirely — it had exactly one writer, and that
writer now navigates. Delete the `const [notice, setNotice] = useState(...)`
line, the `{notice && (...)}` block near the magic-link group, and simplify
`clear()` to `() => setError(null)`.

Rename the button, which no longer sends a link. Both its visible text and its
`accessibilityLabel` become `Email me a sign-in code` — they must match, since
`AuthField`'s convention throughout this app is that the visible words are the
accessible name. Update the file's header comment where it describes the magic
link as the only way back into an account, since recovery is now a code too.

In `app/(auth)/sign-up.tsx`, replace `setDone(true);` at the end of the submit
handler with:

```tsx
    router.push({ pathname: "/(auth)/verify", params: { email: email.trim(), type: "signup" } });
```

Then remove the `done` state. It has **three** call sites, not one, and missing
the third breaks the build:

1. `const [done, setDone] = useState(false);` (line 70) — delete.
2. The entire `if (done) { ... }` block (line 165) — delete. That was the
   terminal "Check your inbox" panel; the push above replaces it.
3. **The Android hardware-back handler at line 130** — `if (done || step === 0) return false;`
   becomes `if (step === 0) return false;`, and `done` comes out of that
   effect's dependency array on line 136.

That third one is easy to miss and `tsc` is what catches it. The behaviour it
encodes still holds: hardware back walks the interview's cards, and falls
through to the system only on the first card. The `done` half of the condition
existed so back would leave the terminal panel rather than re-entering the
form — there is no terminal panel any more, because the screen navigates.

Update the file's header comment where it says the confirmation arrives as a
link, so it describes the code instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. `tsc` still flags `app/_layout.tsx` — Task 7.

If instead you get `TS2322: Type '"/(auth)/verify"' is not assignable to type ...`
on the three files you just edited, the typed-route declarations are stale:
Task 5 Step 4 regenerates them, and this is what it looks like when that was
skipped or when `.expo/` was cleared since. Re-run that step:

```bash
npx expo start --clear > /tmp/regen.log 2>&1 &
sleep 6; pkill -f "expo start"
grep -c "/verify" .expo/types/router.d.ts
```

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/sign-up.tsx" "app/(auth)/reset.tsx" "app/(auth)/sign-in.tsx" src/ui/__tests__
git commit -m "feat: send every flow to the code screen instead of the inbox"
```

---

### Task 7: Retire the deep-link auth path

**Files:**
- Delete: `app/auth-callback.tsx`, `src/lib/authCallback.ts`, `src/lib/__tests__/authCallback.test.ts`
- Modify: `app/_layout.tsx` (remove the `Linking` effect and its imports)
- Modify: `src/lib/authRoute.ts` (remove the `auth-callback` branch)
- Test: `src/lib/__tests__/authRoute.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `nextAuthRoute` no longer recognises an `auth-callback` segment

- [ ] **Step 1: Write the failing test**

In `src/lib/__tests__/authRoute.test.ts`, delete the whole callback section —
lines 57 to 83 inclusive, which is the `── The callback landing pad ──` comment
block, the three tests it introduces (`recovering, freshly landed on the
callback route...` at 66, `a signup or magic-link callback with a session...`
at 71, `a rejected callback with no session...` at 80) and the explanatory
comment between them at 76-79. Identify them by name rather than by line
number. Then add:

```ts
/**
 * The landing pad is gone. No email carries a token any more, so a URL
 * claiming to be one is a stale link from an old build or somebody's guess,
 * and it gets the same answer as any other unknown route: go where the
 * session says.
 */
test("a stale auth-callback link is treated as an ordinary route", () => {
  expect(nextAuthRoute({ session: null, recovering: false, segments: ["auth-callback"] }))
    .toBe("/(auth)/sign-in");
  expect(nextAuthRoute({ session: {}, recovering: false, segments: ["auth-callback"] }))
    .toBeNull();
});

// The one thing that must survive the deletion: recovery still outranks
// everything, now set by a verified code rather than by a link's fragment.
test("recovery still wins wherever it is set from", () => {
  expect(nextAuthRoute({ session: {}, recovering: true, segments: ["(tabs)"] }))
    .toBe("/(auth)/update-password");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest authRoute`
Expected: FAIL — the second assertion of the first test returns `"/(tabs)"`, because the `auth-callback` branch still fires

- [ ] **Step 3: Write minimal implementation**

In `src/lib/authRoute.ts`, delete the `auth-callback` clause and its comment so
the line reads:

```ts
  if (onUpdatePassword) return session ? "/(tabs)" : "/(auth)/sign-in";
```

In `app/_layout.tsx`: delete the `expo-linking` import, the `parseAuthCallback`
import, the entire deep-link `useEffect`, and `setSessionFromCallback` from the
`useSession()` destructure.

Then delete the three files:

```bash
git rm app/auth-callback.tsx src/lib/authCallback.ts src/lib/__tests__/authCallback.test.ts
```

- [ ] **Step 4: Regenerate the typed routes**

Deleting `app/auth-callback.tsx` leaves `.expo/types/router.d.ts` still listing
`/auth-callback` as a valid pathname. That does not fail the build — a union
with a spare member compiles fine — but it means the generated types describe a
route the app no longer has, and the next person to trust them is misled.

```bash
npx expo start --clear > /tmp/regen.log 2>&1 &
sleep 6; pkill -f "expo start"
grep -c "auth-callback" .expo/types/router.d.ts
```

Expected: `0`. A "Skipping dev server" line in the log is not a failure — the
declarations are written before the server tries to bind a port. `.expo/` is
gitignored, so this produces no diff.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npm test && npx tsc --noEmit`

Expected: PASS, and — for the first time since Task 4 — **a completely clean
typecheck**. The `app/_layout.tsx` error about `setSessionFromCallback` is the
one this task exists to clear; if it survives, the listener was not fully
removed.

Then confirm nothing references the deleted modules:

```bash
grep -rn "parseAuthCallback\|setSessionFromCallback\|auth-callback" --include="*.ts" --include="*.tsx" app src
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add -A app src
git commit -m "chore: delete the deep-link auth path no email points at"
```

---

### Task 8: Rewrite the three emails as codes

**Files:**
- Modify: `supabase/templates/confirmation.html`, `recovery.html`, `magic_link.html`
- Modify: `supabase/config.toml` (`otp_length`, `otp_expiry`)

**Interfaces:**
- Consumes: nothing
- Produces: templates rendering `{{ .Token }}` and containing no `{{ .ConfirmationURL }}`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/emailTemplates.test.ts` — under `src/`, with the rest
of the suite, rather than beside the templates. A `__tests__` directory inside
`supabase/` would be picked up by Jest but sits in a tree the Supabase CLI
also walks; keeping it here means the templates are covered without putting
test files where deployment tooling looks. Reading through `node:fs` under the
`jest-expo` preset is verified to work and runs once, not once per platform.

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CODE_LENGTH } from "@/lib/otpCode";

const DIR = join(__dirname, "../../../supabase/templates");
const NAMES = ["confirmation.html", "recovery.html", "magic_link.html"];

const read = (name: string) => readFileSync(join(DIR, name), "utf8");

test("every template that exists is one of the three we configure", () => {
  const html = readdirSync(DIR).filter((f) => f.endsWith(".html"));
  expect(html.sort()).toEqual([...NAMES].sort());
});

/**
 * The whole point of the change. A link in the body re-imports the scanner
 * problem — a mail filter follows it, spends the one-time token, and the
 * person is told their code is already used.
 */
test.each(NAMES)("%s carries a code and no link", (name) => {
  const html = read(name);
  expect(html).toContain("{{ .Token }}");
  expect(html).not.toContain("ConfirmationURL");
  expect(html).not.toMatch(/<a\s[^>]*href="\{\{/);
});

test.each(NAMES)("%s still addresses the person it went to", (name) => {
  expect(read(name)).toContain("{{ .Email }}");
});

// The templates quote the expiry in words; config.toml sets it in seconds.
// These two drift apart silently, and the email is the half people read.
test.each(NAMES)("%s quotes the configured expiry", (name) => {
  const toml = readFileSync(join(DIR, "..", "config.toml"), "utf8"); // supabase/config.toml
  const seconds = Number(/^otp_expiry\s*=\s*(\d+)/m.exec(toml)?.[1]);
  expect(seconds).toBe(3600);
  expect(read(name)).toContain(`${seconds / 60} minutes`);
});

/**
 * The one mismatch that fails in production while every test passes.
 *
 * `otp_length` is what Supabase actually puts in the email; `CODE_LENGTH` is
 * how many boxes the app draws and how many digits it will submit. If they
 * disagree, every code is refused — the field submits six digits against an
 * eight-digit code, or never fills at all — and nothing anywhere else notices,
 * because both halves are internally consistent. The plan checks this by hand
 * at the end; a test is what keeps it checked.
 */
test("the configured code length is the length the app types", () => {
  const toml = readFileSync(join(DIR, "..", "config.toml"), "utf8");
  const configured = Number(/^otp_length\s*=\s*(\d+)/m.exec(toml)?.[1]);
  expect(configured).toBe(CODE_LENGTH);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/emailTemplates.test.ts`
Expected: FAIL — templates still contain `ConfirmationURL`, `otp_expiry` is 86400, and
`otp_length` is 8 where `CODE_LENGTH` is 6

- [ ] **Step 3: Write minimal implementation**

In each of the three templates, replace the button block:

```html
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td class="btn" style="border-radius:13px;" align="center">
<a href="{{ .ConfirmationURL }}" ...>…</a>
</td></tr></table>
```

with the code slab:

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;"><tr><td class="slab" style="border-radius:13px;padding:18px 16px 16px;" align="center">
<div class="slab-cap" style="font-size:11.5px;line-height:16px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;padding-bottom:8px;">Your code</div>
<div class="slab-code" style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;line-height:40px;font-weight:700;letter-spacing:.34em;text-indent:.34em;">{{ .Token }}</div>
</td></tr></table>
```

Add to each template's `<style>` block, beside the existing `.btn` rules:

```css
  .slab { background:#E7F2ED; }
  .slab-cap, .slab-code { color:#146B4A; }
```

and inside the existing `@media (prefers-color-scheme: dark)` block:

```css
    .slab { background:#1B3A2E !important; }
    .slab-cap, .slab-code { color:#6FD3AC !important; }
```

Delete the `.btn` rules, and delete the "Or paste this link into your browser"
paragraph and its `<a>` from all three files.

Then update the copy in each — body line, expiry line, preheader:

| File | Body line | Expiry line |
|---|---|---|
| `confirmation.html` | `Enter this code in RouteReady to activate your account.` | `This code expires in 60 minutes and can only be used once.` |
| `recovery.html` | `Enter this code in RouteReady, then choose a new password.` | `This code expires in 60 minutes and can only be used once.` |
| `magic_link.html` | `Enter this code in RouteReady and you're in.` | `This code expires in 60 minutes and can only be used once.` |

Set each preheader `<span>` to match its body line.

Rename the magic-link email, which no longer carries a link. In
`magic_link.html`, both the `<title>` and the `<h1>` become `Your sign-in code`;
in `config.toml`, the subject becomes:

```toml
subject = "Your sign-in code — RouteReady"
```

`confirmation.html` and `recovery.html` keep their titles and subjects —
"Confirm your email" and "Reset your password" describe the goal, not the
mechanism, so neither went stale.

Change the closing security lines from "open the link" wording to the code:
`confirmation.html` → `no account is created until the code is entered.`;
`recovery.html` → `your password won't change unless this code is entered.`;
`magic_link.html` → `nobody gets into the account unless this code is entered.`

In `supabase/config.toml`:

```toml
otp_length = 6
```
```toml
otp_expiry = 3600
```

Update both fields' comments — `otp_length` is now load-bearing (it is what
`CODE_LENGTH` must agree with) and `otp_expiry` is 60 minutes because a
six-digit code is a millionth the secret a link token is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/emailTemplates.test.ts`
Expected: PASS — 11 test cases (1 + 3 + 3 + 3) plus the code-length check.

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat: send a code in every auth email, and no link at all"
```

---

### Task 9: Documentation and whole-suite verification

**Files:**
- Modify: `SETUP.md` (section 4, and the QA checklist in section 6)

**Interfaces:**
- Consumes: everything above
- Produces: nothing

- [ ] **Step 1: Update SETUP.md**

In section 4, replace step 5's three link-opening bullets with the code flow:

```markdown
5. **Send yourself all three codes and confirm they arrive branded**, in light and dark:
   - sign up with a fresh address → *Confirm your email*
   - "Forgot your password?" → *Reset your password*
   - "Email me a sign-in code" → *Your sign-in code*

   Each email carries a six-digit code and no link. Type it into the screen the
   app is already showing. The reset code must land you on "Set a new password"
   rather than dropping you into the app.

   Check the **From** line reads `RouteReady <noreply@getticker.dev>` and that
   the mail lands in the inbox rather than spam.
```

Delete the "Known limitation: link pre-fetching" subsection — codes are the fix
it described, so it now documents a problem the app no longer has.

In section 6's QA checklist, item 1, replace "confirm via the email Supabase
sends" with "confirm by typing the six-digit code from the email", and the
reset sentence's "open the emailed link on the device" with "type the emailed
code".

Note in section 4 that `site_url` and the redirect allow-list are no longer
load-bearing for auth email, but should still be set correctly for future
share links.

- [ ] **Step 2: Run the whole suite**

Run: `npm test && npx tsc --noEmit && npx expo lint`
Expected: all green. Every previously passing test still passes; the suite is larger by roughly 30 tests.

- [ ] **Step 3: Confirm nothing still speaks the old language**

```bash
grep -rn "ConfirmationURL\|emailRedirectTo\|auth-callback" --include="*.ts" --include="*.tsx" --include="*.html" --include="*.toml" app src supabase
```
Expected: no output.

- [ ] **Step 4: Confirm the two lengths agree**

```bash
grep -n "otp_length" supabase/config.toml
grep -n "CODE_LENGTH = " src/lib/otpCode.ts
```
Expected: both 6. A mismatch means every code is refused in production while every test passes.

- [ ] **Step 5: Commit**

```bash
git add SETUP.md
git commit -m "docs: describe the code flow that replaced the emailed links"
```

---

## After the plan

The push to Supabase is still outstanding and is now the only thing between
this and working production email:

```bash
export $(grep SUPABASE_AUTH_SMTP_PASS .env | xargs) && supabase config push
```

That single push carries the SMTP settings, the three rewritten templates,
`otp_length = 6`, `otp_expiry = 3600`, `rate_limit_email_sent = 100`, and the
`site_url` / allow-list correction. `SUPABASE_AUTH_SMTP_PASS` must be in `.env`
first — it is not there yet.
