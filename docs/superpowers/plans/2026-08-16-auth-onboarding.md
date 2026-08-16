# Sign-in Redesign and the Sign-up Interview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-dress sign-in onto the grouped-inset language, wire the auth paths that were never finished, and turn sign-up into a five-card interview whose answers reach `user_metadata` in one `signUp()` call.

**Architecture:** Three new pure modules in `src/lib/**` carry every decision — error copy, password scoring, and the questions themselves as data. Three new presentational components in `src/ui/**` render them. Two screens consume both. `sign-up.tsx` is **one route holding five cards**, not five routes: the answers must survive until a single `signUp()` call, so the state lives above the steps regardless.

**Tech Stack:** React Native (Expo 54), expo-router, NativeWind, Reanimated 4, Zustand, Supabase JS v2, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-08-16-auth-onboarding.md`

**Design artifact:** https://claude.ai/code/artifact/19e08a16-f60f-4560-8fa0-fd860979b9a1 (local copy `docs/design/2026-08-16-auth-onboarding.html`)

## Global Constraints

- **Seven text styles, and nothing off the scale.** Every font size in a file this plan touches comes from `src/ui/type.ts`. A raw `text-[26px]` does not ship.
- **Colour comes from roles.** `field`, `cell`, `label`, `labelSecondary`, `labelTertiary`, `separator`, `fill`, `accent`, `warning`, `danger` — from `src/ui/theme.ts` or the twinned Tailwind names. Do not add a token.
- **No shadows** in any file this plan touches. A cell separates from the field by being lighter than it.
- **Grouped-inset geometry:** 16pt side margin, 10pt radius, 44pt minimum row, 1px separator inset 16pt from the leading edge. Use `Group`/`Cell`/`GroupHeader` from `src/ui/List.tsx`; do not re-draw them.
- **Nothing oscillates.** No spring, no shake, no overshoot anywhere. Every duration and curve comes from `src/ui/motion.ts`; a file that reaches for its own number is the bug this module exists to prevent.
- **The one exception is the spinner** — `ActivityIndicator`, linear and endless, because it reports progress rather than arriving.
- **Reduce Motion:** Reanimated layout builders handle themselves. Every imperative `withTiming` in this plan must be guarded by `useReducedMotion()` from `react-native-reanimated`.
- **No emoji anywhere in the UI.**
- **British English in all copy** — *practise* (verb), *favourites*, *manoeuvres*, *personalised*.
- Run tests with `npx jest <path>`; full suite `npm test`; lint `npm run lint`.
- **Never `git commit -a`** — this branch carries unrelated staged deletions. `git add` explicit paths.
- **Paths with parentheses need quoting in a shell:** `"app/(auth)/sign-in.tsx"`.
- Baseline before starting: `npm test` is green. If it is not, stop and report — do not build on a red suite.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/authError.ts` | Supabase message → human sentence. Pure and total. | 1 |
| `src/stores/sessionStore.ts` | `sendPasswordReset`; `signUp` takes a profile; selectors for the new keys. Errors mapped here so no screen can forget. | 2, 12 |
| `src/ui/AuthField.tsx` | One row of a credentials `Group`: input, reveal toggle, autofill attributes, return-key chaining. | 3 |
| `app/(auth)/sign-in.tsx` | Re-dressed. Busy state, mapped errors, two new links. | 4 |
| `app/(auth)/reset.tsx` | **New route.** Email → send → sent. | 5 |
| `src/lib/passwordStrength.ts` | Pure scoring of one string. | 7 |
| `src/lib/onboarding.ts` | The four questions as data, the gating, `toMetadata`. Pure. | 8 |
| `src/ui/motion.ts` | Gains `stepForward`, `stepBack`, `stepExit`. Nothing existing changes. | 9 |
| `src/ui/StrengthMeter.tsx` | Four segments and a label. Presentational. | 10 |
| `src/ui/QuestionCard.tsx` | `QuestionCard` + `ChoiceRow`. Presentational — neither stores an answer nor advances. | 11 |
| `app/(auth)/sign-up.tsx` | The five-card container. Owns `Answers`, the step index, `BackHandler`. | 13 |

Tasks 1–5 are **half one** and ship on their own. Task 6 is a decision gate. Tasks 7–13 are **half two**.

---

# HALF ONE — Sign-in and the auth paths

### Task 1: Human error copy

**Files:**
- Create: `src/lib/authError.ts`
- Test: `src/lib/__tests__/authError.test.ts`

**Interfaces:**
- Produces: `authErrorMessage(raw: string | null | undefined): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/authError.test.ts`:

```ts
import { authErrorMessage, GENERIC_AUTH_ERROR } from "../authError";

// These four are the exact strings Supabase returns. They are asserted
// verbatim because the mapping is keyed off them, and a silent upstream
// rewording is precisely the failure this test exists to catch early.
test("the messages users actually hit are rewritten", () => {
  expect(authErrorMessage("Invalid login credentials"))
    .toBe("That email and password don't match. Check the password, or reset it below.");
  expect(authErrorMessage("User already registered"))
    .toBe("There's already an account with that email. Sign in instead, or reset the password.");
  expect(authErrorMessage("Email not confirmed"))
    .toBe("Confirm your email first — check your inbox for the link we sent.");
  expect(authErrorMessage("Email rate limit exceeded"))
    .toBe("Too many emails just now. Wait a minute, then try again.");
});

test("matching ignores case and surrounding words", () => {
  expect(authErrorMessage("AuthApiError: invalid login credentials"))
    .toBe(authErrorMessage("Invalid login credentials"));
});

// A dropped connection is the most common failure of all and is not the
// user's mistake. It must not be reported in the same words as a wrong
// password.
test("a dropped connection says so", () => {
  expect(authErrorMessage("Network request failed"))
    .toBe("No connection. Check your signal, then try again.");
  expect(authErrorMessage("TypeError: Failed to fetch"))
    .toBe("No connection. Check your signal, then try again.");
});

// The whole point of the module: an unrecognised message must not reach a
// user. Asserting the fallback is not enough — the raw text must be gone.
test("an unknown message is replaced, not passed through", () => {
  const raw = "PGRST301: JWSError JWSInvalidSignature";
  const out = authErrorMessage(raw);
  expect(out).toBe(GENERIC_AUTH_ERROR);
  expect(out).not.toContain("JWS");
  expect(out).not.toContain("PGRST");
});

test("no error at all is still a sentence", () => {
  expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
  expect(authErrorMessage(undefined)).toBe(GENERIC_AUTH_ERROR);
  expect(authErrorMessage("")).toBe(GENERIC_AUTH_ERROR);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/lib/__tests__/authError.test.ts`
Expected: FAIL — cannot resolve `../authError`.

- [ ] **Step 3: Implement**

Create `src/lib/authError.ts`:

```ts
/**
 * What a person is told when authentication fails.
 *
 * Supabase's messages are accurate and written for whoever is reading the
 * logs: `Invalid login credentials`, `User already registered`, `PGRST301`.
 * They were reaching the screen verbatim.
 *
 * The mapping is a substring match on a lowercased message rather than an
 * equality check on a code, because supabase-js reports the same condition
 * with different wrappers depending on where it was raised — a bare message
 * from one call, an `AuthApiError: ` prefix from another.
 *
 * It is total on purpose. Every branch returns a written sentence, so an
 * unrecognised message cannot fall through to the raw text.
 */

export const GENERIC_AUTH_ERROR = "Something went wrong. Try again in a moment.";

const OFFLINE = "No connection. Check your signal, then try again.";

// Order matters: the first needle found wins, so put anything that could be a
// substring of another below the longer one.
const RULES: readonly [string, string][] = [
  ["invalid login credentials", "That email and password don't match. Check the password, or reset it below."],
  ["user already registered", "There's already an account with that email. Sign in instead, or reset the password."],
  ["already been registered", "There's already an account with that email. Sign in instead, or reset the password."],
  ["email not confirmed", "Confirm your email first — check your inbox for the link we sent."],
  ["email rate limit exceeded", "Too many emails just now. Wait a minute, then try again."],
  ["over_email_send_rate_limit", "Too many emails just now. Wait a minute, then try again."],
  ["for security purposes", "Too many attempts just now. Wait a minute, then try again."],
  ["password should be at least", "Your password needs at least 8 characters."],
  ["unable to validate email address", "That doesn't look like an email address."],
  ["invalid format", "That doesn't look like an email address."],
  ["network request failed", OFFLINE],
  ["failed to fetch", OFFLINE],
  ["network error", OFFLINE],
];

export function authErrorMessage(raw: string | null | undefined): string {
  if (!raw) return GENERIC_AUTH_ERROR;
  const needle = raw.toLowerCase();
  for (const [match, sentence] of RULES) {
    if (needle.includes(match)) return sentence;
  }
  return GENERIC_AUTH_ERROR;
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/lib/__tests__/authError.test.ts` — expect PASS, five tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/authError.ts src/lib/__tests__/authError.test.ts
git commit -m "feat: rewrite Supabase auth errors as sentences"
```

---

### Task 2: Password reset in the store

**Files:**
- Modify: `src/stores/sessionStore.ts`
- Test: `src/stores/__tests__/sessionStore.test.ts`

**Interfaces:**
- Consumes: `authErrorMessage` from Task 1.
- Produces: `sendPasswordReset(email: string) => Promise<string | null>`. **Every existing action now returns a mapped sentence rather than the raw Supabase message.**

**Why the mapping moves into the store:** the alternative is each screen remembering to call `authErrorMessage`, and forgetting is silent — the raw string renders and looks deliberate. Mapping at the boundary makes the store's contract "a sentence you can show a person, or null".

- [ ] **Step 1: Write the failing test**

Add to `src/stores/__tests__/sessionStore.test.ts`. First extend the module mock at the top of the file — add `resetPasswordForEmail` to the existing `auth` object:

```ts
      resetPasswordForEmail: jest.fn(),
```

Then append these tests:

```ts
import { GENERIC_AUTH_ERROR } from "@/lib/authError";

// The store is the boundary. A raw Supabase message reaching a caller means
// some screen, some day, renders it.
test("a failed sign-in reports a sentence, not Supabase's message", async () => {
  (supabase.auth.signInWithPassword as jest.Mock)
    .mockResolvedValueOnce({ data: { session: null }, error: { message: "Invalid login credentials" } });
  const err = await useSession.getState().signIn("a@b.com", "bad");
  expect(err).toBe("That email and password don't match. Check the password, or reset it below.");
});

test("an unrecognised failure is still a sentence", async () => {
  (supabase.auth.signInWithPassword as jest.Mock)
    .mockResolvedValueOnce({ data: { session: null }, error: { message: "PGRST301 JWSInvalidSignature" } });
  expect(await useSession.getState().signIn("a@b.com", "x")).toBe(GENERIC_AUTH_ERROR);
});

// Without this, an account with a mistyped password has no way back in.
test("sendPasswordReset asks Supabase for a link back into the app", async () => {
  (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValueOnce({ error: null });
  expect(await useSession.getState().sendPasswordReset("  A@B.com ")).toBeNull();
  expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
    "a@b.com",
    { redirectTo: "routeready://auth-callback" }
  );
});

