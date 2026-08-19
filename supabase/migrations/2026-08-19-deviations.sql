-- Off-route departures, recorded per mock-test run.
--
-- Safe to re-run.
--
-- A deviation is not a DVSA fault. Leaving the examiner's route is not on the
-- marking sheet at all — what gets marked is how you drove while you were off
-- it — so this lives in its own column rather than in `mistakes`, and it never
-- reaches mock_test_score. On the result screen it sits beside the faults, not
-- among them.
--
-- Shape: [{ "atIdx": 214, "lat": 51.7481, "lng": -0.3362,
--           "skippedM": 380, "seconds": 47 }]
--
-- `atIdx` is an index into the route's own geometry.coordinates, which is what
-- lets the result screen put a pin back on the map without storing a second
-- polyline per run.
begin;

alter table user_progress add column if not exists deviations jsonb default '[]';

commit;
