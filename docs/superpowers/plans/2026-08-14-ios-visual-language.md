# iOS Visual Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the app a real visual language — an iOS text scale, warm neutrals with fixed roles, and a grouped-inset list primitive — and rebuild Home on it.

**Design artifact (this plan's spec):** https://claude.ai/code/artifact/608b7797-e672-4015-8797-15b7de6a9790

**Architecture:** Two new pure modules (`src/ui/type.ts`, `src/ui/List.tsx`) plus additive tokens in `theme.ts`/`tailwind.config.js`. The two Home cards and the screen are re-dressed on top of them. **No logic moves.** `homeView.ts`, `progressRepo.ts`, `FaultBars.tsx` and every test of app behaviour are untouched, and the strings on screen do not change.

**Tech Stack:** React Native (Expo), NativeWind, Reanimated, Jest + `@testing-library/react-native`.

## Global Constraints

- **This is a re-dressing, not a redesign.** The information architecture is settled: diagnosis first, evidence underneath, always an action. No copy changes. No change to `src/lib/**`.
- **Seven text styles, and nothing off the scale.** Large title 34/41/700, Title 2 22/28/700, Headline 17/22/600, Body 17/22/400, Subheadline 15/20/400, Footnote 13/18/600, Caption 13/18/400. A font size not in `src/ui/type.ts` does not ship in the files this plan touches.
- **Tokens are additive.** Do NOT change or delete `colors.primary`, `colors.surface`, or any existing token — other screens still use them and are migrated separately. Add the new roles alongside.
- **Accent appears once per screen:** the action, and the single leading fault bar. Never on values, chevrons, or headers.
- **No shadows** in any file this plan touches. Separation comes from the cell being lighter than the field.
- **Grouped-inset list geometry:** 16pt side margin, 10pt radius, 44pt minimum row height, 1px separator inset 16pt from the leading edge, group header 13pt semibold uppercase tertiary with a 36pt leading inset.
- `src/ui/theme.ts` values must stay twinned with `tailwind.config.js`.
- Run tests with `npx jest <path>`; full suite `npm test`; lint `npm run lint`.
- Never `git commit -a` — this branch carries unrelated staged deletions. `git add` explicit paths. `app/(tabs)/index.tsx` needs quoting in a shell.

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/type.ts` | New. The seven text styles, as style objects. The single source of every font size. |
| `src/ui/theme.ts` + `tailwind.config.js` | Gain the seven new colour roles. Nothing removed. |
| `src/ui/List.tsx` | New. `GroupHeader`, `Group`, `Cell` — the grouped-inset list primitive. |
| `src/ui/NextStepCard.tsx` | Re-dressed onto `Group` + `type`. Copy and props unchanged. |
| `src/ui/RecordCard.tsx` | Re-dressed. The 62pt figure becomes 34pt; the chart moves inline beside it. |
| `app/(tabs)/index.tsx` | Large title replaces the greeting block. Shadows and the finding line go. |

---

### Task 1: The type scale and the colour roles

**Files:** Create `src/ui/type.ts`; modify `src/ui/theme.ts`, `tailwind.config.js`; create `src/ui/__tests__/type.test.ts`

**Produces:**
- `src/ui/type.ts` exporting `largeTitle`, `title2`, `headline`, `body`, `subheadline`, `footnote`, `caption`, each `{ fontSize: number; lineHeight: number; fontWeight: "400"|"600"|"700"; letterSpacing: number }`, plus `TEXT_STYLES` (an array of all seven) and `MAX_DISPLAY_SCALE = 1.1`.
- `colors.field`, `colors.cell`, `colors.label`, `colors.labelSecondary`, `colors.labelTertiary`, `colors.separator`, `colors.fill`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/type.test.ts`:

```ts
import { TEXT_STYLES, body, caption, footnote, headline, largeTitle, subheadline, title2 } from "../type";
import { colors } from "../theme";

// The point of the scale is that it is closed. A screen reaching for 18.5pt is
// the thing this module exists to prevent, so the set is asserted whole.
test("the scale is exactly the seven iOS styles", () => {
  expect(TEXT_STYLES).toHaveLength(7);
  expect(TEXT_STYLES.map((s) => s.fontSize).sort((a, b) => b - a)).toEqual([34, 22, 17, 17, 15, 13, 13]);
});

test("each style carries the platform's size, leading and weight", () => {
  expect(largeTitle).toMatchObject({ fontSize: 34, lineHeight: 41, fontWeight: "700" });
  expect(title2).toMatchObject({ fontSize: 22, lineHeight: 28, fontWeight: "700" });
  expect(headline).toMatchObject({ fontSize: 17, lineHeight: 22, fontWeight: "600" });
  expect(body).toMatchObject({ fontSize: 17, lineHeight: 22, fontWeight: "400" });
  expect(subheadline).toMatchObject({ fontSize: 15, lineHeight: 20, fontWeight: "400" });
  expect(footnote).toMatchObject({ fontSize: 13, lineHeight: 18, fontWeight: "600" });
  expect(caption).toMatchObject({ fontSize: 13, lineHeight: 18, fontWeight: "400" });
});

// Display type is tracked tighter than body type on iOS; body type is not
// tracked at all. Getting this backwards is what makes large type look loose.
test("only display styles carry negative tracking", () => {
  expect(largeTitle.letterSpacing).toBeLessThan(0);
  expect(title2.letterSpacing).toBeLessThan(0);
  expect(caption.letterSpacing).toBe(0);
});

test("the new colour roles exist and are distinct", () => {
  const roles = [
    colors.field, colors.cell, colors.label, colors.labelSecondary,
    colors.labelTertiary, colors.separator, colors.fill,
  ];
  expect(roles).toEqual(["#F2F0EC", "#FFFFFF", "#1C1917", "#6B635B", "#8A827A", "#E4DFD8", "#EBE7E1"]);
  expect(new Set(roles).size).toBe(7);
});

// The old tokens still dress Centres, Result and the route screens. Removing
// one here would silently repaint every screen this plan does not touch.
test("the existing palette is untouched", () => {
  expect(colors.primary).toBe("#221F1C");
  expect(colors.surface).toBe("#F7F5F1");
  expect(colors.accent).toBe("#059669");
  expect(colors.faultRunner).toBe("#A7C4B6");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/ui/__tests__/type.test.ts`
Expected: FAIL — cannot resolve `../type`.

- [ ] **Step 3: Implement**

Create `src/ui/type.ts`:

```ts
import type { TextStyle } from "react-native";

/**
 * The seven text styles, and the only font sizes allowed on a re-dressed
 * screen.
 *
 * These are Apple's own text styles, not sizes chosen to look right in
 * isolation. That is the whole argument for them: every well-built app on the
 * phone is already using this scale, so matching it is most of what makes an
 * app read as native rather than as a website in a phone frame. Home
 * previously used eight sizes — 30, 18.5, 18, 17, 16.5, 15.5, 14.5, 13 — and
 * not one of them was on it.
 *
 * Tracking is negative on display sizes and zero on body sizes, which is the
 * direction iOS tightens in. Reversing it is what makes large type look loose
 * and small type look cramped.
 */
type Style = Required<Pick<TextStyle, "fontSize" | "lineHeight" | "fontWeight" | "letterSpacing">>;

export const largeTitle: Style = { fontSize: 34, lineHeight: 41, fontWeight: "700", letterSpacing: -0.9 };
export const title2: Style = { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.46 };
export const headline: Style = { fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.41 };
export const body: Style = { fontSize: 17, lineHeight: 22, fontWeight: "400", letterSpacing: -0.41 };
export const subheadline: Style = { fontSize: 15, lineHeight: 20, fontWeight: "400", letterSpacing: -0.17 };
export const footnote: Style = { fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0 };
export const caption: Style = { fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: 0 };

export const TEXT_STYLES: readonly Style[] = [
  largeTitle, title2, headline, body, subheadline, footnote, caption,
];

/**
 * iOS will render the design 130% larger if the phone's text size is turned
 * up. Display type is capped; body copy is left free to scale, because that is
 * what the setting is for.
 */
export const MAX_DISPLAY_SCALE = 1.1;
```

In `src/ui/theme.ts`, add inside the `colors` object, after `faultRunner`, keeping every existing value exactly as it is:

```ts
  // ── The iOS-native roles. Additive: the values above still dress Centres,
  // Result and the route screens, which are migrated separately.
  //
  // A cell separates from the field by being lighter than it. That is the
  // whole mechanism, it is what iOS uses, and it survives a future dark mode
  // where a drop shadow does not.
  /** The grouped field behind every screen that has adopted the language. */
  field: "#F2F0EC",
  /** Every list group and panel sitting on the field. */
  cell: "#FFFFFF",
  label: "#1C1917",
  labelSecondary: "#6B635B",
  /** Values, captions and group headers. */
  labelTertiary: "#8A827A",
  /** Hairlines. Always inset from the leading edge, never full-bleed. */
  separator: "#E4DFD8",
  /** Bar tracks and other inactive ground. */
  fill: "#EBE7E1",
```

In `tailwind.config.js`, add to the `colors` block after `danger`, keeping everything else:

```js
        field: "#F2F0EC",
        cell: "#FFFFFF",
        label: "#1C1917",
        "label-secondary": "#6B635B",
        "label-tertiary": "#8A827A",
        separator: "#E4DFD8",
        fill: "#EBE7E1",
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/ui/__tests__/type.test.ts` — expect PASS, five tests.
Run: `npm test` — expect the full suite still green (367 tests). Nothing was removed, so nothing should break.

- [ ] **Step 5: Commit**

```bash
git add src/ui/type.ts src/ui/__tests__/type.test.ts src/ui/theme.ts tailwind.config.js
git commit -m "feat: add the iOS text scale and the grouped-list colour roles"
```

---

### Task 2: The grouped-inset list

**Files:** Create `src/ui/List.tsx`, `src/ui/__tests__/list.test.tsx`

**Consumes:** `type.ts` and the new colour roles from Task 1.

**Produces:**
- `<GroupHeader>Record</GroupHeader>`
- `<Group>{children}</Group>` — the rounded white container, 16pt inset
- `<Cell label? value? valueStrong? chevron? onPress? testID?>{children?}</Cell>` — a 44pt row; renders `label`/`value` when given, or arbitrary `children` when the row is bespoke. Separators are drawn by `Group` between its children, not by `Cell`, so the last row never carries one.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/list.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Cell, Group, GroupHeader } from "../List";
import { colors } from "../theme";
import { footnote } from "../type";