test("sendPasswordReset reports a failure as a sentence", async () => {
  (supabase.auth.resetPasswordForEmail as jest.Mock)
    .mockResolvedValueOnce({ error: { message: "Email rate limit exceeded" } });
  expect(await useSession.getState().sendPasswordReset("a@b.com"))
    .toBe("Too many emails just now. Wait a minute, then try again.");
});
```

**Also update the existing test** at `sessionStore.test.ts:24-31` (`signIn returns null on success, message on failure`) — its second assertion expects the raw `"Invalid login credentials"` and must now expect the mapped sentence. That is the behaviour change, not a broken test.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/stores/__tests__/sessionStore.test.ts`
Expected: FAIL — `sendPasswordReset is not a function`, plus the mapped-message assertions failing.

- [ ] **Step 3: Implement**

In `src/stores/sessionStore.ts`, add the import:

```ts
import { authErrorMessage } from "@/lib/authError";
```

Add to the `SessionState` type, after `sendMagicLink`:

```ts
  sendPasswordReset: (email: string) => Promise<string | null>;
```

Replace the `signIn` and `sendMagicLink` bodies, and add `sendPasswordReset` beneath them:

```ts
  // Every action returns something showable. The mapping lives here rather
  // than on each screen because forgetting it on a screen is silent: the raw
  // string renders and looks like a decision.
  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    return error ? authErrorMessage(error.message) : null;
  },
  sendMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: "routeready://auth-callback" },
    });
    return error ? authErrorMessage(error.message) : null;
  },
  /**
   * The way back into an account whose password was mistyped at sign-up.
   *
   * `resetPasswordForEmail` was never wired, which made a typo unrecoverable
   * in-app — the magic link was the only route back, and it is presented as a
   * convenience rather than a rescue.
   *
   * Same deep link as the magic link: the root layout already parses
   * `access_token`/`refresh_token` out of the fragment, and a recovery link
   * carries the same pair.
   */
  sendPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: "routeready://auth-callback",
    });
    return error ? authErrorMessage(error.message) : null;
  },
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/stores/__tests__/sessionStore.test.ts` — expect PASS.
Run: `npm test` — expect green. If another suite asserted a raw Supabase message, that is a real consumer of the old contract; report it before changing it.

- [ ] **Step 5: Commit**

```bash
git add src/stores/sessionStore.ts src/stores/__tests__/sessionStore.test.ts
git commit -m "feat: wire password reset and map auth errors at the store"
```

---

### Task 3: The credentials field

**Files:**
- Create: `src/ui/AuthField.tsx`
- Test: `src/ui/__tests__/authField.test.tsx`

**Interfaces:**
- Produces:
```ts
export function AuthField(props: {
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  kind?: "email" | "password" | "newPassword" | "name";
  returnKeyType?: "next" | "done" | "send";
  onSubmitEditing?: () => void;
  inputRef?: RefObject<TextInput | null>;
  testID?: string;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/authField.test.tsx`:

```tsx
import { createRef } from "react";
import { TextInput } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AuthField } from "../AuthField";

// iOS offers Keychain autofill and a generated strong password off these two
// attributes alone. Without them the screen looks finished and behaves like a
// web form from 2011, which is the single biggest tell in the whole flow.
test("an email field advertises itself to autofill", () => {
  render(<AuthField testID="f" placeholder="Email address" kind="email" value="" onChangeText={() => {}} />);
  const f = screen.getByTestId("f");
  expect(f.props.autoComplete).toBe("email");
  expect(f.props.textContentType).toBe("emailAddress");
  expect(f.props.keyboardType).toBe("email-address");
  expect(f.props.autoCapitalize).toBe("none");
});

// `password` asks the Keychain to fill an existing one; `newPassword` asks it
// to offer a generated one. Using the first on sign-up is why an app never
// gets offered a strong password.
test("an existing password and a new one ask autofill for different things", () => {
  const { rerender } = render(
    <AuthField testID="f" placeholder="Password" kind="password" value="" onChangeText={() => {}} />
  );
  expect(screen.getByTestId("f").props.textContentType).toBe("password");
  rerender(<AuthField testID="f" placeholder="Password" kind="newPassword" value="" onChangeText={() => {}} />);
  expect(screen.getByTestId("f").props.textContentType).toBe("newPassword");
});

test("a password is hidden until you ask to see it", () => {
  render(<AuthField testID="f" placeholder="Password" kind="password" value="secret" onChangeText={() => {}} />);
  expect(screen.getByTestId("f").props.secureTextEntry).toBe(true);
  fireEvent.press(screen.getByLabelText("Show password"));
  expect(screen.getByTestId("f").props.secureTextEntry).toBe(false);
  expect(screen.getByLabelText("Hide password")).toBeTruthy();
});

test("a non-password field has nothing to reveal", () => {
  render(<AuthField testID="f" placeholder="Email address" kind="email" value="" onChangeText={() => {}} />);
  expect(screen.queryByLabelText("Show password")).toBeNull();
});

// Return should move you on. On a four-field form, not chaining is four
// dismissals of the keyboard.
test("return runs the handler the caller gave it", () => {
  const onSubmitEditing = jest.fn();
  render(
    <AuthField testID="f" placeholder="Email address" kind="email" value=""
      onChangeText={() => {}} returnKeyType="next" onSubmitEditing={onSubmitEditing} />
  );
  expect(screen.getByTestId("f").props.returnKeyType).toBe("next");
  fireEvent(screen.getByTestId("f"), "submitEditing");
  expect(onSubmitEditing).toHaveBeenCalled();
});

test("the caller can hold a ref to focus it", () => {
  const ref = createRef<TextInput>();
  render(<AuthField testID="f" inputRef={ref} placeholder="Password" kind="password" value="" onChangeText={() => {}} />);
  expect(ref.current).not.toBeNull();
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/ui/__tests__/authField.test.tsx`
Expected: FAIL — cannot resolve `../AuthField`.

- [ ] **Step 3: Implement**

Create `src/ui/AuthField.tsx`:

```tsx
import { useState, type RefObject } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { colors } from "@/ui/theme";
import { body, footnote, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * One row of a credentials group.
 *
 * It exists for the four attributes rather than for the layout. `autoComplete`
 * and `textContentType` are what make iOS offer the Keychain on sign-in and a
 * generated password on sign-up, and they were on none of the fields — a
 * two-attribute omission that changes how the screen feels more than any
 * amount of restyling.
 *
 * `kind` rather than a pile of booleans: every field on both screens is one of
 * four things, and each of the four implies its keyboard, its capitalisation
 * and its autofill hint together. Setting them separately is how they drift
 * apart.
 */

const KIND = {
  email: {
    autoComplete: "email" as const,
    textContentType: "emailAddress" as const,
    keyboardType: "email-address" as const,
    autoCapitalize: "none" as const,
    secure: false,
  },
  password: {
    autoComplete: "current-password" as const,
    textContentType: "password" as const,
    keyboardType: "default" as const,
    autoCapitalize: "none" as const,
    secure: true,
  },
  newPassword: {
    autoComplete: "new-password" as const,
    textContentType: "newPassword" as const,
    keyboardType: "default" as const,
    autoCapitalize: "none" as const,
    secure: true,
  },
  name: {
    autoComplete: "given-name" as const,
    textContentType: "givenName" as const,
    keyboardType: "default" as const,
    autoCapitalize: "words" as const,
    secure: false,
  },
};

export function AuthField({
  placeholder, value, onChangeText, kind = "email",
  returnKeyType = "next", onSubmitEditing, inputRef, testID,
}: {
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  kind?: keyof typeof KIND;
  returnKeyType?: "next" | "done" | "send";
  onSubmitEditing?: () => void;
  inputRef?: RefObject<TextInput | null>;
  testID?: string;
}) {
  const spec = KIND[kind];
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={{ minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center" }}>
      <TextInput
        testID={testID}
        ref={inputRef}
        accessibilityLabel={placeholder}
        style={{ ...body, flex: 1, color: colors.label, padding: 0 }}
        maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
        placeholder={placeholder}
        placeholderTextColor={colors.labelTertiary}
        value={value}
        onChangeText={onChangeText}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        autoComplete={spec.autoComplete}
        textContentType={spec.textContentType}
        keyboardType={spec.keyboardType}
        autoCapitalize={spec.autoCapitalize}
        secureTextEntry={spec.secure && !revealed}
      />
      {spec.secure && (
        // Text rather than an eye glyph: two icons that differ by a slash are
        // read wrong at a glance, and the word is unambiguous at 13pt.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revealed ? "Hide password" : "Show password"}
          hitSlop={10}
          onPress={() => setRevealed((r) => !r)}
        >
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.accentPressed }}>
            {revealed ? "Hide" : "Show"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/ui/__tests__/authField.test.tsx` — expect PASS, six tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/AuthField.tsx src/ui/__tests__/authField.test.tsx
git commit -m "feat: add the credentials field with autofill and a reveal"
```

---

### Task 4: Re-dress sign-in

**Files:**
- Modify: `app/(auth)/sign-in.tsx` (full rewrite)
- Test: `src/ui/__tests__/signInScreen.test.tsx`

**Interfaces:**
- Consumes: `AuthField` (Task 3), `sessionStore.signIn`/`sendMagicLink` returning mapped sentences (Task 2), `Group` from `src/ui/List.tsx`, `enterFrom` from `src/ui/motion.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/signInScreen.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// Every screen test in this repo mocks expo-router — the real module wants a
// navigation context that a standalone render does not have. `Link` renders
// its children directly: with `asChild` that is the Pressable, and without it
// the string sits inside the Text it was already nested in.
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  Link: ({ children }: { children: unknown }) => children,
}));

// eslint-disable-next-line import/first
import SignIn from "../../../app/(auth)/sign-in";
// eslint-disable-next-line import/first
import { useSession } from "@/stores/sessionStore";

const signIn = jest.fn();
const sendMagicLink = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ signIn, sendMagicLink } as never);
});

const fill = () => {
  fireEvent.changeText(screen.getByLabelText("Email address"), "a@b.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter2");
};

test("the screen names itself and offers both ways in", () => {
  render(<SignIn />);
  expect(screen.getByText("Welcome back.")).toBeTruthy();
  expect(screen.getByText("Email me a sign-in link")).toBeTruthy();
  expect(screen.getByText("Forgot your password?")).toBeTruthy();
});

