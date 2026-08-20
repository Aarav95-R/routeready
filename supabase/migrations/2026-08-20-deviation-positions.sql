-- Take the stored GPS positions out of every recorded deviation.
--
-- Safe to re-run.
--
-- `deviations` was written as
--   [{ "atIdx": 214, "lat": 51.7481, "lng": -0.3362, "skippedM": 380, "seconds": 47 }]
-- and lat/lng were the driver's actual position at the moment they rejoined —
-- a real place, off any published route, on a row keyed to a user id. Nothing
-- ever read them back: the result screen renders the count and skippedM, and
-- a map pin would be drawn from `atIdx`, which indexes the route's own public
-- geometry.
--
-- So they were precise location, linked to a named account, collected and
-- retained for no purpose. The app stopped writing them; this takes out the
-- ones already stored.
begin;

update user_progress
set deviations = (
  select coalesce(jsonb_agg(d - 'lat' - 'lng' order by ord), '[]'::jsonb)
  from jsonb_array_elements(deviations) with ordinality as t(d, ord)
)
where deviations is not null
  and jsonb_typeof(deviations) = 'array'
  and exists (
    select 1 from jsonb_array_elements(deviations) as e
    where e ? 'lat' or e ? 'lng'
  );

commit;