const flat = (style: unknown) =>
  Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : (style as object);

test("a group is an inset white container on the field", () => {
  render(<Group testID="g"><Cell label="Best" value="88" /></Group>);
  const s = flat(screen.getByTestId("g").props.style);
  expect(s.backgroundColor).toBe(colors.cell);
  expect(s.borderRadius).toBe(10);
  expect(s.marginHorizontal).toBe(16);
});

test("a cell states its label and its value", () => {
  render(<Group><Cell label="Average" value="72" /></Group>);
  expect(screen.getByText("Average")).toBeTruthy();
  expect(screen.getByText("72")).toBeTruthy();
});

// 44pt is the platform's minimum touch target and the reason a list of these
// reads calm rather than cramped.
test("a cell is never shorter than the platform minimum", () => {
  render(<Group><Cell testID="c" label="Best" value="88" /></Group>);
  expect(flat(screen.getByTestId("c").props.style).minHeight).toBe(44);
});

// The inset separator is the single clearest tell between a native list and a
// table drawn in HTML. It must never be full-bleed, and the last row must not
// carry one.
test("separators sit between rows only, inset from the leading edge", () => {
  render(
    <Group>
      <Cell label="Best" value="88" />
      <Cell label="Average" value="72" />
      <Cell label="Mock tests" value="5" />
    </Group>
  );
  const rules = screen.getAllByTestId("separator");
  expect(rules).toHaveLength(2);
  expect(flat(rules[0].props.style).marginLeft).toBe(16);
});