// The store maps the message; the screen must render what it was handed and
// invent nothing.
test("a failed sign-in shows the sentence the store returned", async () => {
  signIn.mockResolvedValue("That email and password don't match. Check the password, or reset it below.");
  render(<SignIn />);
  fill();
  fireEvent.press(screen.getByText("Sign in"));
  expect(await screen.findByText(/don't match/)).toBeTruthy();
  expect(screen.queryByText(/Invalid login credentials/)).toBeNull();
});

// Retrying should not require dismissing anything. A stale failure sitting
// under a field you have already corrected reads as a second failure.
test("typing again clears the failure", async () => {
  signIn.mockResolvedValue("That email and password don't match. Check the password, or reset it below.");
  render(<SignIn />);
  fill();
  fireEvent.press(screen.getByText("Sign in"));
  await screen.findByText(/don't match/);
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter3");
  expect(screen.queryByText(/don't match/)).toBeNull();
});

// Defect 8: `notice` was never cleared, so a magic-link success sat under a
// later failure.
test("a sign-in failure clears an earlier magic-link notice", async () => {
  sendMagicLink.mockResolvedValue(null);
  signIn.mockResolvedValue("That email and password don't match. Check the password, or reset it below.");
  render(<SignIn />);
  fill();
  fireEvent.press(screen.getByText("Email me a sign-in link"));
  await screen.findByText(/Check your email/);
  fireEvent.press(screen.getByText("Sign in"));
  await screen.findByText(/don't match/);
  expect(screen.queryByText(/Check your email/)).toBeNull();
});

test("the button reports itself busy and cannot be pressed twice", async () => {
  let release: (v: string | null) => void = () => {};
  signIn.mockReturnValue(new Promise((r) => { release = r; }));
  render(<SignIn />);
  fill();
  fireEvent.press(screen.getByText("Sign in"));
  expect(await screen.findByText("Signing in…")).toBeTruthy();
  fireEvent.press(screen.getByText("Signing in…"));
  expect(signIn).toHaveBeenCalledTimes(1);
  await act(async () => { release(null); });
});

// Nothing should be submittable that cannot succeed.
test("the action waits for something worth submitting", async () => {
  render(<SignIn />);
  fireEvent.press(screen.getByText("Sign in"));
  await waitFor(() => expect(signIn).not.toHaveBeenCalled());
  fill();
  fireEvent.press(screen.getByText("Sign in"));
  await waitFor(() => expect(signIn).toHaveBeenCalledWith("a@b.com", "hunter2hunter2"));
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/ui/__tests__/signInScreen.test.tsx`
Expected: FAIL — `Welcome back.` not found; the old screen renders its own markup.

- [ ] **Step 3: Implement**

Replace `app/(auth)/sign-in.tsx` entirely:

```tsx
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AuthField } from "@/ui/AuthField";
import { Group } from "@/ui/List";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { body, largeTitle, footnote, headline, subheadline, title2, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

/**
 * The first screen of the app, and therefore its first statement about what
 * kind of app it is.
 *
 * It is built from the same `Group` as Home so that the list language is
 * already familiar by the time the tabs appear. No shadow, no card: the group
 * separates from the field by being lighter than it.
 *
 * Failure is quiet. The group's outline turns danger, the reason arrives
 * beneath it, and the phone taps once — `motion.ts` does not oscillate, so
 * nothing shakes. The haptic carries what a shake would have.
 */
export default function SignIn() {
  const signIn = useSession((s) => s.signIn);
  const sendMagicLink = useSession((s) => s.sendMagicLink);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const canSubmit = email.includes("@") && password.length > 0 && !busy;

  // Both messages clear together, always. Leaving one behind is how a success
  // ends up sitting under a failure.
  const edit = (set: (v: string) => void) => (v: string) => {
    if (error || notice) { setError(null); setNotice(null); }
    set(v);
  };

  const attempt = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const err = await signIn(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      // The half of a failure a screenshot cannot show.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const magicLink = async () => {
    if (!email.includes("@") || busy) return;
    setError(null);
    setNotice(null);
    const err = await sendMagicLink(email.trim());
    if (err) { setError(err); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
    else setNotice("Check your email — the link works for an hour, on this phone.");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.field }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // `padding` is wrong on Android and puts the keyboard over the button.
        behavior={Platform.select({ ios: "padding", android: "height" })}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 32 }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={enterFrom(0)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 26 }}>
            <View style={{ height: 52, width: 52, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="car-sport" size={28} color="#FFFFFF" />
            </View>
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...title2, color: colors.label }}>RouteReady</Text>
          </Animated.View>

          <Animated.View entering={enterFrom(1)}>
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...largeTitle, color: colors.label, paddingHorizontal: 16, paddingBottom: 22 }}>
              Welcome back.
            </Text>
          </Animated.View>

          <Animated.View entering={enterFrom(2)}>
            <Group style={error ? { borderWidth: 1.5, borderColor: colors.danger } : undefined}>
              <AuthField
                testID="email" placeholder="Email address" kind="email"
                value={email} onChangeText={edit(setEmail)}
                returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <AuthField
                testID="password" placeholder="Password" kind="password" inputRef={passwordRef}
                value={password} onChangeText={edit(setPassword)}
                returnKeyType="done" onSubmitEditing={attempt}
              />
            </Group>
          </Animated.View>

          {error && (
            <Animated.Text
              entering={enterFrom(0)}
              maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
              style={{ ...footnote, color: colors.danger, paddingHorizontal: 20, paddingTop: 10 }}
            >
              {error}
            </Animated.Text>
          )}
          {notice && (
            <Animated.Text
              entering={enterFrom(0)}
              maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
              style={{ ...footnote, color: colors.accentPressed, paddingHorizontal: 20, paddingTop: 10 }}
            >
              {notice}
            </Animated.Text>
          )}

          <Animated.View entering={enterFrom(3)} style={{ paddingTop: 14 }}>
            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={attempt}
              style={{
                marginHorizontal: 16, minHeight: 50, borderRadius: 12, backgroundColor: colors.accent,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,
                opacity: canSubmit ? 1 : 0.35,
              }}
            >
              {busy && <ActivityIndicator color="#FFFFFF" />}
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: "#FFFFFF" }}>
                {busy ? "Signing in…" : "Sign in"}
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={enterFrom(4)}>
            <Pressable accessibilityRole="button" onPress={magicLink} style={{ minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...body, color: colors.accentPressed }}>
                Email me a sign-in link
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={enterFrom(5)}>
            <Link href="/(auth)/reset" asChild>
              <Pressable accessibilityRole="button" style={{ minHeight: 40, alignItems: "center", justifyContent: "center" }}>
                <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary }}>
                  Forgot your password?
                </Text>
              </Pressable>
            </Link>
          </Animated.View>

          <Animated.View entering={enterFrom(6)} style={{ paddingTop: 26, alignItems: "center" }}>
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary }}>
              New here?{" "}
              <Link href="/(auth)/sign-up" style={{ color: colors.accentPressed, fontWeight: "600" }}>
                Create an account
              </Link>
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/ui/__tests__/signInScreen.test.tsx` — expect PASS, six tests.

Note: the `Forgot your password?` link points at `/(auth)/reset`, which does not exist until Task 5. Under test that renders fine; **do not run the app between this task and the next** — the link will throw.

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/sign-in.tsx" src/ui/__tests__/signInScreen.test.tsx
git commit -m "feat: re-dress sign-in on the grouped list, with a quiet failure"
```

---

### Task 5: The reset screen

**Files:**
- Create: `app/(auth)/reset.tsx`
- Test: `src/ui/__tests__/resetScreen.test.tsx`

**Interfaces:**
- Consumes: `sendPasswordReset` (Task 2), `AuthField` (Task 3).

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/resetScreen.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

// eslint-disable-next-line import/first
import Reset from "../../../app/(auth)/reset";
// eslint-disable-next-line import/first
import { useSession } from "@/stores/sessionStore";

const sendPasswordReset = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ sendPasswordReset } as never);
});

test("it asks for the address and nothing else", () => {
  render(<Reset />);
  expect(screen.getByText("Reset your password.")).toBeTruthy();
  expect(screen.getByLabelText("Email address")).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
});

test("sending swaps the form for a confirmation", async () => {
  sendPasswordReset.mockResolvedValue(null);
  render(<Reset />);
  fireEvent.changeText(screen.getByLabelText("Email address"), "a@b.com");
  fireEvent.press(screen.getByText("Send reset link"));
  expect(await screen.findByText("Reset link sent")).toBeTruthy();
  await waitFor(() => expect(sendPasswordReset).toHaveBeenCalledWith("a@b.com"));
  expect(screen.queryByLabelText("Email address")).toBeNull();
});

// A confirmation that appears under a still-filled form reads as an error.
// The form must be gone, not merely annotated.
test("a failure keeps the form and states the reason", async () => {
  sendPasswordReset.mockResolvedValue("Too many emails just now. Wait a minute, then try again.");
  render(<Reset />);
  fireEvent.changeText(screen.getByLabelText("Email address"), "a@b.com");
  fireEvent.press(screen.getByText("Send reset link"));
  expect(await screen.findByText(/Too many emails/)).toBeTruthy();
  expect(screen.getByLabelText("Email address")).toBeTruthy();
});

