-- Apple refresh tokens, held for one purpose: revoking them on account deletion.
--
-- Safe to re-run.
--
-- App Store guideline 5.1.1(v) requires that an app offering Sign in with Apple
-- *and* account deletion calls Apple's REST API to revoke the person's tokens
-- when they delete. Reviewers test it.
--
-- The awkward part is that our sign-in flow is the native one: the device hands
-- Supabase an `identityToken` and Supabase issues its own session. No
-- authorization-code exchange ever happens, so no Apple refresh token exists
-- anywhere in the system — and `authorizationCode`, the thing that could buy
-- one, expires about five minutes after sign-in. It cannot be kept until the
-- day somebody decides to delete their account.
--
-- So the exchange happens at sign-in (see `functions/link-apple`) and the
-- refresh token is parked here until it is needed.
--
-- This table holds a live credential for a third-party account, which makes it
-- the most sensitive thing in the database. Two things follow:
--
--   * RLS is on and there are **no policies at all**. That is deliberate, not an
--     oversight — with RLS enabled and no policy, `anon` and `authenticated` can
--     do nothing here whatsoever, and only the service role (which bypasses RLS,
--     and exists only inside Edge Functions) can read or write it. It is the one
--     table in this schema no client may touch.
--   * It is emphatically not `user_metadata`, where the token would be readable
--     — and writable — by the very client it is meant to be kept from.
--
-- `on delete cascade` means the row leaves with the account, so a deletion that
-- gets past the revoke step never leaves an orphaned token behind.
begin;

create table if not exists apple_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Apple's refresh token. Long-lived: it stays valid until revoked, which is
  -- exactly the property this table depends on.
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table apple_credentials enable row level security;

-- No policies. See above — this is the access control, not a missing piece of it.

comment on table apple_credentials is
  'Apple refresh tokens, service-role only, used to satisfy App Store 5.1.1(v) on account deletion. No RLS policies by design.';

commit;
