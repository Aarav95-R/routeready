import { confirmDestructive, CONFIRM_FLAG } from "../confirm";

// push.ts opens with "truncate test_centres, manoeuvres, show_me_tell_me
// restart identity cascade" against whatever database the environment happens
// to point at. Cascade reaches routes and hazards. The only thing between a
// stale PGHOST and an emptied production table was remembering which shell you
// were in.

test("without the flag it refuses, and says what it would have destroyed", () => {
  const refusal = confirmDestructive([], { PGHOST: "db.prod.supabase.co" });

  expect(refusal).not.toBeNull();
  expect(refusal).toContain("db.prod.supabase.co");
  expect(refusal).toContain(CONFIRM_FLAG);
});

test("with the flag it goes ahead", () => {
  expect(confirmDestructive([CONFIRM_FLAG], { PGHOST: "db.prod.supabase.co" })).toBeNull();
});

// A connection string on argv is the other way credentials arrive, and the
// host inside it is the thing worth reading back before saying yes.
test("the host is read out of a connection string too", () => {
  const refusal = confirmDestructive(["postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"], {});

  expect(refusal).toContain("aws-0-eu-west-1.pooler.supabase.com");
});

// A password in a connection string must not be echoed back at the person by
// the very message telling them to be careful.
test("the refusal never repeats the password back", () => {
  const refusal = confirmDestructive(["postgresql://postgres:hunter2secret@host:5432/postgres"], {});

  expect(refusal).not.toContain("hunter2secret");
});

test("an unknown target still names something rather than nothing", () => {
  expect(confirmDestructive([], {})).toContain("unknown");
});