test("the action waits for something that could be an address", async () => {
  render(<Reset />);
  fireEvent.press(screen.getByText("Send reset link"));
  await waitFor(() => expect(sendPasswordReset).not.toHaveBeenCalled());
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/ui/__tests__/resetScreen.test.tsx`
Expected: FAIL — cannot resolve `app/(auth)/reset`.

- [ ] **Step 3: Implement**

Create `app/(auth)/reset.tsx`:

```tsx
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AuthField } from "@/ui/AuthField";
import { Group } from "@/ui/List";
import { enterFrom, popIn } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { footnote, headline, largeTitle, subheadline, title2, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

/**
 * The way back into an account whose password was mistyped.
 *
 * On success the form is replaced rather than annotated. A confirmation
 * sitting under a still-filled form is the shape of an error message, and the
 * old sign-up screen read exactly that way.
 */
export default function Reset() {
  const router = useRouter();
  const sendPasswordReset = useSession((s) => s.sendPasswordReset);

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const canSubmit = email.includes("@") && !busy;

  const send = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const err = await sendPasswordReset(email.trim());
    setBusy(false);
    if (err) { setError(err); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
    else setSent(true);
  };

  if (sent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.field, alignItems: "center", justifyContent: "center" }}>
        <Animated.View entering={popIn()} style={{ height: 64, width: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="checkmark" size={34} color="#FFFFFF" />
        </Animated.View>
        <Animated.Text entering={enterFrom(1)} maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...title2, color: colors.label, paddingTop: 22 }}>
          Reset link sent
        </Animated.Text>
        <Animated.Text entering={enterFrom(2)} maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary, textAlign: "center", paddingHorizontal: 30, paddingTop: 8 }}>
          Open it on this phone and you'll come straight back here to set a new one.
        </Animated.Text>
        <Animated.View entering={enterFrom(3)} style={{ paddingTop: 26 }}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: 44, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" }}>
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: colors.accentPressed }}>Back to sign in</Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.field }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: "padding", android: "height" })}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => router.back()} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingLeft: 12, paddingRight: 20 }}>
            <Ionicons name="chevron-back" size={22} color={colors.accentPressed} />
          </Pressable>

          <Animated.Text entering={enterFrom(1)} maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...largeTitle, color: colors.label, paddingHorizontal: 16, paddingTop: 4 }}>
            Reset your password.
          </Animated.Text>
          <Animated.Text entering={enterFrom(2)} maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 }}>
            We'll email you a link to set a new one. The old one keeps working until you do.
          </Animated.Text>

          <Animated.View entering={enterFrom(3)}>
            <Group style={error ? { borderWidth: 1.5, borderColor: colors.danger } : undefined}>
              <AuthField
                testID="reset-email" placeholder="Email address" kind="email"
                value={email} onChangeText={(v) => { if (error) setError(null); setEmail(v); }}
                returnKeyType="send" onSubmitEditing={send}
              />
            </Group>
          </Animated.View>

          {error && (
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.danger, paddingHorizontal: 20, paddingTop: 10 }}>
              {error}
            </Text>
          )}

          <Animated.View entering={enterFrom(4)} style={{ paddingTop: 18 }}>
            <Pressable
              accessibilityRole="button" disabled={!canSubmit} onPress={send}
              style={{ marginHorizontal: 16, minHeight: 50, borderRadius: 12, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, opacity: canSubmit ? 1 : 0.35 }}
            >
              {busy && <ActivityIndicator color="#FFFFFF" />}
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: "#FFFFFF" }}>
                {busy ? "Sending…" : "Send reset link"}
              </Text>
            </Pressable>
          </Animated.View>
          <View style={{ flex: 1 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Run everything**

Run: `npx jest src/ui/__tests__/resetScreen.test.tsx` — expect PASS, four tests.
Run: `npm test` — expect green.
Run: `npm run lint` — expect 0 errors and no new warnings in touched files.

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/reset.tsx" src/ui/__tests__/resetScreen.test.tsx
git commit -m "feat: add the password reset screen"
```

**Half one is complete and shippable here.** Sign-in is re-dressed, errors are written for people, autofill works, the Android keyboard behaves, and a forgotten password is recoverable for the first time. Stop and run the app before starting half two.

---

# HALF TWO — The sign-up interview

### Task 6: Decision gate — can we pick a date in Expo Go?

**Files:** `package.json` (only if the answer is yes)

This is a **verification task with a decision at the end**, not a TDD cycle. It comes first because its answer changes what card 2 is, and discovering it later means rebuilding the card.

- [ ] **Step 1: Install the picker**

```bash
npx expo install @react-native-community/datetimepicker
```

- [ ] **Step 2: Render it in the running app**

Start the app (`npm start`) and temporarily mount, anywhere reachable:

```tsx
import DateTimePicker from "@react-native-community/datetimepicker";
<DateTimePicker
  value={new Date()}
  mode="date"
  display={Platform.OS === "ios" ? "inline" : "default"}
  minimumDate={new Date()}
  onChange={(_e, d) => console.log("picked", d)}
/>
```

- [ ] **Step 3: Decide, and record the decision**

| Outcome | Card 2 becomes | Metadata key |
|---|---|---|
| The picker renders and returns a date | `Yes, it's booked` reveals the inline picker | `test_date: "yyyy-mm-dd" \| null` |
| It throws, or needs a dev build | Four choices: `In the next two weeks` / `This month` / `Next month or later` / `Not booked` | `test_window: "fortnight" \| "month" \| "later" \| null` |

**Do not silently ship the fallback.** It is the worse answer and the difference is a decision. Report which branch you are on before continuing, and if it is the fallback, say so in the commit message and adjust Tasks 8 and 13 accordingly — everything else in this plan is unaffected.

- [ ] **Step 4: Remove the temporary mount, then commit**

Only if the picker works:

```bash
git add package.json package-lock.json
git commit -m "chore: add the date picker for the test-date card"
```

The remaining tasks are written for the **picker branch**. On the fallback branch, `testDate: string | null` becomes `testWindow: Window | null` and card 2 becomes a fourth `ChoiceRow` list — no other change.

---

### Task 7: Password strength

**Files:**
- Create: `src/lib/passwordStrength.ts`
- Test: `src/lib/__tests__/passwordStrength.test.ts`

**Interfaces:**
- Produces:
```ts
export type Level = "empty" | "short" | "weak" | "fair" | "good" | "strong";
export type Strength = { level: Level; segments: 0 | 1 | 2 | 3 | 4; message: string };
export const MIN_PASSWORD = 8;
export function passwordStrength(password: string): Strength;
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/passwordStrength.test.ts`:

```ts
import { MIN_PASSWORD, passwordStrength } from "../passwordStrength";

test("nothing typed states the rule rather than judging it", () => {
  expect(passwordStrength("")).toEqual({ level: "empty", segments: 0, message: "At least 8 characters" });
});

// The boundary is the only number that gates anything, so it is asserted from
// both sides.
test("the floor is eight characters", () => {
  expect(MIN_PASSWORD).toBe(8);
  expect(passwordStrength("abcdefg").level).toBe("short");
  expect(passwordStrength("abcdefgh").level).toBe("weak");
});

test("a short password counts down rather than scolding", () => {
  expect(passwordStrength("abcde").message).toBe("3 more characters");
  expect(passwordStrength("abcdefg").message).toBe("1 more character");
});

// Four points, one for each thing worth having, each earned independently.
test("each point is earned on its own", () => {
  expect(passwordStrength("abcdefgh").segments).toBe(1);        // length only
  expect(passwordStrength("abcdefgH").segments).toBe(2);        // + mixed case
  expect(passwordStrength("abcdefg1").segments).toBe(2);        // + digit
  expect(passwordStrength("abcdefg!").segments).toBe(2);        // + symbol
  expect(passwordStrength("abcdefgH1").segments).toBe(3);       // case + digit
  expect(passwordStrength("abcdefghijkH1!").segments).toBe(4);  // all four
});

test("the levels follow the segments", () => {
  expect(passwordStrength("abcdefgh").level).toBe("weak");
  expect(passwordStrength("abcdefgH").level).toBe("fair");
  expect(passwordStrength("abcdefgH1").level).toBe("good");
  expect(passwordStrength("abcdefghijkH1!").level).toBe("strong");
});

// The documented reason the meter does not gate: the password everyone
// reaches for to beat a meter scores full marks and is on every breach list
// there is. A meter that blocks is a meter people defeat.
test("Password1! scores full marks, which is exactly why the bar is advisory", () => {
  expect(passwordStrength("Password1!").segments).toBe(4);
});

// A long passphrase is a good password and must not be told to add a symbol.
test("a long passphrase is not punished for having no symbol", () => {
  const s = passwordStrength("correct horse battery staple");
  expect(s.segments).toBeGreaterThanOrEqual(3);
  expect(s.level).not.toBe("weak");
});

test("only the levels below fair carry advice", () => {
  expect(passwordStrength("abcdefgh").message).toBe("Weak — add a capital or a number");
  expect(passwordStrength("abcdefgH").message).toBe("Fair");
  expect(passwordStrength("abcdefgH1").message).toBe("Good");
  expect(passwordStrength("abcdefghijkH1!").message).toBe("Strong");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/lib/__tests__/passwordStrength.test.ts`
Expected: FAIL — cannot resolve `../passwordStrength`.

- [ ] **Step 3: Implement**

Create `src/lib/passwordStrength.ts`:

```ts
/**
 * How good a password is, as a function of the string and nothing else.
 *
 * Eight characters is the floor Supabase enforces and the only thing that
 * gates the button. Everything above it is advice, deliberately: a meter that
 * refuses to let you continue is a meter people defeat, and what they defeat
 * it with is `Password1!` — which scores four segments here and is on every
 * breach list there is. The bar informs; it does not police. There is a test
 * asserting exactly that, so the behaviour cannot be tightened by accident.
 *
 * The four points are independent, which is what keeps a long passphrase from
 * being told to add a symbol.
 */

export type Level = "empty" | "short" | "weak" | "fair" | "good" | "strong";
export type Strength = { level: Level; segments: 0 | 1 | 2 | 3 | 4; message: string };

export const MIN_PASSWORD = 8;

const MESSAGE: Record<Exclude<Level, "empty" | "short">, string> = {
  weak: "Weak — add a capital or a number",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

export function passwordStrength(password: string): Strength {
  if (password.length === 0) {
    return { level: "empty", segments: 0, message: `At least ${MIN_PASSWORD} characters` };
  }

  if (password.length < MIN_PASSWORD) {
    const left = MIN_PASSWORD - password.length;
    return { level: "short", segments: 0, message: `${left} more character${left === 1 ? "" : "s"}` };
  }

  let points = 0;
  if (password.length >= 12) points += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1;
  if (/\d/.test(password)) points += 1;
  if (/[^A-Za-z0-9]/.test(password)) points += 1;

  // CORRECTED DURING EXECUTION. This was `Math.max(1, points)` with the level
  // derived from `points`, which made the first earned point invisible: the
  // meter says "add a capital", you add one, and nothing moves. Clearing the
  // floor is itself the first segment, so the bar shows `1 + points`.
  const segments = Math.min(4, 1 + points) as 1 | 2 | 3 | 4;
  const level = ({ 1: "weak", 2: "fair", 3: "good", 4: "strong" } as const)[segments];
  return { level, segments, message: MESSAGE[level] };
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/lib/__tests__/passwordStrength.test.ts` — expect PASS, eight tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/passwordStrength.ts src/lib/__tests__/passwordStrength.test.ts
git commit -m "feat: score password strength as a pure function"
```

---

### Task 8: The questions, as data

**Files:**
- Create: `src/lib/onboarding.ts`
- Test: `src/lib/__tests__/onboarding.test.ts`

**Interfaces:**
- Produces:
```ts
export type Focus = "roundabout" | "junction" | "narrow" | "zebra";
export type Experience = "starting" | "progressing" | "ready";
export type Answers = {
  centreId: string | null;
  booked: boolean | null;
  testDate: string | null;
  experience: Experience | null;
  focus: Focus[];
};
export const EMPTY_ANSWERS: Answers;
export const TOTAL_STEPS = 5;
export const MAX_FOCUS = 2;
export const EXPERIENCE_OPTIONS: readonly { id: Experience; label: string; sub: string }[];
export const FOCUS_OPTIONS: readonly { id: Focus; label: string; sub: string }[];
export function canAdvance(step: number, a: Answers): boolean;
export function toggleFocus(focus: Focus[], id: Focus): Focus[];
export function toMetadata(a: Answers, name: string): Record<string, unknown>;
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/onboarding.test.ts`:

```ts
import {
  canAdvance, EMPTY_ANSWERS, EXPERIENCE_OPTIONS, FOCUS_OPTIONS,
  MAX_FOCUS, TOTAL_STEPS, toggleFocus, toMetadata, type Answers,
} from "../onboarding";

const filled: Answers = {
  centreId: "c-1", booked: true, testDate: "2026-09-24",
  experience: "progressing", focus: ["roundabout"],
};

// The four options are exactly hazards.type. An option the data cannot sort
// by is a question that does nothing, and the first draft of this card had
// two of them.
test("the weak-spot options are exactly the hazard types the schema stores", () => {
  expect(FOCUS_OPTIONS.map((o) => o.id).sort())
    .toEqual(["junction", "narrow", "roundabout", "zebra"]);
});

test("the flow is five cards and the experience card offers three", () => {
  expect(TOTAL_STEPS).toBe(5);
  expect(EXPERIENCE_OPTIONS).toHaveLength(3);
});

test("no card can be left until it has been answered", () => {
  expect(canAdvance(0, EMPTY_ANSWERS)).toBe(false);
  expect(canAdvance(0, { ...EMPTY_ANSWERS, centreId: "c-1" })).toBe(true);
  expect(canAdvance(2, EMPTY_ANSWERS)).toBe(false);
  expect(canAdvance(2, { ...EMPTY_ANSWERS, experience: "ready" })).toBe(true);
  expect(canAdvance(3, EMPTY_ANSWERS)).toBe(false);
  expect(canAdvance(3, { ...EMPTY_ANSWERS, focus: ["zebra"] })).toBe(true);
});

// "Booked" without a date is a half-answer: the countdown it exists to feed
// cannot be built from it.
test("saying the test is booked requires saying when", () => {
  expect(canAdvance(1, { ...EMPTY_ANSWERS, booked: true })).toBe(false);
  expect(canAdvance(1, { ...EMPTY_ANSWERS, booked: true, testDate: "2026-09-24" })).toBe(true);
  expect(canAdvance(1, { ...EMPTY_ANSWERS, booked: false })).toBe(true);
});

test("a third weak spot replaces the oldest rather than being refused", () => {
  expect(MAX_FOCUS).toBe(2);
  expect(toggleFocus([], "zebra")).toEqual(["zebra"]);
  expect(toggleFocus(["zebra"], "narrow")).toEqual(["zebra", "narrow"]);
  expect(toggleFocus(["zebra", "narrow"], "junction")).toEqual(["narrow", "junction"]);
});

test("tapping a chosen weak spot takes it off", () => {
  expect(toggleFocus(["zebra", "narrow"], "zebra")).toEqual(["narrow"]);
});

test("toggleFocus does not mutate what it was given", () => {
  const before: ["zebra"] = ["zebra"];
  toggleFocus(before, "narrow");
  expect(before).toEqual(["zebra"]);
});

test("the metadata carries every answer under its stored name", () => {
  expect(toMetadata(filled, "Sumeet")).toEqual({
    full_name: "Sumeet",
    home_centre_id: "c-1",
    test_date: "2026-09-24",
    experience: "progressing",
    focus: ["roundabout"],
  });
});

// An account with no name is greeted by the hour instead. Writing "" would
// make it a name that happens to be empty, which reads differently to every
// consumer that checks for presence.
test("a blank name is omitted rather than stored empty", () => {
  expect(toMetadata(filled, "   ")).not.toHaveProperty("full_name");
});

test("not booked stores an explicit null, not a missing key", () => {
  const m = toMetadata({ ...filled, booked: false, testDate: null }, "Sumeet");
  expect(m).toHaveProperty("test_date", null);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/lib/__tests__/onboarding.test.ts`
Expected: FAIL — cannot resolve `../onboarding`.

- [ ] **Step 3: Implement**

Create `src/lib/onboarding.ts`:

```ts
import type { Hazard } from "@/types/db";

/**
 * The sign-up interview, as data rather than as five screens.
 *
 * Keeping the questions here is what makes the copy, the order and the gating
 * testable without rendering anything, and it is why a fifth question later
 * costs one array entry instead of one screen.
 *
 * The questions come before the account exists, which is not a style choice:
 * Supabase email confirmation is on, so `signUp()` returns no session. There
 * is nobody to write a profile to until the learner confirms and comes back in
 * a later session, so anything asked "after the account" would have to survive
 * that round trip on disk. Asking first removes the problem instead.
 */

/**
 * Exactly the values `hazards.type` holds — the type is borrowed from `Hazard`
 * rather than restated, so a new hazard in the schema surfaces here as a type
 * error rather than as a question nobody can answer.
 *
 * The first draft of this card also offered parallel parking, bay parking,
 * dual carriageways and reversing. `manoeuvres` has no route relation and
 * there is no dual-carriageway marker anywhere, so four of the six were
 * questions the app could not act on.
 */
export type Focus = Hazard["type"];
export type Experience = "starting" | "progressing" | "ready";

export type Answers = {
  centreId: string | null;
  booked: boolean | null;
  testDate: string | null;
  experience: Experience | null;
  focus: Focus[];
};

export const EMPTY_ANSWERS: Answers = {
  centreId: null, booked: null, testDate: null, experience: null, focus: [],
};

export const TOTAL_STEPS = 5;
export const MAX_FOCUS = 2;

export const EXPERIENCE_OPTIONS = [
  { id: "starting", label: "Just starting out", sub: "A handful of lessons so far" },
  { id: "progressing", label: "Getting there", sub: "I can drive most roads on my own" },
  { id: "ready", label: "Nearly test-ready", sub: "Polishing the details" },
] as const satisfies readonly { id: Experience; label: string; sub: string }[];

export const FOCUS_OPTIONS = [
  { id: "roundabout", label: "Roundabouts", sub: "Mini, multi-lane and spiral" },
  { id: "junction", label: "Junctions and priority", sub: "Emerging, and who goes first" },
  { id: "narrow", label: "Narrow roads", sub: "Meeting traffic, parked cars" },
  { id: "zebra", label: "Pedestrian crossings", sub: "Zebras and schools" },
] as const satisfies readonly { id: Focus; label: string; sub: string }[];

/** Whether card `step` has been answered well enough to leave. */
export function canAdvance(step: number, a: Answers): boolean {
  switch (step) {
    case 0: return a.centreId !== null;
    // "Booked" with no date cannot feed the countdown the question exists for.
    case 1: return a.booked === false || (a.booked === true && a.testDate !== null);
    case 2: return a.experience !== null;
    case 3: return a.focus.length > 0;
    default: return false; // Card 5 is gated by the credentials, not by this.
  }
}

/**
 * A third choice pushes the oldest off rather than being refused. Refusing is
 * a dead tap with no explanation attached to it; swapping is what the user
 * meant.
 */
export function toggleFocus(focus: readonly Focus[], id: Focus): Focus[] {
  if (focus.includes(id)) return focus.filter((f) => f !== id);
  const next = [...focus, id];
  return next.slice(Math.max(0, next.length - MAX_FOCUS));
}

/**
 * What rides along on `signUp()`.
 *
 * A blank name is omitted rather than written as "": an empty string is a name
 * that happens to be empty, and every consumer checking for presence would
 * read it as one. `selectFullName` already narrows for the accounts that
 * predate this.
 */
export function toMetadata(a: Answers, name: string): Record<string, unknown> {
  const trimmed = name.trim();
  return {
    ...(trimmed ? { full_name: trimmed } : {}),
    home_centre_id: a.centreId,
    test_date: a.testDate,
    experience: a.experience,
    focus: a.focus,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/lib/__tests__/onboarding.test.ts` — expect PASS, ten tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding.ts src/lib/__tests__/onboarding.test.ts
git commit -m "feat: define the sign-up questions as data"
```

---

### Task 9: Step transitions in the motion module

**Files:**
- Modify: `src/ui/motion.ts`
- Test: `src/ui/__tests__/motion.test.ts`

**Interfaces:**
- Produces: `STEP_EXIT_MS`, `STEP_TRAVEL`, `stepForward()`, `stepBack()`, `stepExit(back?: boolean)`.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/__tests__/motion.test.ts`:

```ts
import { STEP_EXIT_MS, STEP_TRAVEL, stepBack, stepExit, stepForward } from "../motion";

test("a card leaves faster than the next one arrives", () => {
  expect(STEP_EXIT_MS).toBe(180);
  expect(STEP_TRAVEL).toBe(14);
  expect(STEP_EXIT_MS).toBeLessThan(ENTER_MS);
});

// Back must read as back. Same distance, opposite sign — if both directions
// entered from the same edge, the flow would feel one-way whichever button
// you pressed.
test("forward and back enter from opposite edges", () => {
  const fwd = stepForward().initialValues as { transform?: { translateX: number }[] };
  const back = stepBack().initialValues as { transform?: { translateX: number }[] };
  expect(fwd.transform?.[0].translateX).toBe(STEP_TRAVEL);
  expect(back.transform?.[0].translateX).toBe(-STEP_TRAVEL);
});

test.each([
  ["stepForward", stepForward()],
  ["stepBack", stepBack()],
  ["stepExit forward", stepExit(false)],
  ["stepExit back", stepExit(true)],
])("%s is a timing curve with no spring in it", (_name, builder) => {
  const b = builder as unknown as Record<string, unknown>;
  expect(b.durationV).toBeDefined();
  expect(b.easingV).toBeDefined();
  expect(b.dampingV).toBeUndefined();
  expect(b.stiffnessV).toBeUndefined();
  expect(b.type).not.toBe("spring");
});

test("an exiting card takes the exit duration", () => {
  expect((stepExit(false) as unknown as Record<string, unknown>).durationV).toBe(STEP_EXIT_MS);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/ui/__tests__/motion.test.ts`
Expected: FAIL — `stepForward is not a function`.

- [ ] **Step 3: Implement**

In `src/ui/motion.ts`, extend the import on line 1:

```ts
import {
  Easing, FadeInDown, FadeInLeft, FadeInRight, FadeOutLeft, FadeOutRight,
  ZoomIn, withSequence, withTiming,
} from "react-native-reanimated";
```

Append to the end of the file:

```ts
/**
 * A card leaves faster than the next one arrives — the gap is what stops the
 * two reading as one smear. Same decelerating cubic; still nothing that
 * overshoots.
 */
export const STEP_EXIT_MS = 180;

/** Slightly further than a list item travels, because a whole card is moving. */
export const STEP_TRAVEL = 14;

/** The next card in a sequence: in from the trailing edge. */
export function stepForward() {
  return FadeInRight
    .duration(ENTER_MS)
    .easing(DECELERATE)
    .withInitialValues({ transform: [{ translateX: STEP_TRAVEL }] });
}

/**
 * The previous card: in from the leading edge.
 *
 * The mirror is the whole point. If both directions entered from the same
 * side, the flow would feel one-way whichever button was pressed, and Back
 * would read as another step forward.
 */
export function stepBack() {
  return FadeInLeft
    .duration(ENTER_MS)
    .easing(DECELERATE)
    .withInitialValues({ transform: [{ translateX: -STEP_TRAVEL }] });
}

/** The card being replaced, leaving in the direction of travel. */
export function stepExit(back = false) {
  return (back ? FadeOutRight : FadeOutLeft).duration(STEP_EXIT_MS).easing(DECELERATE);
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/ui/__tests__/motion.test.ts` — expect PASS, all tests including the five existing ones untouched.

- [ ] **Step 5: Commit**

```bash
git add src/ui/motion.ts src/ui/__tests__/motion.test.ts
git commit -m "feat: add mirrored step transitions to the motion module"
```

---

### Task 10: The strength meter

**Files:**
- Create: `src/ui/StrengthMeter.tsx`
- Test: `src/ui/__tests__/strengthMeter.test.tsx`

**Interfaces:**
- Consumes: `Strength` from Task 7.
- Produces: `<StrengthMeter strength={Strength} />`

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/strengthMeter.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { StrengthMeter } from "../StrengthMeter";
import { passwordStrength } from "@/lib/passwordStrength";
import { colors } from "../theme";

const flat = (style: unknown) =>
  Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : (style as object);

test("there are always four segments, however few are earned", () => {
  render(<StrengthMeter strength={passwordStrength("abcdefgh")} />);
  expect(screen.getAllByTestId(/^strength-segment-/)).toHaveLength(4);
});

test("it states the level in words as well as in bars", () => {
  render(<StrengthMeter strength={passwordStrength("abcdefghijkH1!")} />);
  expect(screen.getByText("Strong")).toBeTruthy();
});

test("a short password counts down instead of being scored", () => {
  render(<StrengthMeter strength={passwordStrength("abc")} />);
  expect(screen.getByText("5 more characters")).toBeTruthy();
});

// No new colours enter the palette: danger, warning and accent are the app's
// existing three, used the way DriveModeRow already uses them.
test("the colour is the app's own vocabulary, by level", () => {
  const { rerender } = render(<StrengthMeter strength={passwordStrength("abc")} />);
  expect(flat(screen.getByTestId("strength-label").props.style).color).toBe(colors.danger);
  rerender(<StrengthMeter strength={passwordStrength("abcdefgh")} />);
  expect(flat(screen.getByTestId("strength-label").props.style).color).toBe(colors.warning);
  rerender(<StrengthMeter strength={passwordStrength("abcdefghijkH1!")} />);
  expect(flat(screen.getByTestId("strength-label").props.style).color).toBe(colors.accent);
});

test("an empty field states the rule in the quiet role", () => {
  render(<StrengthMeter strength={passwordStrength("")} />);
  expect(screen.getByText("At least 8 characters")).toBeTruthy();
  expect(flat(screen.getByTestId("strength-label").props.style).color).toBe(colors.labelTertiary);
});

// The bar is advice, not a gate — a screen reader user should hear the advice
// without having to infer it from four unlabelled bars.
test("the meter reports itself to a screen reader", () => {
  render(<StrengthMeter strength={passwordStrength("abcdefgh")} />);
  expect(screen.getByLabelText("Password strength: Weak — add a capital or a number")).toBeTruthy();
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/ui/__tests__/strengthMeter.test.tsx`
Expected: FAIL — cannot resolve `../StrengthMeter`.

- [ ] **Step 3: Implement**

Create `src/ui/StrengthMeter.tsx`:

```tsx
import { View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, withDelay, withTiming } from "react-native-reanimated";
import type { Level, Strength } from "@/lib/passwordStrength";
import { ENTER_MS, ENTER_STAGGER_MS, timing } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { caption, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * Four segments and a sentence.
 *
 * Four because there are four things worth having in a password, and each
 * segment is one of them earned. The colour is the app's existing danger /
 * warning / accent vocabulary, so the meter introduces no new meaning to the
 * palette — the same argument `DriveModeRow` makes for its washes.
 *
 * Purely presentational: it renders a `Strength` and neither computes one nor
 * decides anything. `passwordStrength` owns the scoring and is tested without
 * a screen.
 */

const COLOUR: Record<Level, string> = {
  empty: colors.labelTertiary,
  short: colors.danger,
  weak: colors.warning,
  fair: colors.warning,
  good: colors.accent,
  strong: colors.accent,
};

function Segment({ index, filled, colour }: { index: number; filled: boolean; colour: string }) {
  const reduced = useReducedMotion();

  // `withTiming` is imperative, so Reanimated's ReduceMotion.System default —
  // which covers the layout builders in motion.ts — does not reach it. Without
  // this check the one setting meant to calm the screen leaves the busiest
  // thing on it moving.
  const style = useAnimatedStyle(() => {
    const target = filled ? 1 : 0;
    return {
      transform: [{ scaleX: reduced ? target : withDelay(index * ENTER_STAGGER_MS, withTiming(target, timing(ENTER_MS))) }],
      backgroundColor: reduced ? colour : withTiming(colour, timing(ENTER_MS)),
    };
  }, [filled, colour, reduced, index]);

  return (
    <View
      testID={`strength-segment-${index}`}
      style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.fill, overflow: "hidden" }}
    >
      {/* `transformOrigin` needs RN 0.76+; this project is on 0.81. It is what
          makes the fill grow from the leading edge rather than from its own
          centre, which is the difference between filling and inflating. */}
      <Animated.View style={[{ height: "100%", width: "100%", borderRadius: 2, transformOrigin: "left" }, style]} />
    </View>
  );
}

export function StrengthMeter({ strength }: { strength: Strength }) {
  const colour = COLOUR[strength.level];

  return (
    <View
      accessible
      accessibilityLabel={`Password strength: ${strength.message}`}
      style={{ paddingHorizontal: 20, paddingTop: 10 }}
    >
      <View style={{ flexDirection: "row", gap: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <Segment key={i} index={i} filled={i < strength.segments} colour={colour} />
        ))}
      </View>
      <Animated.Text
        testID="strength-label"
        maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
        style={{ ...caption, color: colour, marginTop: 7, minHeight: 18 }}
      >
        {strength.message}
      </Animated.Text>
    </View>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/ui/__tests__/strengthMeter.test.tsx` — expect PASS, six tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/StrengthMeter.tsx src/ui/__tests__/strengthMeter.test.tsx
git commit -m "feat: add the animated password strength meter"
```

---

### Task 11: The question card and its rows

**Files:**
- Create: `src/ui/QuestionCard.tsx`
- Test: `src/ui/__tests__/questionCard.test.tsx`

**Interfaces:**
- Produces:
```ts
export function QuestionCard(props: { title: string; subtitle: string; children: ReactNode }): JSX.Element;
export function ChoiceRow(props: {
  label: string; sub?: string; selected: boolean; multi?: boolean;
  onPress: () => void; testID?: string;
}): JSX.Element;
```

Both live in one file because they change together and neither is useful alone.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/questionCard.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ChoiceRow, QuestionCard } from "../QuestionCard";

test("a card asks its question and explains why", () => {
  render(<QuestionCard title="Where are you testing?" subtitle="We'll open on that centre's routes." />);
  expect(screen.getByText("Where are you testing?")).toBeTruthy();
  expect(screen.getByText("We'll open on that centre's routes.")).toBeTruthy();
});

test("a row states its choice and any detail under it", () => {
  render(<ChoiceRow label="Roundabouts" sub="Mini, multi-lane and spiral" selected={false} onPress={() => {}} />);
  expect(screen.getByText("Roundabouts")).toBeTruthy();
  expect(screen.getByText("Mini, multi-lane and spiral")).toBeTruthy();
});

test("pressing a row reports it", () => {
  const onPress = jest.fn();
  render(<ChoiceRow testID="r" label="Roundabouts" selected={false} onPress={onPress} />);
  fireEvent.press(screen.getByTestId("r"));
  expect(onPress).toHaveBeenCalled();
});

// A radio and a checkbox are announced differently and behave differently to
// assistive tech. A multi-select that reports itself as a radio tells a screen
// reader user their first choice was replaced.
test("a row announces whether it is one-of or any-of", () => {
  const { rerender } = render(<ChoiceRow testID="r" label="Roundabouts" selected onPress={() => {}} />);
  expect(screen.getByTestId("r").props.accessibilityRole).toBe("radio");
  rerender(<ChoiceRow testID="r" label="Roundabouts" selected multi onPress={() => {}} />);
  expect(screen.getByTestId("r").props.accessibilityRole).toBe("checkbox");
});

test("a row carries its selected state for assistive tech", () => {
  render(<ChoiceRow testID="r" label="Roundabouts" selected onPress={() => {}} />);
  expect(screen.getByTestId("r").props.accessibilityState).toMatchObject({ checked: true });
});

test("only a chosen row shows its tick", () => {
  const { rerender } = render(<ChoiceRow testID="r" label="Roundabouts" selected onPress={() => {}} />);
  expect(screen.getByTestId("choice-tick")).toBeTruthy();
  rerender(<ChoiceRow testID="r" label="Roundabouts" selected={false} onPress={() => {}} />);
  expect(screen.queryByTestId("choice-tick")).toBeNull();
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/ui/__tests__/questionCard.test.tsx`
Expected: FAIL — cannot resolve `../QuestionCard`.

- [ ] **Step 3: Implement**

Create `src/ui/QuestionCard.tsx`:

```tsx
import { Children, isValidElement, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { body, caption, largeTitle, subheadline, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * One card of the sign-up interview: a question, the reason for asking, and
 * whatever answers it.
 *
 * Presentational only. It does not store an answer, does not know which card
 * it is, and does not advance — the screen owns all three, which is what lets
 * a card be rendered before its options have loaded.
 *
 * The heading enters first and each child follows one stagger behind, so the
 * question is readable before the answers arrive rather than the whole card
 * landing at once.
 */
export function QuestionCard({
  title, subtitle, children,
}: { title: string; subtitle: string; children?: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View style={{ flex: 1 }}>
      <Animated.Text
        entering={enterFrom(0)}
        maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
        style={{ ...largeTitle, color: colors.label, paddingHorizontal: 16, paddingTop: 6 }}
      >
        {title}
      </Animated.Text>
      <Animated.Text
        entering={enterFrom(1)}
        maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
        style={{ ...subheadline, color: colors.labelSecondary, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }}
      >
        {subtitle}
      </Animated.Text>
      {rows.map((row, i) => (
        // Index keys: these are static children in source order, not a
        // reorderable list.
        <Animated.View key={i} entering={enterFrom(i + 2)}>{row}</Animated.View>
      ))}
    </View>
  );
}

/**
 * One answer.
 *
 * The role is `radio` or `checkbox` rather than `button` because the two are
 * announced differently and behave differently: a multi-select reporting
 * itself as a radio tells a screen reader user their previous choice was
 * replaced when it was not.
 */
export function ChoiceRow({
  label, sub, selected, multi = false, onPress, testID,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  multi?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      onPress={onPress}
      style={{
        minHeight: 44, paddingHorizontal: 16, paddingVertical: 13,
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: colors.cell,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
          style={{ ...body, color: colors.label, fontWeight: selected ? "600" : body.fontWeight }}
        >
          {label}
        </Text>
        {sub && (
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...caption, color: colors.labelSecondary, marginTop: 1 }}>
            {sub}
          </Text>
        )}
      </View>
      {selected && <Ionicons testID="choice-tick" name="checkmark" size={19} color={colors.accent} />}
    </Pressable>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/ui/__tests__/questionCard.test.tsx` — expect PASS, six tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/QuestionCard.tsx src/ui/__tests__/questionCard.test.tsx
git commit -m "feat: add the question card and its choice rows"
```

---

### Task 12: signUp carries the profile

**Files:**
- Modify: `src/stores/sessionStore.ts`
- Test: `src/stores/__tests__/sessionStore.test.ts`

**Interfaces:**
- Consumes: `toMetadata` (Task 8).
- Produces: `signUp(email: string, password: string, metadata: Record<string, unknown>) => Promise<string | null>`, plus `selectHomeCentreId`, `selectTestDate`, `selectExperience`, `selectFocus`.

**Breaking change:** the third parameter was an optional `name`. It is now the metadata object, which is what `toMetadata` returns. `sign-up.tsx` is the only caller and is rewritten in Task 13.

- [ ] **Step 1: Write the failing test**

Append to `src/stores/__tests__/sessionStore.test.ts`:

```ts
import { selectExperience, selectFocus, selectHomeCentreId, selectTestDate } from "../sessionStore";

test("signUp carries the interview's answers with it", async () => {
  (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({ data: {}, error: null });
  const metadata = {
    full_name: "Sumeet", home_centre_id: "c-1",
    test_date: "2026-09-24", experience: "ready", focus: ["zebra"],
  };
  expect(await useSession.getState().signUp(" A@B.com ", "hunter2hunter2", metadata)).toBeNull();
  expect(supabase.auth.signUp).toHaveBeenCalledWith({
    email: "a@b.com",
    password: "hunter2hunter2",
    options: { data: metadata },
  });
});

test("a failed signUp reports a sentence", async () => {
  (supabase.auth.signUp as jest.Mock)
    .mockResolvedValueOnce({ data: {}, error: { message: "User already registered" } });
  expect(await useSession.getState().signUp("a@b.com", "pw", {}))
    .toBe("There's already an account with that email. Sign in instead, or reset the password.");
});

// user_metadata is free-form and every account created before this shipped has
// none of these keys. Every reader narrows, exactly as selectFullName does.
test("the selectors narrow whatever user_metadata actually holds", () => {
  useSession.setState({
    session: { user: { user_metadata: { home_centre_id: "c-1", test_date: "2026-09-24", experience: "ready", focus: ["zebra", "narrow"] } } },
  } as never);
  const s = useSession.getState();
  expect(selectHomeCentreId(s)).toBe("c-1");
  expect(selectTestDate(s)).toBe("2026-09-24");
  expect(selectExperience(s)).toBe("ready");
  expect(selectFocus(s)).toEqual(["zebra", "narrow"]);
});

test("an account that predates the interview reads as empty, not as broken", () => {
  useSession.setState({ session: { user: { user_metadata: {} } } } as never);
  const s = useSession.getState();
  expect(selectHomeCentreId(s)).toBeNull();
  expect(selectTestDate(s)).toBeNull();
  expect(selectExperience(s)).toBeNull();
  expect(selectFocus(s)).toEqual([]);
});

// Metadata is a free-form bag; a wrong type in it must not reach a screen.
test("a value of the wrong shape is discarded rather than passed on", () => {
  useSession.setState({
    session: { user: { user_metadata: { home_centre_id: 42, experience: "astronaut", focus: "zebra" } } },
  } as never);
  const s = useSession.getState();
  expect(selectHomeCentreId(s)).toBeNull();
  expect(selectExperience(s)).toBeNull();
  expect(selectFocus(s)).toEqual([]);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/stores/__tests__/sessionStore.test.ts`
Expected: FAIL — `selectHomeCentreId is not a function`, and `signUp` called with the old shape.

- [ ] **Step 3: Implement**

In `src/stores/sessionStore.ts`, change the `signUp` signature in the `SessionState` type:

```ts
  signUp: (email: string, password: string, metadata: Record<string, unknown>) => Promise<string | null>;
```

Replace the `signUp` implementation and its comment:

```ts
  // Everything the interview collected rides in user_metadata beside the name.
  // Same argument as the name itself: a table would need a row, a policy and a
  // migration to hold four scalars that belong to the account.
  //
  // The answers come with the call rather than after it because email
  // confirmation means this returns no session — there would be nobody to
  // write a profile to until the learner confirms and returns.
  signUp: async (email, password, metadata) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: metadata },
    });
    return error ? authErrorMessage(error.message) : null;
  },
```

Add the selectors beside `selectFullName`, after it:

```ts
import type { Experience, Focus } from "@/lib/onboarding";

/**
 * The interview's answers, narrowed.
 *
 * `user_metadata` is a free-form bag: Supabase hands back whatever was written
 * to it, including nothing at all for every account created before the
 * interview shipped, and including a value of the wrong shape if anything ever
 * writes one. Each of these returns the empty answer rather than trusting it —
 * the same discipline `selectFullName` already applies.
 */
const FOCUS_VALUES: readonly string[] = ["roundabout", "junction", "narrow", "zebra"];
const EXPERIENCE_VALUES: readonly string[] = ["starting", "progressing", "ready"];

function meta(s: SessionState): Record<string, unknown> {
  return (s.session?.user?.user_metadata as Record<string, unknown> | undefined) ?? {};
}

export function selectHomeCentreId(s: SessionState): string | null {
  const v = meta(s).home_centre_id;
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function selectTestDate(s: SessionState): string | null {
  const v = meta(s).test_date;
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function selectExperience(s: SessionState): Experience | null {
  const v = meta(s).experience;
  return typeof v === "string" && EXPERIENCE_VALUES.includes(v) ? (v as Experience) : null;
}

export function selectFocus(s: SessionState): Focus[] {
  const v = meta(s).focus;
  if (!Array.isArray(v)) return [];
  return v.filter((f): f is Focus => typeof f === "string" && FOCUS_VALUES.includes(f));
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/stores/__tests__/sessionStore.test.ts` — expect PASS.
Run: `npx tsc --noEmit` — expect one error, in `app/(auth)/sign-up.tsx`, for the old third argument. That is Task 13.

- [ ] **Step 5: Commit**

```bash
git add src/stores/sessionStore.ts src/stores/__tests__/sessionStore.test.ts
git commit -m "feat: carry the interview's answers through signUp"
```

---

### Task 13: The five-card flow

**Files:**
- Modify: `app/(auth)/sign-up.tsx` (full rewrite)
- Test: `src/ui/__tests__/signUpFlow.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 6–12, plus `listCentres` from `src/services/centresRepo.ts` and `Group` from `src/ui/List.tsx`.

This is the task that matters most. Its test asserts the **contract** — that the metadata reaching `signUp` is exactly what `toMetadata` produced — not the pixels.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/signUpFlow.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/services/centresRepo", () => ({
  listCentres: jest.fn().mockResolvedValue({
    data: [
      { id: "c-1", name: "Mill Hill", address: "London NW7", lat: 0, lng: 0, pass_rate: null, pass_rate_history: [], test_types: [], region: null },
      { id: "c-2", name: "Barnet", address: "London EN5", lat: 0, lng: 0, pass_rate: null, pass_rate_history: [], test_types: [], region: null },
    ],
    stale: false,
  }),
}));

// eslint-disable-next-line import/first
import SignUp from "../../../app/(auth)/sign-up";
// eslint-disable-next-line import/first
import { useSession } from "@/stores/sessionStore";

const signUp = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  signUp.mockResolvedValue(null);
  useSession.setState({ signUp } as never);
});

/** Cards 1–4, leaving the flow on the account card. */
const answerEverything = async () => {
  fireEvent.press(await screen.findByText("Mill Hill"));
  fireEvent.press(await screen.findByText("Not yet"));
  fireEvent.press(await screen.findByText("Nearly test-ready"));
  fireEvent.press(await screen.findByText("Roundabouts"));
  fireEvent.press(screen.getByText("Continue"));
  return screen.findByText("Last thing.");
};

test("it opens on the first question, not on a form", async () => {
  render(<SignUp />);
  expect(await screen.findByText("Where are you testing?")).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
});

test("the centre list is searchable", async () => {
  render(<SignUp />);
  await screen.findByText("Mill Hill");
  fireEvent.changeText(screen.getByLabelText("Search centres"), "barn");
  expect(screen.getByText("Barnet")).toBeTruthy();
  expect(screen.queryByText("Mill Hill")).toBeNull();
});

// Cards 1-3 advance themselves; a multi-select cannot, or a second choice
// would be impossible.
test("choosing a centre moves on by itself", async () => {
  render(<SignUp />);
  fireEvent.press(await screen.findByText("Mill Hill"));
  expect(await screen.findByText("Have you booked it?")).toBeTruthy();
});

test("the weak-spots card waits, because two answers are allowed", async () => {
  render(<SignUp />);
  fireEvent.press(await screen.findByText("Mill Hill"));
  fireEvent.press(await screen.findByText("Not yet"));
  fireEvent.press(await screen.findByText("Nearly test-ready"));
  fireEvent.press(await screen.findByText("Roundabouts"));
  expect(screen.getByText("Roundabouts")).toBeTruthy();
  expect(screen.queryByText("Last thing.")).toBeNull();
});

test("going back keeps what was already answered", async () => {
  render(<SignUp />);
  fireEvent.press(await screen.findByText("Mill Hill"));
  await screen.findByText("Have you booked it?");
  fireEvent.press(screen.getByLabelText("Back"));
  expect(await screen.findByText("Where are you testing?")).toBeTruthy();
  fireEvent.press(screen.getByText("Mill Hill"));
  expect(await screen.findByText("Have you booked it?")).toBeTruthy();
});

test("the account card will not submit until both passwords match", async () => {
  render(<SignUp />);
  await answerEverything();
  fireEvent.changeText(screen.getByLabelText("Email address"), "a@b.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter2");
  fireEvent.press(screen.getByText("Create account"));
  await waitFor(() => expect(signUp).not.toHaveBeenCalled());
  fireEvent.changeText(screen.getByLabelText("Confirm password"), "hunter2hunter2");
  fireEvent.press(screen.getByText("Create account"));
  await waitFor(() => expect(signUp).toHaveBeenCalled());
});

// The contract, and the reason this file exists. Everything the four cards
// collected must arrive under the names the schema and the selectors expect.
test("every answer reaches signUp under its stored name", async () => {
  render(<SignUp />);
  await answerEverything();
  fireEvent.changeText(screen.getByLabelText("First name (optional)"), "Sumeet");
  fireEvent.changeText(screen.getByLabelText("Email address"), "a@b.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter2");
  fireEvent.changeText(screen.getByLabelText("Confirm password"), "hunter2hunter2");
  fireEvent.press(screen.getByText("Create account"));

  await waitFor(() => expect(signUp).toHaveBeenCalledWith("a@b.com", "hunter2hunter2", {
    full_name: "Sumeet",
    home_centre_id: "c-1",
    test_date: null,
    experience: "ready",
    focus: ["roundabout"],
  }));
});

test("success replaces the form rather than annotating it", async () => {
  render(<SignUp />);
  await answerEverything();
  fireEvent.changeText(screen.getByLabelText("Email address"), "a@b.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter2");
  fireEvent.changeText(screen.getByLabelText("Confirm password"), "hunter2hunter2");
  fireEvent.press(screen.getByText("Create account"));
  expect(await screen.findByText("Check your email")).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
});

test("a rejected sign-up keeps the form and states the reason", async () => {
  signUp.mockResolvedValue("There's already an account with that email. Sign in instead, or reset the password.");
  render(<SignUp />);
  await answerEverything();
  fireEvent.changeText(screen.getByLabelText("Email address"), "a@b.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter2");
  fireEvent.changeText(screen.getByLabelText("Confirm password"), "hunter2hunter2");
  fireEvent.press(screen.getByText("Create account"));
  expect(await screen.findByText(/already an account/)).toBeTruthy();
  expect(screen.getByLabelText("Email address")).toBeTruthy();
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/ui/__tests__/signUpFlow.test.tsx`
Expected: FAIL — `Where are you testing?` not found; the old four-field form renders.

- [ ] **Step 3: Implement**

Replace `app/(auth)/sign-up.tsx` entirely:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { listCentres } from "@/services/centresRepo";
import type { Centre } from "@/types/db";
import {
  canAdvance, EMPTY_ANSWERS, EXPERIENCE_OPTIONS, FOCUS_OPTIONS,
  toggleFocus, toMetadata, TOTAL_STEPS, type Answers,
} from "@/lib/onboarding";
import { MIN_PASSWORD, passwordStrength } from "@/lib/passwordStrength";
import { AuthField } from "@/ui/AuthField";
import { Group } from "@/ui/List";
import { ChoiceRow, QuestionCard } from "@/ui/QuestionCard";
import { StrengthMeter } from "@/ui/StrengthMeter";
import { ENTER_MS, enterFrom, popIn, stepBack, stepExit, stepForward, timing } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { caption, footnote, headline, subheadline, title2, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

/**
 * Sign-up, as five cards rather than one form.
 *
 * Four questions, then the account. The order is not a style choice: Supabase
 * email confirmation is on, so `signUp()` returns no session, and there is
 * nobody to write a profile to until the learner confirms and returns in a
 * later session. Asking first lets one call carry everything.
 *
 * One route rather than five, because the answers have to survive until that
 * call regardless — route-per-step would only push the same state into a store
 * and churn the router five times per sign-up.
 *
 * Cards 1–3 advance themselves once the choice has landed. Card 4 cannot: it
 * allows two answers, so jumping on the first would make the second
 * unreachable.
 */

/** How long a selection is allowed to be seen before the card moves on. */
const SETTLE_MS = ENTER_MS;

export default function SignUp() {
  const router = useRouter();
  const signUp = useSession((s) => s.signUp);

  const [step, setStep] = useState(0);
  const [goingBack, setGoingBack] = useState(false);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [done, setDone] = useState(false);

  const [centres, setCentres] = useState<Centre[]>([]);
  const [query, setQuery] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<TextInput>(null);

  const reduced = useReducedMotion();
  const progress = useSharedValue(1 / TOTAL_STEPS);

  useEffect(() => {
    // `test_centres` grants select to anon, so this works with no session. The
    // cache is national rather than per-user, so a device that has ever loaded
    // the list shows it instantly, offline included.
    listCentres().then((c) => setCentres(c.data)).catch(() => setCentres([]));
  }, []);

  useEffect(() => {
    const target = (step + 1) / TOTAL_STEPS;
    progress.value = reduced ? target : withTiming(target, timing(ENTER_MS));
  }, [step, reduced, progress]);

  const goBack = useCallback(() => {
    setGoingBack(true);
    setStep((s) => Math.max(0, s - 1));
  }, []);

  // Without this, Android's back button leaves the flow and discards four
  // answers. It was harmless while sign-up was one form; it is not now.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (done || step === 0) return false;
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [step, done, goBack]);

  const advance = () => {
    setGoingBack(false);
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  };

  /** A choice on a single-answer card: acknowledge it, let it be seen, move on. */
  const chooseAndAdvance = (patch: Partial<Answers>) => {
    Haptics.selectionAsync();
    setAnswers((a) => ({ ...a, ...patch }));
    setTimeout(advance, reduced ? 0 : SETTLE_MS);
  };

  const strength = passwordStrength(password);
  const canCreate =
    email.includes("@") && password.length >= MIN_PASSWORD && confirm === password && !busy;

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    const err = await signUp(email.trim(), password, toMetadata(answers, name));
    setBusy(false);
    if (err) { setError(err); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
    else setDone(true);
  };

  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  if (done) {
    const centre = centres.find((c) => c.id === answers.centreId);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.field, alignItems: "center", justifyContent: "center" }}>
        <Animated.View entering={popIn()} style={{ height: 64, width: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="checkmark" size={34} color="#FFFFFF" />
        </Animated.View>
        <Animated.Text entering={enterFrom(1)} maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...title2, color: colors.label, paddingTop: 22 }}>
          Check your email
        </Animated.Text>
        <Animated.Text entering={enterFrom(2)} maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary, textAlign: "center", paddingHorizontal: 30, paddingTop: 8 }}>
          {centre
            ? `We've sent a confirmation link to your address. Open it, then sign in — ${centre.name} will be waiting.`
            : "We've sent a confirmation link to your address. Open it, then sign in."}
        </Animated.Text>
        <Animated.View entering={enterFrom(3)} style={{ paddingTop: 26 }}>
          <Pressable accessibilityRole="button" onPress={() => router.replace("/(auth)/sign-in")} style={{ minHeight: 44, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" }}>
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: colors.accentPressed }}>Back to sign in</Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    );
  }

  const shown = query
    ? centres.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : centres;

  const action = (label: string, enabled: boolean, onPress: () => void) => (
    <View style={{ paddingTop: 18 }}>
      <Pressable
        accessibilityRole="button" disabled={!enabled} onPress={onPress}
        style={{ marginHorizontal: 16, minHeight: 50, borderRadius: 12, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, opacity: enabled ? 1 : 0.35 }}
      >
        {busy && <ActivityIndicator color="#FFFFFF" />}
        <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: "#FFFFFF" }}>{label}</Text>
      </Pressable>
    </View>
  );

  const card = () => {
    if (step === 0) {
      return (
        <QuestionCard title="Where are you testing?" subtitle="We'll open the app on that centre's real routes.">
          <View style={{ marginHorizontal: 16, marginBottom: 10, height: 36, borderRadius: 10, backgroundColor: colors.fill, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, gap: 7 }}>
            <Ionicons name="search" size={15} color={colors.labelTertiary} />
            <TextInput
              accessibilityLabel="Search centres"
              style={{ ...subheadline, flex: 1, color: colors.label, padding: 0 }}
              placeholder="Search centres" placeholderTextColor={colors.labelTertiary}
              value={query} onChangeText={setQuery} autoCorrect={false}
            />
          </View>
          <Group>
            {shown.map((c) => (
              <ChoiceRow
                key={c.id} testID={`centre-${c.id}`} label={c.name} sub={c.address}
                selected={answers.centreId === c.id}
                onPress={() => chooseAndAdvance({ centreId: c.id })}
              />
            ))}
          </Group>
        </QuestionCard>
      );
    }

    if (step === 1) {
      return (
        <QuestionCard title="Have you booked it?" subtitle="A date turns Home into a countdown. You can add one later.">
          <Group>
            <ChoiceRow
              label="Yes, it's booked" selected={answers.booked === true}
              onPress={() => { Haptics.selectionAsync(); setAnswers((a) => ({ ...a, booked: true })); }}
            />
            <ChoiceRow
              label="Not yet" selected={answers.booked === false}
              onPress={() => chooseAndAdvance({ booked: false, testDate: null })}
            />
          </Group>
          {answers.booked === true && (
            <Animated.View entering={enterFrom(0)} style={{ paddingTop: 12 }}>
              <DateTimePicker
                testID="test-date"
                value={answers.testDate ? new Date(answers.testDate) : new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                minimumDate={new Date()}
                onChange={(_e, d) => {
                  if (d) setAnswers((a) => ({ ...a, testDate: d.toISOString().slice(0, 10) }));
                }}
              />
            </Animated.View>
          )}
          {canAdvance(1, answers) && action("Continue", true, advance)}
        </QuestionCard>
      );
    }

    if (step === 2) {
      return (
        <QuestionCard title="How much have you driven?" subtitle="This sets whether we start you on a practice drive or a mock test.">
          <Group>
            {EXPERIENCE_OPTIONS.map((o) => (
              <ChoiceRow
                key={o.id} testID={`experience-${o.id}`} label={o.label} sub={o.sub}
                selected={answers.experience === o.id}
                onPress={() => chooseAndAdvance({ experience: o.id })}
              />
            ))}
          </Group>
        </QuestionCard>
      );
    }

    if (step === 3) {
      const n = answers.focus.length;
      return (
        <QuestionCard title="What trips you up?" subtitle="Pick up to two. Routes with those come first.">
          <Group>
            {FOCUS_OPTIONS.map((o) => (
              <ChoiceRow
                key={o.id} testID={`focus-${o.id}`} label={o.label} sub={o.sub} multi
                selected={answers.focus.includes(o.id)}
                onPress={() => {
                  Haptics.selectionAsync();
                  setAnswers((a) => ({ ...a, focus: toggleFocus(a.focus, o.id) }));
                }}
              />
            ))}
          </Group>
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...caption, color: colors.labelTertiary, textAlign: "center", paddingTop: 10 }}>
            {n === 0 ? "Choose one or two" : n === 1 ? "One more, or continue" : "That's two — tap one to swap it"}
          </Text>
          {action("Continue", canAdvance(3, answers), advance)}
        </QuestionCard>
      );
    }

    return (
      <QuestionCard title="Last thing." subtitle="So your progress is here next time you open the app.">
        <Group style={error ? { borderWidth: 1.5, borderColor: colors.danger } : undefined}>
          <AuthField placeholder="First name (optional)" kind="name" value={name} onChangeText={setName} />
          <AuthField placeholder="Email address" kind="email" value={email} onChangeText={(v) => { if (error) setError(null); setEmail(v); }} />
          <AuthField
            placeholder="Password" kind="newPassword" value={password}
            onChangeText={(v) => { if (error) setError(null); setPassword(v); }}
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
        </Group>
        <StrengthMeter strength={strength} />
        {/* Nothing to confirm until there is a password worth confirming. */}
        {password.length >= MIN_PASSWORD && (
          <Animated.View entering={enterFrom(0)} style={{ paddingTop: 12 }}>
            <Group>
              <AuthField
                placeholder="Confirm password" kind="newPassword" inputRef={confirmRef}
                value={confirm} onChangeText={setConfirm} returnKeyType="done" onSubmitEditing={create}
              />
            </Group>
          </Animated.View>
        )}
        {error && (
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.danger, paddingHorizontal: 20, paddingTop: 10 }}>
            {error}
          </Text>
        )}
        {action(busy ? "Creating account…" : "Create account", canCreate, create)}
      </QuestionCard>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.field }}>
      <View style={{ height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 12 }}>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}
          onPress={() => (step === 0 ? router.back() : goBack())}
        >
          <Ionicons name="chevron-back" size={22} color={colors.accentPressed} />
        </Pressable>
        <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.fill, overflow: "hidden", marginRight: 16 }}>
          <Animated.View testID="progress-fill" style={[{ height: "100%", borderRadius: 2, backgroundColor: colors.accent }, bar]} />
        </View>
        <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.labelTertiary, fontVariant: ["tabular-nums"] }}>
          {step + 1} of {TOTAL_STEPS}
        </Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: "padding", android: "height" })}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {/* Keying on the step is what makes Reanimated treat each card as a
              new element, so the exit and the entrance both run. */}
          <Animated.View
            key={step}
            entering={goingBack ? stepBack() : stepForward()}
            exiting={stepExit(goingBack)}
            style={{ flex: 1 }}
          >
            {card()}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/ui/__tests__/signUpFlow.test.tsx` — expect PASS, nine tests.

If the auto-advance tests are flaky, the cause is `setTimeout` inside `chooseAndAdvance`. Add `jest.useFakeTimers()` and advance them explicitly rather than lengthening the waits — a test that passes by waiting longer will fail on a slower machine.

- [ ] **Step 5: Run everything**

Run: `npm test` — expect green.
Run: `npx tsc --noEmit` — expect clean; the Task 12 error is now resolved.
Run: `npm run lint` — expect 0 errors and no new warnings in touched files.

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/sign-up.tsx" src/ui/__tests__/signUpFlow.test.tsx
git commit -m "feat: make sign-up a five-card interview"
```

