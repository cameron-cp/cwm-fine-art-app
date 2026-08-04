-- Exhibition history: the "EXHIBITED" block that sits between Provenance and
-- Literature on a dealer factsheet.
--
-- Shape is free text, matching `literature` (0003) and deliberately NOT the
-- text[] shape of `provenance_lines`. A single exhibition entry is one long
-- multi-clause sentence — "Santa Fe, Gerald Peters Gallery, Picasso on Paper,
-- Selected Works from the Marina Picasso Collection, August – November 1998,
-- fig. 10, n.p., traveled to Dallas, Gerald Peters Gallery, November – December
-- 1998." — that wraps over several printed lines. provenance_lines' one-line
-- TextField editor and per-line reordering are wrong for that; Literature's
-- paragraph-per-citation shape is exactly right, and it's the convention
-- auction and gallery catalogues already use for Exhibited.
--
-- `if not exists` because 0018–0022 are still in flight locally while this
-- column had to land in the remote DB for the feature to work at all; a later
-- `supabase db push` replaying this file is then a no-op instead of an error.
alter table artworks
  add column if not exists exhibited text;

comment on column artworks.exhibited is
  'Exhibition history, one exhibition per paragraph (blank-line separated). Renders as the tearsheet EXHIBITED section, between Provenance and Literature.';