test("a single-row group draws no separator at all", () => {
  render(<Group><Cell label="Best" value="88" /></Group>);
  expect(screen.queryByTestId("separator")).toBeNull();
});

test("a group header is footnote type in the tertiary role", () => {
  render(<GroupHeader>Record</GroupHeader>);
  const s = flat(screen.getByText("Record").props.style);
  expect(s.fontSize).toBe(footnote.fontSize);
  expect(s.color).toBe(colors.labelTertiary);
});

test("a cell carrying children renders them instead of a label row", () => {
  render(<Group><Cell><Text>bespoke</Text></Cell></Group>);
  expect(screen.getByText("bespoke")).toBeTruthy();
});

test("a pressable cell reports its press and shows a chevron", () => {
  const onPress = jest.fn();
  render(<Group><Cell testID="c" label="12 Aug" value="88" chevron onPress={onPress} /></Group>);
  expect(screen.getByTestId("chevron")).toBeTruthy();
  fireEvent.press(screen.getByTestId("c"));
  expect(onPress).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/ui/__tests__/list.test.tsx`
Expected: FAIL — cannot resolve `../List`.

- [ ] **Step 3: Implement**

Create `src/ui/List.tsx`:

```tsx
import { Children, isValidElement, type ReactNode } from "react";
import { Pressable, Text, View, type ViewProps } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/ui/theme";
import { body, footnote, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * The grouped inset list — the structural spine of every re-dressed screen.
 *
 * Specified once, here, because it is the component that carries the platform's
 * feel: 16pt margins, a 10pt radius, 44pt rows, and a hairline inset from the
 * leading edge. That inset is the clearest single tell between a native list
 * and a table drawn in HTML, and it is the reason this is a component rather
 * than a className repeated on six screens.
 *
 * A group draws the separators between its own children rather than each cell
 * drawing its own, which is what keeps the last row of a group clean without
 * every caller having to know its own index.
 */

const SIDE = 16;

export function GroupHeader({ children }: { children: ReactNode }) {
  return (
    <Text
      maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
      style={{
        ...footnote,
        color: colors.labelTertiary,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        paddingHorizontal: SIDE + 20,
        paddingTop: 18,
        paddingBottom: 7,
      }}
    >
      {children}
    </Text>
  );
}

function Separator() {
  return (
    <View
      testID="separator"
      style={{ height: 1, marginLeft: SIDE, backgroundColor: colors.separator }}
    />
  );
}

export function Group({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View
      style={[
        { marginHorizontal: SIDE, backgroundColor: colors.cell, borderRadius: 10, overflow: "hidden" },
        style,
      ]}
      {...rest}
    >
      {rows.map((row, i) => (
        // Index keys are correct here: these are static rows in source order,
        // not a reorderable list.
        <View key={i}>
          {i > 0 && <Separator />}
          {row}
        </View>
      ))}
    </View>
  );
}

export function Cell({
  label, value, valueStrong = false, chevron = false, onPress, children, testID,
}: {
  label?: string;
  value?: string;
  valueStrong?: boolean;
  chevron?: boolean;
  onPress?: () => void;
  children?: ReactNode;
  testID?: string;
}) {
  const inner = children ?? (
    <>
      <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...body, color: colors.label }}>
        {label}
      </Text>
      <View style={{ flex: 1 }} />
      {value !== undefined && (
        <Text
          maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
          style={{
            ...body,
            fontVariant: ["tabular-nums"],
            color: valueStrong ? colors.label : colors.labelTertiary,
            fontWeight: valueStrong ? "600" : body.fontWeight,
          }}
        >
          {value}
        </Text>
      )}
    </>
  );

  const content = (
    <>
      {inner}
      {chevron && (
        <Ionicons
          testID="chevron"
          name="chevron-forward"
          size={16}
          color={colors.labelTertiary}
          style={{ marginLeft: 6, opacity: 0.7 }}
        />
      )}
    </>
  );

  const style = {
    minHeight: 44,
    paddingHorizontal: SIDE,
    paddingVertical: 12,
    flexDirection: "row" as const,
    alignItems: "center" as const,
  };

  if (onPress) {
    return (
      <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={style}>
        {content}
      </Pressable>
    );
  }
  return <View testID={testID} style={style}>{content}</View>;
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/ui/__tests__/list.test.tsx` — expect PASS, eight tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/List.tsx src/ui/__tests__/list.test.tsx
git commit -m "feat: add the grouped inset list"
```

---

### Task 3: Re-dress the two cards

**Files:** Modify `src/ui/NextStepCard.tsx`, `src/ui/RecordCard.tsx`; adjust `src/ui/__tests__/nextStepCard.test.tsx` and `src/ui/__tests__/recordCard.test.tsx` only where an assertion names a style that changed.

**Constraint:** every user-visible string stays identical, and both components keep their exact prop signatures. The existing behavioural assertions must keep passing untouched — if one fails, the re-dressing changed behaviour and that is a bug, not a test to update.

- [ ] **Step 1: Re-dress `NextStepCard`**

Replace the outer `View`'s className with a `Group`, drop the shadow, and move every font size onto `type.ts`:

- Outer container becomes `<Group>` from `@/ui/List`, wrapping one `<Cell>` holding the bespoke content and one `<Cell>` holding the action.
- The card title (`copy.title`) moves **out** of the card and becomes the screen's `<GroupHeader>` — the screen supplies it in Task 4. Remove it from this component and delete `copy.title` from the `Copy` type and every branch of `copyFor`. **Keep every other string exactly as it is.**
- `copy.claim` → `title2` + `colors.label`, `testID="diagnosis"` retained.
- `copy.because` → `subheadline` + `colors.labelSecondary`.
- Baseline tag rows → `subheadline` + `colors.labelSecondary`, separated by `colors.separator` hairlines.
- The action becomes a `Pressable` with `backgroundColor: colors.accent`, `borderRadius: 12`, `paddingVertical: 14`, centred `headline` in white.

`FaultBars` is untouched, but pass it through unchanged — its own sizes are migrated in a follow-up.

- [ ] **Step 2: Re-dress `RecordCard`**

- Outer becomes `<Group>`.
- **The 62pt figure becomes `largeTitle` (34pt)**, in a bespoke `<Cell>` alongside the label `Latest, out of 100` in `subheadline`/`labelSecondary`.
- **The chart moves into that same cell**, trailing, at 112×40, with the delta beneath it. Keep `ScoreSparkline`, keep both end labels' data available — the two date captions move under the chart as one `caption` line reading `14 Jul – 12 Aug`.
- Best / Average / Mock tests become three plain `<Cell label value />` rows. `testID="stat-best"` and `testID="stat-average"` move onto those value `Text`s; keep them.
- Recent tests become `<Cell>` rows with `chevron`, keeping `testID={`history-score-${i}`}`.
- Delete the `/100` tail `Text` — the row label now carries it. Update the one assertion that looks for `/100` to look for `Latest, out of 100`.
- Keep `testID="latest-score"`, `testID="delta"`, `testID="stat-row"` semantics; if `stat-row` no longer wraps anything meaningful, keep it on the `Group` containing the three stat cells.
- The neutral-on-a-drop rule holds: emerald on a rise, `colors.labelTertiary` on a fall. Update the declining-delta test's colour assertions to the new token if it asserted a className.

- [ ] **Step 3: Run tests**

Run: `npx jest src/ui/__tests__/nextStepCard.test.tsx src/ui/__tests__/recordCard.test.tsx`
Expected: PASS. Report every assertion you had to change and why — a changed *behavioural* assertion is a bug.

- [ ] **Step 4: Commit**

```bash
git add src/ui/NextStepCard.tsx src/ui/RecordCard.tsx src/ui/__tests__/nextStepCard.test.tsx src/ui/__tests__/recordCard.test.tsx
git commit -m "feat: re-dress the Home cards on the grouped list"
```

---

### Task 4: Re-dress the screen

**Files:** Modify `app/(tabs)/index.tsx`; adjust `src/ui/__tests__/homeScreen.test.tsx` where it asserts the greeting.

- [ ] **Step 1: Rebuild the header**

- `SafeAreaView` background becomes `colors.field`.
- **The greeting block is deleted** — `greeting`, `firstName`, `finding` and their imports go, along with the `finding` line. In their place: a large-title row reading `Home` in `largeTitle`/`colors.label`, with the settings button as a 36pt circular nav button on the trailing edge (`rgba(28,25,23,.06)` ground, `accessibilityLabel="Settings"` retained).
- `selectFullName` and `useSession` are no longer needed on this screen. Remove them.
- The two cards are preceded by `<GroupHeader>` — `Work on this next` above `NextStepCard`, `Record` above the record group, `Recent tests` above the history group.
- The skeleton state keeps its shape but loses its shadows.

- [ ] **Step 2: Update the screen tests**

Three tests assert the greeting and must go, replaced by one asserting the large title:

```tsx
test("the tab names itself rather than greeting you", async () => {
  render(<Home />);
  expect(await screen.findByText("Home")).toBeTruthy();
  expect(screen.queryByText(/Good (morning|afternoon|evening)/)).toBeNull();
});
```

Delete `greets you by your first name alone`, `an account with no name is greeted by the hour only`, and `the finding under your name is computed from the same rows`. **Every other test in the file must pass untouched** — they assert behaviour, which has not changed.

`greeting`, `firstName` and `finding` stay exported and tested in `homeView.ts`; they are simply no longer rendered on Home. Note that in the commit message.

- [ ] **Step 3: Run everything**

Run: `npx jest src/ui/__tests__/homeScreen.test.tsx` — expect PASS.
Run: `npm test` — expect green.
Run: `npm run lint` — expect 0 errors and no new warnings in touched files.

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/index.tsx" src/ui/__tests__/homeScreen.test.tsx
git commit -m "feat: give Home a large title and drop the greeting"
```

---

## Verification

Run the app and check on device:

| Check | Expected |
|---|---|
| Nothing casts a shadow | Cells separate by being lighter than the field |
| Every group is 16pt from the edge | Matches Settings.app side by side |
| Separators stop 16pt from the left | Never full-bleed |
| Only two things are emerald | The action, and the leading fault bar |
| Text size turned up to max | Display type caps at 1.1×; body copy scales freely |

## Deferred

- Migrating Centres, Result and Settings onto the language. The artifact sizes these as small; they are separate work and must not be started here.
- `FaultBars`' own font sizes are still off-scale. Migrate when Result adopts the language, since both use it.
- Dark mode. The role names are chosen so it is a token swap, but nothing in this plan attempts it.
