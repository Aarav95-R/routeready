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
