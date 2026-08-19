-- The phase breakdown of a practice loop.
--
-- Safe to re-run.
--
-- A route is no longer three waypoints picked off a compass but the six things
-- a driving test contains, in order. Storing the boundaries lets the drive
-- screens name the leg being driven — "independent driving" rather than an
-- anonymous run of turns — and lets the manoeuvre phase be prompted where the
-- route actually passes somewhere it is possible to pull in.
--
-- Shape: [{ "name": "independent", "kind": "dual",
--           "startIdx": 210, "endIdx": 460 }]
--
-- Indices are into the route's own geometry.coordinates. `kind` is the OSM
-- feature that anchored the phase, or "ring" for a synthetic compass point at
-- a centre OpenStreetMap knows nothing about.
--
-- Two phases are absent for centres that have nowhere to put them:
-- "faster-road" where there is no A road or dual carriageway within reach, and
-- "manoeuvre" where there is no street with room to stop. The array is the
-- phases a route actually has, never a fixed six.
begin;

alter table routes add column if not exists phases jsonb default '[]';

commit;