---

## Verification

Green tests are not the deliverable. On a device:

| Check | Expected |
|---|---|
| Sign in with a wrong password | A written sentence, a danger outline, one error haptic. **Nothing moves back and forth.** |
| Type again after that failure | Outline and message clear |
| iOS Keychain on sign-in | Fills both fields in one tap |
| iOS on the account card | Offers a generated strong password |
| Sign-up on Android, keyboard up | The action is reachable on every card |
| Android hardware back, mid-flow | Previous card, answers intact |
| Back from card 1 | Leaves to sign-in |
| Text size at maximum | Display type caps at 1.1×; body copy scales |
| Reduce Motion on | Nothing travels — including the meter, the progress bar and the card transitions |
| Complete a sign-up | Supabase → Authentication → the new user → `raw_user_meta_data` holds all five keys |
| Forgot password | The email arrives and its link opens the app |

**The metadata check is the one that cannot be faked by a mock**, and it is the whole point of half two. A green `signUpFlow.test.tsx` proves the screen calls `signUp` correctly; only the dashboard proves Supabase stored it.

## Deferred — do not start these here

- **Reading the four answers.** Centres opening on `home_centre_id`, a countdown on Home, `experience` choosing the first suggestion, `focus` sorting routes by hazard. The selectors are built and tested in Task 12; the screens that consume them are separate work. Shipping the write first is deliberate — it starts collecting real answers while those screens are built.
- **Sign in with Apple.** Adding one third-party provider triggers App Store rule 4.8.
- **Parking and manoeuvre weak spots.** Needs a route ↔ manoeuvre relation that does not exist.
- **Migrating Centres, Result and the route screens** onto the grouped-inset language.
